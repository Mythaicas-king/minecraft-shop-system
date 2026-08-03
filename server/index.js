const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const morgan = require('morgan')
const multer = require('multer')
const { Pool } = require('pg')

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const DATABASE_URL = process.env.DATABASE_URL
const LOG_PATH = path.join(__dirname, '..', 'data', 'activity.log')
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads')
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and set PostgreSQL connection info.')
}

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

app.use(
  cors({
    origin: CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean),
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))
app.use('/uploads', express.static(UPLOAD_DIR))

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin'
      cb(null, `${Date.now()}-${randomFrom('abcdefghijklmnopqrstuvwxyz0123456789', 8)}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true)
    else cb(new Error('仅支持图片文件上传'))
  },
})

function defaultSiteContent() {
  return {
    hero_title: '方块世界补给中心',
    hero_subtitle: '把服务器热卖礼包、补给订单和发货流程，集中到一个像样的商店首页。',
    hero_description: '为生存服、RPG 服、公会服打造的轻量级商城。玩家像逛商店一样下单，管理员在后台手动发货，简单稳定，不折腾支付系统。',
    hero_badge: '轻量级 Minecraft 物品交易平台',
    status_text: '当前商店在线，支持下单与查询',
    featured_label: '热门推荐',
    featured_title: '服务器精品礼包',
    featured_description: '适合在首页展示的重点推荐商品。',
    announcement_title: '商店公告',
    announcement_subtitle: '给玩家一眼就能看到的重要信息。',
    announcements: [
      '新玩家礼包支持自定义备注，可填写附魔需求或职业方向。',
      '订单默认 24 小时内处理，如遇活动高峰将以公告为准。',
      '推荐管理员定期在后台检查待处理订单，避免玩家长时间等待。',
    ],
    feature_title: '为什么适合 MC 服务器',
    feature_subtitle: '轻量、直观、方便服主管理。',
    features: [
      { title: '极速下单', text: '无需支付接口，玩家提交订单后立即拿到订单号与 API Key。' },
      { title: '人工发货', text: '管理员后台审核订单并填写发放指令，适合各类生存与 RPG 服务器。' },
      { title: '状态可追踪', text: '玩家随时使用订单号或 API Key 查询发货进度与备注。' },
    ],
  }
}

function normalizeSiteContent(row) {
  return row?.content || defaultSiteContent()
}

async function query(text, params = []) {
  return pool.query(text, params)
}

async function getRow(text, params = []) {
  const { rows } = await query(text, params)
  return rows[0]
}

async function getRows(text, params = []) {
  const { rows } = await query(text, params)
  return rows
}

async function logAction(action, details = {}) {
  const line = `[${new Date().toISOString()}] ${action} ${JSON.stringify(details)}\n`
  fs.appendFileSync(LOG_PATH, line)
  await query('INSERT INTO activity_logs (action, details) VALUES ($1, $2::jsonb)', [action, JSON.stringify(details)])
}

function randomFrom(chars, length) {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let index = 0; index < length; index += 1) out += chars[bytes[index] % chars.length]
  return out
}

function generateOrderNumber() {
  return `MC-${randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZ123456789', 8)}`
}

function generateApiKey() {
  return `sk-${randomFrom('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 32)}`
}

function createToken(admin) {
  return jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '12h' })
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const [, token] = header.split(' ')
  if (!token) return res.status(401).json({ message: '未登录或Token缺失' })
  try {
    req.admin = jwt.verify(token, JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ message: 'Token无效或已过期' })
  }
}

function normalizeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    image_url: row.image_url,
    is_active: row.is_active,
    created_at: row.created_at,
  }
}

