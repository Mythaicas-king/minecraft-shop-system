# MC服务器物品商店系统

一个基于 React + Express + PostgreSQL 的 Minecraft 服务器物品交易平台，支持前台下单、订单查询、后台商品管理、订单处理和多管理员账号。

## 技术栈

- 前端：React + Vite + Axios + React Router + React Hot Toast
- 后端：Node.js + Express + PostgreSQL + JWT + bcryptjs
- 部署：GitHub Pages（前端） + Render Web Service（后端） + Render PostgreSQL（数据库）

## 功能概览

- 前台商品网格、购物车抽屉、订单提交与订单查询
- 后台管理员登录、商品管理、订单发货/取消、管理员账号管理
- 自动生成 `MC-XXXXXXXX` 订单号与 `sk-xxxxxxxx` API Key
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

## GitHub Pages 前端部署

1. 复制生产环境变量模板

```bash
copy client\.env.production.example client\.env.production
```

2. 修改 `client/.env.production`

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com/api
VITE_BASE_PATH=/your-repo-name/
```

3. 发布前端

```bash
cd client
npm run deploy
```

4. 在 GitHub 仓库 `Settings -> Pages` 中选择 `gh-pages` 分支

说明：前端已改为 `HashRouter`，GitHub Pages 上访问后台会是 `#/admin/login` 这种地址，避免刷新 404。

## Render 后端部署

### 1. 创建 Render PostgreSQL

- Render 后台选择 `New -> PostgreSQL`
- 创建完成后复制 `Internal Database URL`

### 2. 创建 Render Web Service

- 连接 GitHub 仓库
- Root Directory：`minecraft-shop-system`
- Build Command：`npm install`
- Start Command：`npm start`

### 3. 配置环境变量

```env
NODE_ENV=production
PORT=10000
JWT_SECRET=replace-with-a-long-random-string
DATABASE_URL=postgresql://...
CORS_ORIGIN=https://your-github-name.github.io
```

如果你用了自定义域名，`CORS_ORIGIN` 可以写多个地址，用英文逗号分隔。

## 默认账户

- 用户名：`admin`
- 密码：`admin123`

首次登录后请尽快在后台修改密码。
