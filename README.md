# MC服务器物品商店系统

一个基于 React + Express + PostgreSQL 的 Minecraft 服务器物品交易平台，支持前台下单、订单查询、用户注册登录、后台商品管理、订单处理、多管理员账号和对象存储图片上传。

## 技术栈

- 前端：React + Vite + Axios + React Router + React Hot Toast
- 后端：Node.js + Express + PostgreSQL + JWT + bcryptjs
- 图片上传：兼容 S3 / Cloudflare R2 的对象存储
- 部署：GitHub Pages（前端） + 腾讯云 Ubuntu/PM2/Nginx（后端） + PostgreSQL（数据库）

## 功能概览

- 前台商品网格、购物车抽屉、订单提交、订单查询、用户注册登录
- 注册与下单内置轻量算术验证码，降低脚本批量滥用风险
- 注册改为邀请码制，每个邀请码只能注册 1 个账号
- 只有登录用户才能加入购物车并提交订单
- 首页、商品目录、意见反馈拆分为独立页面，顶部导航可以一键跳转
- 后台管理员登录、商品管理、订单发货/取消、管理员账号管理、用户搜索与封禁、邀请码生成与分发
- 自动生成 `MC-XXXXXXXX` 订单号与 `sk-xxxxxxxx` API Key
- 已登录用户下单时会自动绑定账号名和游戏ID，后台订单可直接看到关联账号
- 首次启动自动创建默认管理员 `admin / admin123`
- 关键操作日志写入 `data/activity.log`

## 本地运行

1. 创建 PostgreSQL 数据库，并复制环境变量文件

```bash
copy .env.example .env
```

2. 修改 `.env`

```env
PORT=3001
JWT_SECRET=replace-with-a-long-random-string
DATABASE_URL=postgresql://postgres:password@localhost:5432/minecraft_shop
CORS_ORIGIN=http://localhost:5173
S3_BUCKET=
S3_REGION=auto
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
S3_FORCE_PATH_STYLE=false
ORDER_SUBMIT_COOLDOWN_MS=30000
CAPTCHA_TTL_SECONDS=300
```

3. 启动后端 API

```bash
npm install
npm run dev
```

4. 启动前端开发服务器

```bash
cd client
npm install
npm run dev
```

- 前端默认地址：`http://localhost:5173`
- 后端默认地址：`http://localhost:3001`

## 用户账号与验证码流程

- 玩家可以在首页注册普通账号，注册时需要完成一次轻量算术验证码
- 玩家注册时还必须输入后台发放的邀请码，每个邀请码只能使用一次
- 登录后的玩家下单会自动绑定 `username + player_id`，管理员后台订单列表能看到关联账号
- 现在只有登录用户可以加入购物车和提交订单，下单时仍需要完成一次验证码
- 管理员可在后台 `用户管理` 页面按账号名、游戏ID或邮箱搜索，并封禁/解除封禁账号
- 被封禁账号无法继续登录，也无法继续通过该账号下单
- 管理员可在后台 `邀请码管理` 页面批量生成邀请码、填写分发对象备注，并复制邀请码发给玩家
- 玩家可以在 `反馈页` 提交商品、订单或页面建议，反馈会保存到后端数据库

## GitHub Pages 前端部署

1. 复制生产环境变量模板

```bash
copy client\.env.production.example client\.env.production
```

2. 修改 `client/.env.production`

```env
VITE_API_BASE_URL=https://shopapi.alwaysmind.xyz/api
VITE_BASE_PATH=/
```

3. 发布前端

```bash
cd client
npm run deploy
```

4. 在 GitHub 仓库 `Settings -> Pages` 中选择 `gh-pages` 分支

说明：前端已改为 `HashRouter`，GitHub Pages 上访问后台会是 `#/admin/login` 这种地址，避免刷新 404。

## 腾讯云后端部署

### 1. 安装运行环境

- 安装 Node.js、Nginx、PM2、PostgreSQL 客户端
- 项目部署目录示例：`/home/ubuntu/minecraft-shop-system`

### 2. 启动后端 API

```bash
npm install
pm2 start ecosystem.config.js
```

### 3. 配置环境变量

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=replace-with-a-long-random-string
DATABASE_URL=postgresql://...
CORS_ORIGIN=https://Mythaicas-king.github.io,https://alwaysmind.xyz
ORDER_SUBMIT_COOLDOWN_MS=30000
CAPTCHA_TTL_SECONDS=300
```

如果你用了自定义域名，`CORS_ORIGIN` 可以写多个地址，用英文逗号分隔。

说明：

- `ORDER_SUBMIT_COOLDOWN_MS` 控制同一 IP + 游戏ID 的重复下单冷却时间，默认 30 秒
- `CAPTCHA_TTL_SECONDS` 控制前台轻量验证码有效期，默认 300 秒

### 4. 可选：配置对象存储图片上传

如果你想让后台上传的商品图片在服务器重部署后也不丢失，建议配置 S3 兼容对象存储，例如 Cloudflare R2、AWS S3、MinIO 或其他兼容服务。

需要的环境变量：

```env
S3_BUCKET=your-bucket-name
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_PUBLIC_BASE_URL=https://pub-your-bucket.example.com
S3_FORCE_PATH_STYLE=false
```

说明：

- `S3_PUBLIC_BASE_URL` 推荐填写对象存储对外访问域名，这样商品图片会直接保存为长期可访问的公网 URL
- Cloudflare R2 通常使用 `S3_REGION=auto`
- 如果不配置这些变量，系统会退回到本地 `data/uploads`，适合本地开发，但不适合长期生产存储

## 默认账户

- 用户名：`admin`
- 密码：`admin123`

首次登录后请尽快在后台修改密码。

## 部署备注

- 前端发布到 GitHub Pages 时，只推送 `client/dist` 到 `gh-pages`，不要把整个仓库或 `node_modules` 推上去
- `client/public/CNAME` 已固定为 `alwaysmind.xyz`，GitHub Pages 发布后会自动保留自定义域名
- 前端默认会把 `alwaysmind.xyz`、`www.alwaysmind.xyz` 和 `Mythaicas-king.github.io` 的 API 请求指向 `https://shopapi.alwaysmind.xyz/api`
- 如果你使用自定义域名，后端 `CORS_ORIGIN` 需要同时包含 GitHub Pages 域名和自定义域名
- 新增用户账号和验证码功能后，不需要额外第三方密钥；只要后端 `JWT_SECRET` 安全可靠即可