function normalizeOrder(row) {
  return {
    id: row.id,
    order_number: row.order_number,
    api_key: row.api_key,
    player_id: row.player_id,
    items: row.items,
    total_price: row.total_price,
    status: row.status,
    note: row.note,
    email: row.email,
    shipping_instruction: row.shipping_instruction,
    created_at: row.created_at,
    processed_at: row.processed_at,
  }
}

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      player_id TEXT NOT NULL,
      items JSONB NOT NULL,
      total_price INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'shipped', 'cancelled')),
      note TEXT,
      email TEXT,
      shipping_instruction TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS site_content (
      id SERIAL PRIMARY KEY,
      content JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function ensureSeedData() {
  const admin = await getRow('SELECT id FROM admins LIMIT 1')
  if (!admin) {
    const hash = await bcrypt.hash('admin123', 10)
    await query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', ['admin', hash])
    console.log('Created default admin account: admin / admin123. Please change the password after first login.')
    await logAction('default_admin_created', { username: 'admin' })
  }

  const productCount = await getRow('SELECT COUNT(*)::int AS count FROM products')
  if (productCount.count === 0) {
    const demoProducts = [
      ['附魔钻石新手包', '适合新玩家快速开荒，包含钻石装备、食物与基础药水。', 188, 'https://picsum.photos/seed/mc-diamond-kit/900/600', true],
      ['金苹果战备箱', '高强度 PvP 与首领挑战常用补给，主打恢复和容错。', 100, 'https://picsum.photos/seed/mc-golden-apple/900/600', true],
      ['矿工效率工具组', '提供高效率采集体验，适合长期生存服资源积累。', 72, 'https://picsum.photos/seed/mc-miner-bundle/900/600', true],
    ]
    for (const product of demoProducts) {
      await query(
        'INSERT INTO products (name, description, price, image_url, is_active) VALUES ($1, $2, $3, $4, $5)',
        product,
      )
    }
    await logAction('seed_products_created', { count: demoProducts.length })
  }

  const siteContentCount = await getRow('SELECT COUNT(*)::int AS count FROM site_content')
  if (siteContentCount.count === 0) {
    await query('INSERT INTO site_content (content) VALUES ($1::jsonb)', [JSON.stringify(defaultSiteContent())])
  }
}

async function getSiteContent() {
  const row = await getRow('SELECT content FROM site_content ORDER BY id ASC LIMIT 1')
  return normalizeSiteContent(row)
}

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.get('/api/products', async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM products WHERE is_active = TRUE ORDER BY id DESC')
    res.json(rows.map(normalizeProduct))
  } catch {
    res.status(500).json({ message: '获取商品失败' })
  }
})

app.get('/api/site-content', async (req, res) => {
  try {
    res.json(await getSiteContent())
  } catch {
    res.status(500).json({ message: '获取页面内容失败' })
  }
})

app.post('/api/admin/uploads', authRequired, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '未上传文件' })
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
    })
  } catch {
    res.status(500).json({ message: '上传失败' })
  }
})

app.post('/api/orders', async (req, res) => {
  try {
    const { player_id, items, note = '', email = '' } = req.body || {}
    if (!player_id || !String(player_id).trim()) return res.status(400).json({ message: '游戏ID不能为空' })
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: '订单商品不能为空' })

    const productIds = [...new Set(items.map((item) => Number(item.product_id)).filter(Boolean))]
    const products = productIds.length
      ? await getRows('SELECT * FROM products WHERE id = ANY($1::int[])', [productIds])
      : []
    const productMap = new Map(products.map((product) => [product.id, product]))

    const normalizedItems = []
    let totalPrice = 0
    for (const item of items) {
      const product = productMap.get(Number(item.product_id))
      const quantity = Number(item.quantity || 0)
      if (!product || !product.is_active) return res.status(400).json({ message: '商品不存在或已下架' })
      if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: '商品数量必须为正整数' })
      normalizedItems.push({ product_id: product.id, name: product.name, price: product.price, quantity })
      totalPrice += product.price * quantity
    }

    let orderNumber = generateOrderNumber()
    let apiKey = generateApiKey()
    while (await getRow('SELECT 1 FROM orders WHERE order_number = $1 OR api_key = $2', [orderNumber, apiKey])) {
      orderNumber = generateOrderNumber()
      apiKey = generateApiKey()
    }

    await query(
      `INSERT INTO orders
      (order_number, api_key, player_id, items, total_price, status, note, email)
      VALUES ($1, $2, $3, $4::jsonb, $5, 'pending', $6, $7)`,
      [orderNumber, apiKey, String(player_id).trim(), JSON.stringify(normalizedItems), totalPrice, String(note || ''), String(email || '')],
    )

    await logAction('order_created', { orderNumber, playerId: String(player_id).trim(), totalPrice })

    res.status(201).json({
      order_number: orderNumber,
      api_key: apiKey,
      player_id: String(player_id).trim(),
      items: normalizedItems,
      total_price: totalPrice,
      note: String(note || ''),
      email: String(email || ''),
      status: 'pending',
    })
  } catch {
    res.status(500).json({ message: '提交订单失败' })
  }
})

app.get('/api/orders/query', async (req, res) => {
  try {
    const { order_no, api_key } = req.query
    if (!order_no && !api_key) return res.status(400).json({ message: '请提供订单号或API Key' })
    const row = await getRow('SELECT * FROM orders WHERE order_number = $1 OR api_key = $2', [order_no || '', api_key || ''])
    if (!row) return res.status(404).json({ message: '未找到订单' })
    res.json(normalizeOrder(row))
  } catch {
    res.status(500).json({ message: '查询订单失败' })
  }
})

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' })
    const admin = await getRow('SELECT * FROM admins WHERE username = $1', [username])
    if (!admin) {
      await logAction('admin_login_failed', { username })
      return res.status(401).json({ message: '用户名或密码错误' })
    }
    const ok = await bcrypt.compare(password, admin.password_hash)
    if (!ok) {
      await logAction('admin_login_failed', { username })
      return res.status(401).json({ message: '用户名或密码错误' })
    }
    const token = createToken(admin)
    await logAction('admin_login_success', { username })
    res.json({ token, admin: { id: admin.id, username: admin.username } })
  } catch {
    res.status(500).json({ message: '登录失败' })
  }
})

app.get('/api/admin/site-content', authRequired, async (req, res) => {
  try {
    res.json(await getSiteContent())
  } catch {
    res.status(500).json({ message: '获取页面内容失败' })
  }
})

app.put('/api/admin/site-content', authRequired, async (req, res) => {
  try {
    const nextContent = {
      ...defaultSiteContent(),
      ...(req.body || {}),
    }
    nextContent.announcements = Array.isArray(nextContent.announcements)
      ? nextContent.announcements.map((item) => String(item).trim()).filter(Boolean)
      : defaultSiteContent().announcements
    nextContent.features = Array.isArray(nextContent.features)
      ? nextContent.features
        .map((item) => ({ title: String(item?.title || '').trim(), text: String(item?.text || '').trim() }))
        .filter((item) => item.title && item.text)
      : defaultSiteContent().features

    const existing = await getRow('SELECT id FROM site_content ORDER BY id ASC LIMIT 1')
    if (existing) {
      await query('UPDATE site_content SET content = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(nextContent), existing.id])
    } else {
      await query('INSERT INTO site_content (content) VALUES ($1::jsonb)', [JSON.stringify(nextContent)])
    }
    await logAction('site_content_updated', { admin: req.admin.username })
    res.json(nextContent)
  } catch {
    res.status(500).json({ message: '保存页面内容失败' })
  }
})

app.get('/api/admin/orders', authRequired, async (req, res) => {
  try {
    const { status = 'all' } = req.query
    const rows = status !== 'all'
      ? await getRows('SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC, id DESC', [status])
      : await getRows('SELECT * FROM orders ORDER BY created_at DESC, id DESC')
    res.json(rows.map(normalizeOrder))
  } catch {
    res.status(500).json({ message: '获取订单失败' })
  }
})

app.put('/api/admin/orders/:orderNo/ship', authRequired, async (req, res) => {
  try {
    const { orderNo } = req.params
    const { shipping_instruction } = req.body || {}
    if (!shipping_instruction || !String(shipping_instruction).trim()) return res.status(400).json({ message: '发放指令不能为空' })
    const order = await getRow('SELECT * FROM orders WHERE order_number = $1', [orderNo])
    if (!order) return res.status(404).json({ message: '订单不存在' })
    if (order.status !== 'pending') return res.status(400).json({ message: '仅待处理订单可发货' })
    await query(
      'UPDATE orders SET status = $1, shipping_instruction = $2, processed_at = NOW() WHERE order_number = $3',
      ['shipped', String(shipping_instruction).trim(), orderNo],
    )
    await logAction('order_shipped', { orderNo, admin: req.admin.username })
    res.json({ message: '订单已标记为已发货' })
  } catch {
    res.status(500).json({ message: '发货失败' })
  }
})

app.put('/api/admin/orders/:orderNo/cancel', authRequired, async (req, res) => {
  try {
    const { orderNo } = req.params
    const order = await getRow('SELECT * FROM orders WHERE order_number = $1', [orderNo])
    if (!order) return res.status(404).json({ message: '订单不存在' })
    if (order.status !== 'pending') return res.status(400).json({ message: '仅待处理订单可取消' })
    await query('UPDATE orders SET status = $1, processed_at = NOW() WHERE order_number = $2', ['cancelled', orderNo])
    await logAction('order_cancelled', { orderNo, admin: req.admin.username })
    res.json({ message: '订单已取消' })
  } catch {
    res.status(500).json({ message: '取消失败' })
  }
})

app.get('/api/admin/products', authRequired, async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM products ORDER BY id DESC')
    res.json(rows.map(normalizeProduct))
  } catch {
    res.status(500).json({ message: '获取商品失败' })
  }
})

app.post('/api/admin/products', authRequired, async (req, res) => {
  try {
    const { name, description, price, image_url, is_active = true } = req.body || {}
    if (!name || !description || !image_url || !Number.isInteger(Number(price))) {
      return res.status(400).json({ message: '请填写完整且正确的商品信息' })
    }
    const created = await getRow(
      `INSERT INTO products (name, description, price, image_url, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [String(name).trim(), String(description).trim(), Number(price), String(image_url).trim(), Boolean(is_active)],
    )
    await logAction('product_created', { id: created.id, admin: req.admin.username })
    res.status(201).json(normalizeProduct(created))
  } catch {
    res.status(500).json({ message: '添加商品失败' })
  }
})

app.put('/api/admin/products/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, price, image_url, is_active } = req.body || {}
    const product = await getRow('SELECT * FROM products WHERE id = $1', [id])
    if (!product) return res.status(404).json({ message: '商品不存在' })
    const updated = await getRow(
      `UPDATE products
       SET name = $1, description = $2, price = $3, image_url = $4, is_active = $5
       WHERE id = $6
       RETURNING *`,
      [
        String(name ?? product.name).trim(),
        String(description ?? product.description).trim(),
        Number.isInteger(Number(price)) ? Number(price) : product.price,
        String(image_url ?? product.image_url).trim(),
        typeof is_active === 'boolean' ? is_active : product.is_active,
        id,
      ],
    )
    await logAction('product_updated', { id, admin: req.admin.username })
    res.json(normalizeProduct(updated))
  } catch {
    res.status(500).json({ message: '编辑商品失败' })
  }
})

app.delete('/api/admin/products/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM products WHERE id = $1', [id])
    await logAction('product_deleted', { id, admin: req.admin.username })
    res.json({ message: '商品已删除' })
  } catch {
    res.status(500).json({ message: '删除商品失败' })
  }
})

app.get('/api/admin/admins', authRequired, async (req, res) => {
  try {
    const rows = await getRows('SELECT id, username, created_at FROM admins ORDER BY id ASC')
    res.json(rows)
  } catch {
    res.status(500).json({ message: '获取管理员失败' })
  }
})

app.post('/api/admin/admins', authRequired, async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' })
    const exists = await getRow('SELECT 1 FROM admins WHERE username = $1', [username])
    if (exists) return res.status(400).json({ message: '用户名已存在' })
    const hash = await bcrypt.hash(password, 10)
    const created = await getRow(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [String(username).trim(), hash],
    )
    await logAction('admin_created', { id: created.id, admin: req.admin.username })
    res.status(201).json(created)
  } catch {
    res.status(500).json({ message: '添加管理员失败' })
  }
})

app.delete('/api/admin/admins/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params
    const count = await getRow('SELECT COUNT(*)::int AS count FROM admins')
    if (count.count <= 1) return res.status(400).json({ message: '不能删除最后一个管理员' })
    if (Number(id) === Number(req.admin.id)) return res.status(400).json({ message: '不能删除当前登录管理员' })
    const deleted = await getRow('DELETE FROM admins WHERE id = $1 RETURNING id', [id])
    if (!deleted) return res.status(404).json({ message: '管理员不存在' })
    await logAction('admin_deleted', { id, admin: req.admin.username })
    res.json({ message: '管理员已删除' })
  } catch {
    res.status(500).json({ message: '删除管理员失败' })
  }
})

app.put('/api/admin/admins/:id/password', authRequired, async (req, res) => {
  try {
    const { id } = req.params
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ message: '密码不能为空' })
    const hash = await bcrypt.hash(password, 10)
    const updated = await getRow('UPDATE admins SET password_hash = $1 WHERE id = $2 RETURNING id', [hash, id])
    if (!updated) return res.status(404).json({ message: '管理员不存在' })
    await logAction('admin_password_changed', { id, admin: req.admin.username })
    res.json({ message: '密码已更新' })
  } catch {
    res.status(500).json({ message: '修改密码失败' })
  }
})

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error?.message === '仅支持图片文件上传') {
    return res.status(400).json({ message: error.message })
  }
  return next(error)
})

app.use((req, res) => res.status(404).json({ message: '接口不存在' }))

async function start() {
  await initDatabase()
  await ensureSeedData()
  app.listen(PORT, () => {
    console.log(`Minecraft Shop System API running on http://localhost:${PORT}`)
  })
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
