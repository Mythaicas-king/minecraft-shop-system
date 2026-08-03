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
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3')
const { Pool } = require('pg')

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const DATABASE_URL = process.env.DATABASE_URL
const LOG_PATH = path.join(__dirname, '..', 'data', 'activity.log')
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads')
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
const S3_BUCKET = process.env.S3_BUCKET || ''
const S3_REGION = process.env.S3_REGION || 'auto'
const S3_ENDPOINT = process.env.S3_ENDPOINT || ''
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || ''
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || ''
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || ''
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true'
const ORDER_SUBMIT_COOLDOWN_MS = Number(process.env.ORDER_SUBMIT_COOLDOWN_MS || 30000)
const CAPTCHA_TTL_SECONDS = Number(process.env.CAPTCHA_TTL_SECONDS || 300)
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ADMIN_ROLES = {
  super_admin: 'super_admin',
  operations_admin: 'operations_admin',
  order_admin: 'order_admin',
}

const ADMIN_PERMISSION_MAP = {
  [ADMIN_ROLES.super_admin]: ['all'],
  [ADMIN_ROLES.operations_admin]: ['products', 'users', 'merchants', 'invites', 'feedbacks', 'announcements', 'payouts', 'content'],
  [ADMIN_ROLES.order_admin]: ['orders'],
}

const orderSubmitCooldowns = new Map()

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

const objectStorageEnabled = Boolean(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY && (S3_ENDPOINT || S3_PUBLIC_BASE_URL))

const s3Client = objectStorageEnabled
  ? new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  })
  : null

const upload = multer({
  storage: objectStorageEnabled ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin'
      cb(null, `${Date.now()}-${randomFrom('abcdefghijklmnopqrstuvwxyz0123456789', 8)}${ext}`)
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
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
    featured_product_id: null,
    announcement_title: '商店公告',
    announcement_subtitle: '给玩家一眼就能看到的重要信息。',
    announcements: [
      '新玩家礼包支持自定义备注，可填写附魔需求或职业方向。',
      '订单默认 24 小时内处理，如遇活动高峰将以公告为准。',
      '推荐管理员定期在后台检查待处理订单，避免玩家长时间等待。',
    ],
    feature_title: '为什么适合 MC 服务器',
    feature_subtitle: '轻量、直观、方便服主管理。',
    category_sections: [
      { key: '热门补给', title: '热门补给' },
      { key: '战斗物资', title: '战斗物资' },
      { key: '挖矿工具', title: '挖矿工具' },
    ],
    features: [
      { title: '极速下单', text: '无需支付接口，玩家提交订单后立即拿到订单号与 API Key。' },
      { title: '人工发货', text: '管理员后台审核订单并填写发放指令，适合各类生存与 RPG 服务器。' },
      { title: '状态可追踪', text: '玩家随时使用订单号或 API Key 查询发货进度与备注。' },
    ],
    recharge_bonus_minimum: 0,
    recharge_bonus_amount: 0,
    recharge_notice: '复制报价指令后，请添加管理员并发送支付截图，等待管理员为会员卡入账。',
  }
}

function normalizeSiteContent(row) {
  return row?.content || defaultSiteContent()
}

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function assertOrderSubmitAllowed(req, playerId) {
  const key = `${getRequestIp(req)}:${String(playerId).trim().toLowerCase()}`
  const now = Date.now()
  const lastTime = orderSubmitCooldowns.get(key) || 0
  if (now - lastTime < ORDER_SUBMIT_COOLDOWN_MS) {
    const retryAfter = Math.ceil((ORDER_SUBMIT_COOLDOWN_MS - (now - lastTime)) / 1000)
    return { allowed: false, retryAfter }
  }
  orderSubmitCooldowns.set(key, now)
  if (orderSubmitCooldowns.size > 1000) {
    for (const [entryKey, timestamp] of orderSubmitCooldowns.entries()) {
      if (now - timestamp > ORDER_SUBMIT_COOLDOWN_MS * 10) orderSubmitCooldowns.delete(entryKey)
    }
  }
  return { allowed: true }
}

function buildObjectStorageUrl(key) {
  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
  }
  if (S3_ENDPOINT) {
    return `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${key}`
  }
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`
}

async function persistUpload(file) {
  if (objectStorageEnabled) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin'
    const key = `products/${Date.now()}-${randomFrom('abcdefghijklmnopqrstuvwxyz0123456789', 12)}${ext}`
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
    }))
    return {
      key,
      url: buildObjectStorageUrl(key),
      storage: 'object-storage',
    }
  }

  return {
    key: file.filename,
    url: `/uploads/${file.filename}`,
    storage: 'local',
  }
}

async function query(text, params = []) {
  return pool.query(text, params)
}

async function withTransaction(run) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
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

function createAdminToken(admin) {
  return jwt.sign({ role: 'admin', id: admin.id, username: admin.username, admin_role: admin.admin_role || ADMIN_ROLES.operations_admin }, JWT_SECRET, { expiresIn: '12h' })
}

function createUserToken(user) {
  return jwt.sign({ role: 'user', id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
}

function createCaptchaChallenge(purpose = 'general') {
  const left = crypto.randomInt(2, 10)
  const right = crypto.randomInt(1, 10)
  const operator = crypto.randomInt(0, 2) === 0 ? '+' : '-'
  const answer = operator === '+' ? left + right : left - right
  const token = jwt.sign({ role: 'captcha', purpose, answer }, JWT_SECRET, { expiresIn: `${CAPTCHA_TTL_SECONDS}s` })
  return {
    token,
    prompt: `${left} ${operator} ${right} = ?`,
    expires_in: CAPTCHA_TTL_SECONDS,
  }
}

function verifyCaptchaResponse(token, answer, purpose) {
  if (!token || answer === undefined || answer === null) return false
  try {
    const payload = jwt.verify(String(token), JWT_SECRET)
    if (payload.role !== 'captcha' || payload.purpose !== purpose) return false
    return String(payload.answer) === String(answer).trim()
  } catch {
    return false
  }
}

function parseNonNegativeInt(value) {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < 0) return null
  return normalized
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  const [, token] = header.split(' ')
  return token || ''
}

function authRequired(req, res, next) {
  const token = getBearerToken(req)
  if (!token) return res.status(401).json({ message: '未登录或Token缺失' })
  ;(async () => {
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      if (payload.role !== 'admin') return res.status(401).json({ message: '管理员Token无效' })
      const admin = await getRow('SELECT id, username, admin_role, created_at FROM admins WHERE id = $1', [payload.id])
      if (!admin) return res.status(401).json({ message: '管理员不存在或登录已失效' })
      req.admin = {
        id: admin.id,
        username: admin.username,
        admin_role: admin.admin_role || ADMIN_ROLES.operations_admin,
        created_at: admin.created_at,
      }
      return next()
    } catch {
      return res.status(401).json({ message: 'Token无效或已过期' })
    }
  })()
}

function isRootAdmin(admin) {
  return String(admin?.username || '').trim().toLowerCase() === 'admin'
}

function rootAdminRequired(req, res, next) {
  if (!isRootAdmin(req.admin)) return res.status(403).json({ message: '只有主管理员 admin 可以管理管理员账号' })
  return next()
}

function adminPermissionRequired(permission) {
  return (req, res, next) => {
    const role = req.admin?.admin_role || ADMIN_ROLES.operations_admin
    const permissions = ADMIN_PERMISSION_MAP[role] || []
    if (permissions.includes('all') || permissions.includes(permission)) return next()
    return res.status(403).json({ message: '你没有权限访问该后台模块' })
  }
}

async function userAuthOptional(req, res, next) {
  const token = getBearerToken(req)
  if (!token) return next()
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.role !== 'user') return res.status(401).json({ message: '用户Token无效' })
    const user = await getRow('SELECT * FROM users WHERE id = $1', [payload.id])
    if (!user) return res.status(401).json({ message: '用户不存在或登录已失效' })
    if (user.is_banned) return res.status(403).json({ message: user.banned_reason || '账号已被封禁，请联系管理员' })
    req.user = user
    return next()
  } catch {
    return res.status(401).json({ message: '用户登录已失效，请重新登录' })
  }
}

async function userAuthRequired(req, res, next) {
  await userAuthOptional(req, res, () => {})
  if (res.headersSent) return
  if (!req.user) return res.status(401).json({ message: '请先登录账号' })
  return next()
}

async function merchantRequired(req, res, next) {
  await userAuthRequired(req, res, () => {})
  if (res.headersSent) return
  if (!req.user?.is_merchant) return res.status(403).json({ message: '你还没有商家入驻权限' })
  return next()
}

function normalizeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    category: row.category,
    image_url: row.image_url,
    stock_quantity: row.stock_quantity,
    owner_user_id: row.owner_user_id,
    store_name: row.store_name || '系统商城',
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
    paid_amount: row.paid_amount ?? row.total_price,
    discount_amount: row.discount_amount ?? 0,
    member_tier: row.member_tier || 'none',
    member_discount_rate: Number(row.member_discount_rate || 1),
    merchant_user_id: row.merchant_user_id,
    merchant_store_name: row.merchant_store_name || '系统商城',
    merchant_income: row.merchant_income ?? (row.paid_amount ?? row.total_price),
    store_credit_status: row.store_credit_status || 'none',
    status: row.status,
    note: row.note,
    email: row.email,
    user_id: row.user_id,
    account_username: row.account_username,
    shipping_instruction: row.shipping_instruction,
    created_at: row.created_at,
    processed_at: row.processed_at,
  }
}

function normalizeUser(row) {
  const tierMeta = pickEffectiveMemberTier(row)
  return {
    id: row.id,
    username: row.username,
    player_id: row.player_id,
    email: row.email,
    invite_code: row.invite_code,
    member_tier: tierMeta.tier,
    member_tier_label: tierMeta.label,
    member_discount_rate: tierMeta.discountRate,
    member_balance: row.member_balance,
    total_recharge: row.total_recharge,
    is_merchant: row.is_merchant,
    store_name: row.store_name || row.player_id,
    store_description: row.store_description || '',
    store_notice: row.store_notice || '',
    store_balance: row.store_balance,
    last_store_checkin_at: row.last_store_checkin_at,
    is_banned: row.is_banned,
    banned_reason: row.banned_reason,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  }
}

function getMemberTierInfo(totalRecharge = 0) {
  if (totalRecharge >= 50000) return { tier: 'gold', label: '黄金会员', discountRate: 0.8 }
  if (totalRecharge >= 10000) return { tier: 'iron', label: '铁锭会员', discountRate: 0.9 }
  return { tier: 'none', label: '普通会员', discountRate: 1 }
}

function getMemberTierMeta(tier) {
  if (tier === 'gold') return { tier: 'gold', label: '黄金会员', discountRate: 0.8 }
  if (tier === 'iron') return { tier: 'iron', label: '铁锭会员', discountRate: 0.9 }
  return { tier: 'none', label: '普通会员', discountRate: 1 }
}

function pickEffectiveMemberTier(user) {
  const auto = getMemberTierInfo(Number(user.total_recharge || 0))
  const manual = getMemberTierMeta(user.member_tier)
  if (manual.tier === 'gold' || auto.tier === 'gold') return getMemberTierMeta('gold')
  if (manual.tier === 'iron' || auto.tier === 'iron') return getMemberTierMeta('iron')
  return getMemberTierMeta('none')
}

function getRechargeBonusAmount(amount, bonusMin = 100, bonusAmount = 10) {
  if (amount >= bonusMin) return Math.floor(amount / bonusMin) * bonusAmount
  return 0
}

function hasCheckedInToday(value) {
  if (!value) return false
  const today = new Date()
  const target = new Date(value)
  return today.getFullYear() === target.getFullYear()
    && today.getMonth() === target.getMonth()
    && today.getDate() === target.getDate()
}

function normalizeInvite(row) {
  return {
    id: row.id,
    code: row.code,
    note: row.note,
    created_by_admin_id: row.created_by_admin_id,
    created_by_admin_username: row.created_by_admin_username,
    assigned_to: row.assigned_to,
    used_by_user_id: row.used_by_user_id,
    used_by_username: row.used_by_username,
    used_at: row.used_at,
    created_at: row.created_at,
    is_used: Boolean(row.used_by_user_id),
  }
}

function normalizeFeedback(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username,
    contact: row.contact,
    message: row.message,
    status: row.status,
    processed_at: row.processed_at,
    processed_by_admin: row.processed_by_admin,
    created_at: row.created_at,
  }
}

function normalizeWalletLog(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    change_type: row.change_type,
    amount: row.amount,
    balance_after: row.balance_after,
    note: row.note,
    created_by_admin: row.created_by_admin,
    created_at: row.created_at,
  }
}

function normalizePayoutRequest(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username,
    store_name: row.store_name,
    amount: row.amount,
    status: row.status,
    note: row.note,
    requested_at: row.requested_at,
    reviewed_at: row.reviewed_at,
    reviewed_by_admin: row.reviewed_by_admin,
  }
}

async function createWalletLog(clientOrPool, { userId, changeType, amount, balanceAfter, note = '', createdByAdmin = null }) {
  await clientOrPool.query(
    `INSERT INTO wallet_logs (user_id, change_type, amount, balance_after, note, created_by_admin)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, changeType, amount, balanceAfter, note, createdByAdmin],
  )
}

async function cancelOrderAndRefundIfNeeded(client, order, { note = '', adminName = null } = {}) {
  if (!order || order.status !== 'pending') return false

  await client.query(
    `UPDATE orders
     SET status = 'cancelled', processed_at = NOW(),
         store_credit_status = CASE WHEN merchant_user_id IS NOT NULL THEN 'none' ELSE store_credit_status END,
         note = CASE WHEN $1 <> '' THEN TRIM(BOTH FROM CONCAT(COALESCE(note, ''), ' ', $1)) ELSE note END
     WHERE id = $2`,
    [String(note || '').trim(), order.id],
  )

  if (order.user_id && Number(order.paid_amount || 0) > 0) {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [order.user_id])
    const buyer = rows[0]
    if (buyer) {
      const nextBalance = Number(buyer.member_balance || 0) + Number(order.paid_amount || 0)
      await client.query('UPDATE users SET member_balance = $1 WHERE id = $2', [nextBalance, buyer.id])
      await createWalletLog(client, {
        userId: buyer.id,
        changeType: 'refund',
        amount: Number(order.paid_amount || 0),
        balanceAfter: nextBalance,
        note: note || `订单取消退款 ${order.order_number}`,
        createdByAdmin: adminName,
      })
    }
  }

  return true
}

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      admin_role TEXT NOT NULL DEFAULT 'operations_admin',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query("ALTER TABLE admins ADD COLUMN IF NOT EXISTS admin_role TEXT NOT NULL DEFAULT 'operations_admin'")
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      player_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      invite_code TEXT UNIQUE,
      member_tier TEXT NOT NULL DEFAULT 'none',
      member_balance INTEGER NOT NULL DEFAULT 0,
      total_recharge INTEGER NOT NULL DEFAULT 0,
      is_merchant BOOLEAN NOT NULL DEFAULT FALSE,
      store_name TEXT,
      store_description TEXT NOT NULL DEFAULT '',
      store_notice TEXT NOT NULL DEFAULT '',
      store_balance INTEGER NOT NULL DEFAULT 0,
      last_store_checkin_at TIMESTAMPTZ,
      password_hash TEXT NOT NULL,
      is_banned BOOLEAN NOT NULL DEFAULT FALSE,
      banned_reason TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `)
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code TEXT')
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS member_tier TEXT NOT NULL DEFAULT 'none'")
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS member_balance INTEGER NOT NULL DEFAULT 0')
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS total_recharge INTEGER NOT NULL DEFAULT 0')
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_merchant BOOLEAN NOT NULL DEFAULT FALSE')
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS store_name TEXT')
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS store_description TEXT NOT NULL DEFAULT ''")
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS store_notice TEXT NOT NULL DEFAULT ''")
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS store_balance INTEGER NOT NULL DEFAULT 0')
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_store_checkin_at TIMESTAMPTZ')
  await query('CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_key ON users(invite_code) WHERE invite_code IS NOT NULL')
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT '热门补给',
      image_url TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 1,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      store_name TEXT NOT NULL DEFAULT '系统商城',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '热门补给'`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 1`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS store_name TEXT NOT NULL DEFAULT '系统商城'`)
  await query(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      assigned_to TEXT NOT NULL DEFAULT '',
      created_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      used_by_user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      account_username TEXT,
      merchant_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      merchant_store_name TEXT NOT NULL DEFAULT '系统商城',
      merchant_income INTEGER NOT NULL DEFAULT 0,
      store_credit_status TEXT NOT NULL DEFAULT 'none',
      player_id TEXT NOT NULL,
      items JSONB NOT NULL,
      total_price INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      member_tier TEXT NOT NULL DEFAULT 'none',
      member_discount_rate NUMERIC(4,2) NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK (status IN ('pending', 'shipped', 'cancelled')),
      note TEXT,
      email TEXT,
      shipping_instruction TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `)
  await query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL')
  await query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_username TEXT')
  await query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount INTEGER NOT NULL DEFAULT 0')
  await query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0')
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS member_tier TEXT NOT NULL DEFAULT 'none'")
  await query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS member_discount_rate NUMERIC(4,2) NOT NULL DEFAULT 1')
  await query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL')
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_store_name TEXT NOT NULL DEFAULT '系统商城'")
  await query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_income INTEGER NOT NULL DEFAULT 0')
  await query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_credit_status TEXT NOT NULL DEFAULT 'none'")
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
  await query(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      contact TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed')),
      processed_at TIMESTAMPTZ,
      processed_by_admin TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query("ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'")
  await query('ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ')
  await query('ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS processed_by_admin TEXT')
  await query(`
    CREATE TABLE IF NOT EXISTS wallet_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      change_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_admin TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_by_admin TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS payout_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      store_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT NOT NULL DEFAULT '',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by_admin TEXT
    )
  `)
}

async function ensureSeedData() {
  let admin = await getRow('SELECT id, username, admin_role FROM admins LIMIT 1')
  if (!admin) {
    const hash = await bcrypt.hash('admin123', 10)
    await query('INSERT INTO admins (username, admin_role, password_hash) VALUES ($1, $2, $3)', ['admin', ADMIN_ROLES.super_admin, hash])
    console.log('Created default admin account: admin / admin123. Please change the password after first login.')
    await logAction('default_admin_created', { username: 'admin' })
    admin = await getRow('SELECT id, username, admin_role FROM admins WHERE username = $1', ['admin'])
  } else if (String(admin.username).trim().toLowerCase() === 'admin' && admin.admin_role !== ADMIN_ROLES.super_admin) {
    await query('UPDATE admins SET admin_role = $1 WHERE username = $2', [ADMIN_ROLES.super_admin, 'admin'])
    admin.admin_role = ADMIN_ROLES.super_admin
  }

  const productCount = await getRow('SELECT COUNT(*)::int AS count FROM products')
  if (productCount.count === 0) {
    const demoProducts = [
      ['附魔钻石新手包', '适合新玩家快速开荒，包含钻石装备、食物与基础药水。', 188, '热门补给', 'https://picsum.photos/seed/mc-diamond-kit/900/600', 20, true],
      ['金苹果战备箱', '高强度 PvP 与首领挑战常用补给，主打恢复和容错。', 100, '战斗物资', 'https://picsum.photos/seed/mc-golden-apple/900/600', 20, true],
      ['矿工效率工具组', '提供高效率采集体验，适合长期生存服资源积累。', 72, '挖矿工具', 'https://picsum.photos/seed/mc-miner-bundle/900/600', 20, true],
    ]
    for (const product of demoProducts) {
      await query(
        'INSERT INTO products (name, description, price, category, image_url, stock_quantity, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        product,
      )
    }
    await logAction('seed_products_created', { count: demoProducts.length })
  }

  const siteContentCount = await getRow('SELECT COUNT(*)::int AS count FROM site_content')
  if (siteContentCount.count === 0) {
    await query('INSERT INTO site_content (content) VALUES ($1::jsonb)', [JSON.stringify(defaultSiteContent())])
  }

  const inviteCount = await getRow('SELECT COUNT(*)::int AS count FROM invite_codes')
  if (inviteCount.count === 0 && admin) {
    const seedCode = `INV-${randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10)}`
    await query(
      'INSERT INTO invite_codes (code, note, assigned_to, created_by_admin_id) VALUES ($1, $2, $3, $4)',
      [seedCode, '系统初始化邀请码', '首位测试玩家', admin.id],
    )
    await logAction('seed_invite_created', { code: seedCode })
  }

  const announcementCount = await getRow('SELECT COUNT(*)::int AS count FROM announcements')
  if (announcementCount.count === 0 && admin) {
    await query(
      `INSERT INTO announcements (title, content, is_pinned, created_by_admin_id, created_by_admin)
       VALUES ($1, $2, $3, $4, $5)`,
      ['欢迎来到补给中心', '这里会展示服务器最新公告、礼包发放说明和限时活动信息。', true, admin.id, admin.username],
    )
  }
}

async function getSiteContent() {
  const row = await getRow('SELECT content FROM site_content ORDER BY id ASC LIMIT 1')
  return normalizeSiteContent(row)
}

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.get('/api/products', async (req, res) => {
  try {
    const storeId = String(req.query.store_id || '').trim()
    const values = []
    let whereClause = 'WHERE p.is_active = TRUE'
    if (storeId) {
      if (!Number.isInteger(Number(storeId))) return res.status(400).json({ message: '店铺参数无效' })
      values.push(Number(storeId))
      whereClause += ' AND p.owner_user_id = $1'
    }
    const rows = await getRows(
      `SELECT p.*, u.last_store_checkin_at, u.is_merchant
       FROM products p
       LEFT JOIN users u ON u.id = p.owner_user_id
       ${whereClause}
       ORDER BY p.id DESC`,
      values,
    )
    const visible = rows.filter((row) => row.owner_user_id === null || hasCheckedInToday(row.last_store_checkin_at))
    res.json(visible.map(normalizeProduct))
  } catch {
    res.status(500).json({ message: '获取商品失败' })
  }
})

app.get('/api/stores', async (req, res) => {
  try {
    const rows = await getRows(
      `SELECT u.id, u.username, COALESCE(u.store_name, u.player_id) AS store_name, u.store_description, u.store_notice, u.store_balance, u.last_store_checkin_at,
              COUNT(p.id)::int AS product_count
        FROM users u
        LEFT JOIN products p ON p.owner_user_id = u.id AND p.is_active = TRUE
        WHERE u.is_merchant = TRUE
        GROUP BY u.id, u.username, COALESCE(u.store_name, u.player_id), u.store_description, u.store_notice, u.store_balance, u.last_store_checkin_at
        ORDER BY store_name ASC`,
    )
    res.json(rows.map((row) => ({
      ...row,
      has_checked_in_today: hasCheckedInToday(row.last_store_checkin_at),
    })))
  } catch {
    res.status(500).json({ message: '获取商家列表失败' })
  }
})

app.get('/api/stores/:id', async (req, res) => {
  try {
    const store = await getRow(
      `SELECT u.id, u.username, COALESCE(u.store_name, u.player_id) AS store_name, u.store_description, u.store_notice, u.store_balance, u.last_store_checkin_at,
              COUNT(p.id)::int AS product_count
       FROM users u
       LEFT JOIN products p ON p.owner_user_id = u.id AND p.is_active = TRUE
       WHERE u.is_merchant = TRUE AND u.id = $1
       GROUP BY u.id, u.username, COALESCE(u.store_name, u.player_id), u.store_description, u.store_notice, u.store_balance, u.last_store_checkin_at`,
      [req.params.id],
    )
    if (!store) return res.status(404).json({ message: '店铺不存在' })

    const rows = await getRows(
      `SELECT p.*, u.last_store_checkin_at, u.is_merchant
       FROM products p
       LEFT JOIN users u ON u.id = p.owner_user_id
       WHERE p.is_active = TRUE AND p.owner_user_id = $1
       ORDER BY p.id DESC`,
      [req.params.id],
    )
    const visible = rows.filter((row) => hasCheckedInToday(row.last_store_checkin_at))
    res.json({
      store: {
        ...store,
        has_checked_in_today: hasCheckedInToday(store.last_store_checkin_at),
      },
      products: visible.map(normalizeProduct),
    })
  } catch {
    res.status(500).json({ message: '获取店铺详情失败' })
  }
})

app.get('/api/site-content', async (req, res) => {
  try {
    res.json(await getSiteContent())
  } catch {
    res.status(500).json({ message: '获取页面内容失败' })
  }
})

app.get('/api/captcha', (req, res) => {
  const purpose = ['register', 'order'].includes(String(req.query.purpose || '').trim())
    ? String(req.query.purpose).trim()
    : 'general'
  res.json(createCaptchaChallenge(purpose))
})

app.post('/api/feedback', userAuthOptional, async (req, res) => {
  try {
    const { contact = '', message = '' } = req.body || {}
    const normalizedMessage = String(message || '').trim()
    if (!normalizedMessage) return res.status(400).json({ message: '反馈内容不能为空' })
    if (normalizedMessage.length > 2000) return res.status(400).json({ message: '反馈内容不能超过 2000 字' })
    await query(
      'INSERT INTO feedbacks (user_id, username, contact, message) VALUES ($1, $2, $3, $4)',
      [req.user?.id || null, req.user?.username || null, String(contact || '').trim(), normalizedMessage],
    )
    await logAction('feedback_created', { userId: req.user?.id || null, username: req.user?.username || null })
    res.status(201).json({ message: '反馈已提交，感谢你的建议' })
  } catch {
    res.status(500).json({ message: '提交反馈失败' })
  }
})

app.get('/api/admin/feedbacks', authRequired, adminPermissionRequired('feedbacks'), async (req, res) => {
  try {
    const status = String(req.query.status || 'all').trim()
    const rows = status === 'all'
      ? await getRows('SELECT * FROM feedbacks ORDER BY created_at DESC, id DESC')
      : await getRows('SELECT * FROM feedbacks WHERE status = $1 ORDER BY created_at DESC, id DESC', [status])
    res.json(rows.map(normalizeFeedback))
  } catch {
    res.status(500).json({ message: '获取反馈失败' })
  }
})

app.put('/api/admin/feedbacks/:id/status', authRequired, adminPermissionRequired('feedbacks'), async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body || {}
    if (!['pending', 'processed'].includes(status)) return res.status(400).json({ message: '反馈状态无效' })
    const updated = await getRow(
      `UPDATE feedbacks
       SET status = $1,
           processed_at = CASE WHEN $1 = 'processed' THEN NOW() ELSE NULL END,
           processed_by_admin = CASE WHEN $1 = 'processed' THEN $2 ELSE NULL END
       WHERE id = $3
       RETURNING *`,
      [status, req.admin.username, id],
    )
    if (!updated) return res.status(404).json({ message: '反馈不存在' })
    await logAction('feedback_status_updated', { id, status, admin: req.admin.username })
    res.json(normalizeFeedback(updated))
  } catch {
    res.status(500).json({ message: '更新反馈状态失败' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, player_id, password, email = '', invite_code, captcha_token, captcha_answer } = req.body || {}
    const normalizedUsername = String(username || '').trim()
    const normalizedPlayerId = String(player_id || '').trim()
    const normalizedEmail = String(email || '').trim()
    const normalizedInviteCode = String(invite_code || '').trim().toUpperCase()
    if (!normalizedUsername || !normalizedPlayerId || !password) {
      return res.status(400).json({ message: '用户名、游戏ID和密码不能为空' })
    }
    if (!normalizedInviteCode) return res.status(400).json({ message: '注册需要邀请码' })
    if (String(password).length < 6) return res.status(400).json({ message: '密码至少需要 6 位' })
    if (!verifyCaptchaResponse(captcha_token, captcha_answer, 'register')) {
      return res.status(400).json({ message: '验证码错误或已过期，请刷新后重试' })
    }

    const usernameExists = await getRow('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)', [normalizedUsername])
    if (usernameExists) return res.status(400).json({ message: '用户名已存在' })
    const playerIdExists = await getRow('SELECT 1 FROM users WHERE LOWER(player_id) = LOWER($1)', [normalizedPlayerId])
    if (playerIdExists) return res.status(400).json({ message: '该游戏ID已绑定账号' })
    const invite = await getRow('SELECT * FROM invite_codes WHERE UPPER(code) = $1', [normalizedInviteCode])
    if (!invite) return res.status(400).json({ message: '邀请码不存在' })
    if (invite.used_by_user_id) return res.status(400).json({ message: '该邀请码已被使用' })

    const hash = await bcrypt.hash(password, 10)
    const created = await getRow(
      `INSERT INTO users (username, player_id, email, invite_code, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [normalizedUsername, normalizedPlayerId, normalizedEmail, normalizedInviteCode, hash],
    )
    await query('UPDATE invite_codes SET used_by_user_id = $1, used_at = NOW() WHERE id = $2', [created.id, invite.id])
    const token = createUserToken(created)
    await logAction('user_registered', { id: created.id, username: created.username, playerId: created.player_id, inviteCode: normalizedInviteCode })
    res.status(201).json({ token, user: normalizeUser(created) })
  } catch {
    res.status(500).json({ message: '注册失败' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    const normalizedUsername = String(username || '').trim()
    if (!normalizedUsername || !password) return res.status(400).json({ message: '用户名和密码不能为空' })

    const user = await getRow('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [normalizedUsername])
    if (!user) {
      await logAction('user_login_failed', { username: normalizedUsername })
      return res.status(401).json({ message: '用户名或密码错误' })
    }
    if (user.is_banned) return res.status(403).json({ message: user.banned_reason || '账号已被封禁，请联系管理员' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      await logAction('user_login_failed', { username: normalizedUsername })
      return res.status(401).json({ message: '用户名或密码错误' })
    }

    const updated = await getRow('UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *', [user.id])
    const token = createUserToken(updated)
    await logAction('user_login_success', { id: updated.id, username: updated.username })
    res.json({ token, user: normalizeUser(updated) })
  } catch {
    res.status(500).json({ message: '登录失败' })
  }
})

app.get('/api/auth/me', userAuthRequired, async (req, res) => {
  res.json({ user: normalizeUser(req.user) })
})

app.get('/api/me/dashboard', userAuthRequired, async (req, res) => {
  try {
    const orders = await getRows('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC', [req.user.id])
    const walletLogs = await getRows('SELECT * FROM wallet_logs WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50', [req.user.id])
    res.json({
      user: normalizeUser(req.user),
      orders: orders.map(normalizeOrder),
      wallet_logs: walletLogs.map(normalizeWalletLog),
    })
  } catch {
    res.status(500).json({ message: '获取会员中心信息失败' })
  }
})

app.get('/api/announcements', async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM announcements ORDER BY is_pinned DESC, updated_at DESC, id DESC')
    res.json(rows)
  } catch {
    res.status(500).json({ message: '获取公告失败' })
  }
})

app.get('/api/merchant/dashboard', merchantRequired, async (req, res) => {
  try {
    const products = await getRows('SELECT * FROM products WHERE owner_user_id = $1 ORDER BY created_at DESC, id DESC', [req.user.id])
    const orders = await getRows('SELECT * FROM orders WHERE merchant_user_id = $1 ORDER BY created_at DESC, id DESC', [req.user.id])
    const payoutRequests = await getRows('SELECT * FROM payout_requests WHERE user_id = $1 ORDER BY requested_at DESC, id DESC', [req.user.id])
    const walletLogs = await getRows(
      `SELECT * FROM wallet_logs
       WHERE user_id = $1 AND change_type IN ('store_income', 'store_payout')
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [req.user.id],
    )
    res.json({
      user: normalizeUser(req.user),
      products: products.map(normalizeProduct),
      orders: orders.map(normalizeOrder),
      payout_requests: payoutRequests.map(normalizePayoutRequest),
      wallet_logs: walletLogs.map(normalizeWalletLog),
      checked_in_today: hasCheckedInToday(req.user.last_store_checkin_at),
    })
  } catch {
    res.status(500).json({ message: '获取商家中心信息失败' })
  }
})

app.post('/api/merchant/check-in', merchantRequired, async (req, res) => {
  try {
    const storeName = String(req.user.store_name || req.user.player_id).trim()
    const updated = await getRow('UPDATE users SET store_name = COALESCE(store_name, $1), last_store_checkin_at = NOW() WHERE id = $2 RETURNING *', [storeName, req.user.id])
    await query('UPDATE products SET is_active = CASE WHEN stock_quantity > 0 THEN TRUE ELSE FALSE END, store_name = $1 WHERE owner_user_id = $2', [String(updated.store_name || updated.player_id).trim(), updated.id])
    await logAction('merchant_checked_in', { userId: updated.id, username: updated.username })
    res.json({ user: normalizeUser(updated), checked_in_today: true })
  } catch {
    res.status(500).json({ message: '签到失败' })
  }
})

app.put('/api/merchant/store', merchantRequired, async (req, res) => {
  try {
    const nextName = String(req.body?.store_name || '').trim() || String(req.user.player_id).trim()
    const nextDescription = String(req.body?.store_description || '').trim()
    const nextNotice = String(req.body?.store_notice || '').trim()
    const updated = await getRow(
      'UPDATE users SET store_name = $1, store_description = $2, store_notice = $3 WHERE id = $4 RETURNING *',
      [nextName, nextDescription, nextNotice, req.user.id],
    )
    await query('UPDATE products SET store_name = $1 WHERE owner_user_id = $2', [nextName, req.user.id])
    await logAction('merchant_store_updated', { userId: updated.id, username: updated.username, storeName: nextName })
    res.json(normalizeUser(updated))
  } catch {
    res.status(500).json({ message: '更新店铺名称失败' })
  }
})

app.post('/api/merchant/products', merchantRequired, async (req, res) => {
  try {
    const { name, description, price, category = '热门补给', image_url, stock_quantity, is_active = true } = req.body || {}
    const normalizedStock = parseNonNegativeInt(stock_quantity)
    if (!name || !description || !image_url || !String(category).trim() || !Number.isInteger(Number(price)) || normalizedStock === null) {
      return res.status(400).json({ message: '请填写完整且正确的商品信息' })
    }
    const storeName = String(req.user.store_name || req.user.player_id).trim() || String(req.user.player_id).trim()
    const canShow = Boolean(is_active) && normalizedStock > 0 && hasCheckedInToday(req.user.last_store_checkin_at)
    const created = await getRow(
      `INSERT INTO products (name, description, price, category, image_url, stock_quantity, owner_user_id, store_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [String(name).trim(), String(description).trim(), Number(price), String(category).trim(), String(image_url).trim(), normalizedStock, req.user.id, storeName, canShow],
    )
    await logAction('merchant_product_created', { id: created.id, userId: req.user.id, username: req.user.username })
    res.status(201).json(normalizeProduct(created))
  } catch {
    res.status(500).json({ message: '添加商品失败' })
  }
})

app.put('/api/merchant/products/:id', merchantRequired, async (req, res) => {
  try {
    const { id } = req.params
    const product = await getRow('SELECT * FROM products WHERE id = $1 AND owner_user_id = $2', [id, req.user.id])
    if (!product) return res.status(404).json({ message: '商品不存在' })
    const { name, description, price, category, image_url, stock_quantity, is_active } = req.body || {}
    const normalizedStock = stock_quantity === undefined ? product.stock_quantity : parseNonNegativeInt(stock_quantity)
    if (normalizedStock === null) return res.status(400).json({ message: '库存必须是大于等于 0 的整数' })
    const canShow = normalizedStock > 0 && hasCheckedInToday(req.user.last_store_checkin_at) && (typeof is_active === 'boolean' ? is_active : product.is_active)
    const updated = await getRow(
      `UPDATE products
       SET name = $1, description = $2, price = $3, category = $4, image_url = $5, stock_quantity = $6, store_name = $7, is_active = $8
       WHERE id = $9
       RETURNING *`,
      [
        String(name ?? product.name).trim(),
        String(description ?? product.description).trim(),
        Number.isInteger(Number(price)) ? Number(price) : product.price,
        String(category ?? product.category).trim(),
        String(image_url ?? product.image_url).trim(),
        normalizedStock,
        String(req.user.store_name || req.user.player_id).trim(),
        canShow,
        id,
      ],
    )
    await logAction('merchant_product_updated', { id, userId: req.user.id, username: req.user.username })
    res.json(normalizeProduct(updated))
  } catch {
    res.status(500).json({ message: '编辑商品失败' })
  }
})

app.delete('/api/merchant/products/:id', merchantRequired, async (req, res) => {
  try {
    const deleted = await getRow('DELETE FROM products WHERE id = $1 AND owner_user_id = $2 RETURNING id', [req.params.id, req.user.id])
    if (!deleted) return res.status(404).json({ message: '商品不存在' })
    await logAction('merchant_product_deleted', { id: req.params.id, userId: req.user.id, username: req.user.username })
    res.json({ message: '商品已删除' })
  } catch {
    res.status(500).json({ message: '删除商品失败' })
  }
})

app.put('/api/merchant/orders/:orderNo/ship', merchantRequired, async (req, res) => {
  try {
    const { orderNo } = req.params
    const { shipping_instruction } = req.body || {}
    if (!shipping_instruction || !String(shipping_instruction).trim()) return res.status(400).json({ message: '发放指令不能为空' })
    const order = await getRow('SELECT * FROM orders WHERE order_number = $1 AND merchant_user_id = $2', [orderNo, req.user.id])
    if (!order) return res.status(404).json({ message: '订单不存在' })
    if (order.status !== 'pending') return res.status(400).json({ message: '仅待处理订单可发货' })

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE orders
         SET status = 'shipped', shipping_instruction = $1, processed_at = NOW(),
             store_credit_status = CASE WHEN merchant_user_id IS NOT NULL AND store_credit_status = 'pending' THEN 'credited' ELSE store_credit_status END
         WHERE order_number = $2`,
        [String(shipping_instruction).trim(), orderNo],
      )
      if (order.merchant_user_id && order.store_credit_status === 'pending') {
        const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [order.merchant_user_id])
        const merchant = rows[0]
        const nextStoreBalance = Number(merchant.store_balance || 0) + Number(order.merchant_income || 0)
        await client.query('UPDATE users SET store_balance = $1 WHERE id = $2', [nextStoreBalance, merchant.id])
        await createWalletLog(client, {
          userId: merchant.id,
          changeType: 'store_income',
          amount: Number(order.merchant_income || 0),
          balanceAfter: nextStoreBalance,
          note: `商家订单收入 ${order.order_number}`,
        })
      }
    })
    await logAction('merchant_order_shipped', { orderNo, userId: req.user.id, username: req.user.username })
    res.json({ message: '订单已发货，店铺收入已更新' })
  } catch {
    res.status(500).json({ message: '发货失败' })
  }
})

app.post('/api/merchant/payout-requests', merchantRequired, async (req, res) => {
  try {
    const amount = Number(req.body?.amount || 0)
    const note = String(req.body?.note || '').trim()
    if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ message: '提现申请金额必须是正整数' })
    const user = await getRow('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (Number(user.store_balance || 0) < amount) return res.status(400).json({ message: '店铺收入余额不足' })
    const created = await getRow(
      `INSERT INTO payout_requests (user_id, username, store_name, amount, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, req.user.username, String(req.user.store_name || req.user.player_id).trim(), amount, note],
    )
    await logAction('merchant_payout_requested', { userId: req.user.id, username: req.user.username, amount })
    res.status(201).json(normalizePayoutRequest(created))
  } catch {
    res.status(500).json({ message: '提交提现申请失败' })
  }
})

app.post('/api/admin/uploads', authRequired, adminPermissionRequired('products'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '未上传文件' })
    const uploaded = await persistUpload(req.file)
    await logAction('product_image_uploaded', { admin: req.admin.username, storage: uploaded.storage, key: uploaded.key })
    res.status(201).json({
      url: uploaded.url,
      filename: uploaded.key,
      storage: uploaded.storage,
    })
  } catch {
    res.status(500).json({ message: '上传失败' })
  }
})

app.post('/api/merchant/uploads', userAuthRequired, merchantRequired, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '未上传文件' })
    const uploaded = await persistUpload(req.file)
    await logAction('merchant_product_image_uploaded', { userId: req.user.id, username: req.user.username, storage: uploaded.storage, key: uploaded.key })
    res.status(201).json({
      url: uploaded.url,
      filename: uploaded.key,
      storage: uploaded.storage,
    })
  } catch {
    res.status(500).json({ message: '上传失败' })
  }
})

app.post('/api/orders', userAuthRequired, async (req, res) => {
  try {
    const { player_id, items, note = '', email = '', captcha_token, captcha_answer } = req.body || {}
    const activeUser = req.user
    const normalizedPlayerId = String(activeUser.player_id).trim() || String(player_id || '').trim()
    const normalizedEmail = String(email || '').trim()
    if (!normalizedPlayerId) return res.status(400).json({ message: '游戏ID不能为空' })
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: '订单商品不能为空' })
    if (!verifyCaptchaResponse(captcha_token, captcha_answer, 'order')) {
      return res.status(400).json({ message: '验证码错误或已过期，请刷新后重试' })
    }

    const submitCheck = assertOrderSubmitAllowed(req, normalizedPlayerId)
    if (!submitCheck.allowed) {
      return res.status(429).json({ message: `提交过于频繁，请 ${submitCheck.retryAfter} 秒后再试` })
    }

    const productIds = [...new Set(items.map((item) => Number(item.product_id)).filter(Boolean))]
    const normalizedItems = []
    let totalPrice = 0
    const tierMeta = pickEffectiveMemberTier(activeUser)
    let paidAmount = 0
    let discountAmount = 0
    let merchantUserId = null
    let merchantStoreName = '系统商城'
    let merchantIncome = 0
    let storeCreditStatus = 'none'

    const orderResult = await withTransaction(async (client) => {
      const { rows: userRows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [activeUser.id])
      const lockedUser = userRows[0]
      if (!lockedUser) {
        const error = new Error('账号不存在或登录已失效')
        error.statusCode = 401
        throw error
      }
      const { rows: products } = productIds.length
        ? await client.query('SELECT * FROM products WHERE id = ANY($1::int[]) FOR UPDATE', [productIds])
        : { rows: [] }
      const productMap = new Map(products.map((product) => [product.id, product]))

      for (const item of items) {
        const product = productMap.get(Number(item.product_id))
        const quantity = Number(item.quantity || 0)
        if (!product || !product.is_active) {
          const error = new Error('商品不存在或已下架')
          error.statusCode = 400
          throw error
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
          const error = new Error('商品数量必须为正整数')
          error.statusCode = 400
          throw error
        }
        if (product.stock_quantity < quantity) {
          const error = new Error(`${product.name} 库存不足，当前仅剩 ${product.stock_quantity}`)
          error.statusCode = 400
          throw error
        }
        if (merchantUserId === null && product.owner_user_id) {
          merchantUserId = product.owner_user_id
          merchantStoreName = product.store_name || '系统商城'
        }
        if (merchantUserId !== null && Number(product.owner_user_id || 0) !== Number(merchantUserId)) {
          const error = new Error('暂不支持跨店铺合并下单，请分别提交系统商城或不同商家的商品')
          error.statusCode = 400
          throw error
        }
        if (merchantUserId === null && product.owner_user_id === null) {
          merchantStoreName = '系统商城'
        }
        normalizedItems.push({ product_id: product.id, name: product.name, price: product.price, quantity })
        totalPrice += product.price * quantity
      }

      paidAmount = Math.max(0, Math.round(totalPrice * tierMeta.discountRate))
      discountAmount = Math.max(0, totalPrice - paidAmount)
      merchantIncome = merchantUserId ? paidAmount : 0
      storeCreditStatus = merchantUserId ? 'pending' : 'none'

      if (Number(lockedUser.member_balance || 0) < paidAmount) {
        const error = new Error(`会员卡余额不足，当前余额 ${lockedUser.member_balance || 0} 金币，应付 ${paidAmount} 金币`)
        error.statusCode = 400
        throw error
      }

      let orderNumber = generateOrderNumber()
      let apiKey = generateApiKey()
      while (await getRow('SELECT 1 FROM orders WHERE order_number = $1 OR api_key = $2', [orderNumber, apiKey])) {
        orderNumber = generateOrderNumber()
        apiKey = generateApiKey()
      }

      for (const item of normalizedItems) {
        await client.query(
          `UPDATE products
           SET stock_quantity = stock_quantity - $1,
               is_active = CASE WHEN stock_quantity - $1 <= 0 THEN FALSE ELSE is_active END
           WHERE id = $2`,
          [item.quantity, item.product_id],
        )
      }

      const nextBalance = Number(lockedUser.member_balance || 0) - paidAmount
      await client.query('UPDATE users SET member_balance = $1 WHERE id = $2', [nextBalance, lockedUser.id])
      await createWalletLog(client, {
        userId: lockedUser.id,
        changeType: 'order_payment',
        amount: -paidAmount,
        balanceAfter: nextBalance,
        note: `订单支付 ${orderNumber}`,
      })

      await client.query(
        `INSERT INTO orders
        (order_number, api_key, user_id, account_username, merchant_user_id, merchant_store_name, merchant_income, store_credit_status, player_id, items, total_price, paid_amount, discount_amount, member_tier, member_discount_rate, status, note, email)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, 'pending', $16, $17)`,
        [
          orderNumber,
          apiKey,
          activeUser?.id || null,
          activeUser?.username || null,
          merchantUserId,
          merchantStoreName,
          merchantIncome,
          storeCreditStatus,
          normalizedPlayerId,
          JSON.stringify(normalizedItems),
          totalPrice,
          paidAmount,
          discountAmount,
          tierMeta.tier,
          tierMeta.discountRate,
          String(note || ''),
          activeUser?.email || normalizedEmail,
        ],
      )

      return { normalizedItems, totalPrice, paidAmount, discountAmount, orderNumber, apiKey, memberBalance: nextBalance, merchantStoreName, merchantUserId }
    })

    await logAction('order_created', {
      orderNumber: orderResult.orderNumber,
      playerId: normalizedPlayerId,
      totalPrice: orderResult.totalPrice,
      userId: activeUser?.id || null,
      username: activeUser?.username || null,
    })

    res.status(201).json({
      order_number: orderResult.orderNumber,
      api_key: orderResult.apiKey,
      user_id: activeUser?.id || null,
      account_username: activeUser?.username || null,
      merchant_user_id: orderResult.merchantUserId,
      merchant_store_name: orderResult.merchantStoreName,
      player_id: normalizedPlayerId,
      items: orderResult.normalizedItems,
      total_price: orderResult.totalPrice,
      paid_amount: orderResult.paidAmount,
      discount_amount: orderResult.discountAmount,
      member_tier: tierMeta.tier,
      member_discount_rate: tierMeta.discountRate,
      member_balance: orderResult.memberBalance,
      note: String(note || ''),
      email: activeUser?.email || normalizedEmail,
      status: 'pending',
    })
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message })
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
    const token = createAdminToken(admin)
    await logAction('admin_login_success', { username })
    res.json({ token, admin: { id: admin.id, username: admin.username, admin_role: admin.admin_role || ADMIN_ROLES.operations_admin } })
  } catch {
    res.status(500).json({ message: '登录失败' })
  }
})

app.get('/api/admin/site-content', authRequired, adminPermissionRequired('content'), async (req, res) => {
  try {
    res.json(await getSiteContent())
  } catch {
    res.status(500).json({ message: '获取页面内容失败' })
  }
})

app.put('/api/admin/site-content', authRequired, adminPermissionRequired('content'), async (req, res) => {
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
    nextContent.category_sections = Array.isArray(nextContent.category_sections)
      ? nextContent.category_sections
        .map((item) => ({ key: String(item?.key || '').trim(), title: String(item?.title || '').trim() }))
        .filter((item) => item.key && item.title)
      : defaultSiteContent().category_sections
    nextContent.featured_product_id = Number.isInteger(Number(nextContent.featured_product_id))
      ? Number(nextContent.featured_product_id)
      : null

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

app.get('/api/admin/orders', authRequired, adminPermissionRequired('orders'), async (req, res) => {
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

app.put('/api/admin/orders/:orderNo/ship', authRequired, adminPermissionRequired('orders'), async (req, res) => {
  try {
    const { orderNo } = req.params
    const { shipping_instruction } = req.body || {}
    if (!shipping_instruction || !String(shipping_instruction).trim()) return res.status(400).json({ message: '发放指令不能为空' })
    const order = await getRow('SELECT * FROM orders WHERE order_number = $1', [orderNo])
    if (!order) return res.status(404).json({ message: '订单不存在' })
    if (order.status !== 'pending') return res.status(400).json({ message: '仅待处理订单可发货' })
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE orders
         SET status = $1, shipping_instruction = $2, processed_at = NOW(),
             store_credit_status = CASE WHEN merchant_user_id IS NOT NULL AND store_credit_status = 'pending' THEN 'credited' ELSE store_credit_status END
         WHERE order_number = $3`,
        ['shipped', String(shipping_instruction).trim(), orderNo],
      )
      if (order.merchant_user_id && order.store_credit_status === 'pending') {
        const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [order.merchant_user_id])
        const merchant = rows[0]
        if (merchant) {
          const nextStoreBalance = Number(merchant.store_balance || 0) + Number(order.merchant_income || 0)
          await client.query('UPDATE users SET store_balance = $1 WHERE id = $2', [nextStoreBalance, merchant.id])
          await createWalletLog(client, {
            userId: merchant.id,
            changeType: 'store_income',
            amount: Number(order.merchant_income || 0),
            balanceAfter: nextStoreBalance,
            note: `商家订单收入 ${order.order_number}`,
            createdByAdmin: req.admin.username,
          })
        }
      }
    })
    await logAction('order_shipped', { orderNo, admin: req.admin.username })
    res.json({ message: '订单已标记为已发货' })
  } catch {
    res.status(500).json({ message: '发货失败' })
  }
})

app.put('/api/admin/orders/:orderNo/cancel', authRequired, adminPermissionRequired('orders'), async (req, res) => {
  try {
    const { orderNo } = req.params
    const order = await getRow('SELECT * FROM orders WHERE order_number = $1', [orderNo])
    if (!order) return res.status(404).json({ message: '订单不存在' })
    if (order.status !== 'pending') return res.status(400).json({ message: '仅待处理订单可取消' })
    await withTransaction(async (client) => {
      await cancelOrderAndRefundIfNeeded(client, order, {
        note: `管理员取消订单 ${order.order_number}`,
        adminName: req.admin.username,
      })
    })
    await logAction('order_cancelled', { orderNo, admin: req.admin.username })
    res.json({ message: '订单已取消' })
  } catch {
    res.status(500).json({ message: '取消失败' })
  }
})

app.get('/api/admin/products', authRequired, adminPermissionRequired('products'), async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM products ORDER BY id DESC')
    const normalized = rows.map(normalizeProduct)
    res.json({
      all: normalized,
      system: normalized.filter((item) => item.owner_user_id === null),
      merchant: normalized.filter((item) => item.owner_user_id !== null),
    })
  } catch {
    res.status(500).json({ message: '获取商品失败' })
  }
})

app.post('/api/admin/products', authRequired, adminPermissionRequired('products'), async (req, res) => {
  try {
    const { name, description, price, category = '热门补给', image_url, stock_quantity, is_active = true } = req.body || {}
    const normalizedStock = parseNonNegativeInt(stock_quantity)
    if (!name || !description || !image_url || !String(category).trim() || !Number.isInteger(Number(price)) || normalizedStock === null) {
      return res.status(400).json({ message: '请填写完整且正确的商品信息' })
    }
    const created = await getRow(
      `INSERT INTO products (name, description, price, category, image_url, stock_quantity, owner_user_id, store_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, '系统商城', $7)
       RETURNING *`,
      [
        String(name).trim(),
        String(description).trim(),
        Number(price),
        String(category).trim(),
        String(image_url).trim(),
        normalizedStock,
        Boolean(is_active) && normalizedStock > 0,
      ],
    )
    await logAction('product_created', { id: created.id, admin: req.admin.username })
    res.status(201).json(normalizeProduct(created))
  } catch {
    res.status(500).json({ message: '添加商品失败' })
  }
})

app.put('/api/admin/products/:id', authRequired, adminPermissionRequired('products'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, price, category, image_url, stock_quantity, is_active } = req.body || {}
    const product = await getRow('SELECT * FROM products WHERE id = $1', [id])
    if (!product) return res.status(404).json({ message: '商品不存在' })
    const normalizedStock = stock_quantity === undefined ? product.stock_quantity : parseNonNegativeInt(stock_quantity)
    if (normalizedStock === null) return res.status(400).json({ message: '库存必须是大于等于 0 的整数' })
    const updated = await getRow(
      `UPDATE products
       SET name = $1, description = $2, price = $3, category = $4, image_url = $5, stock_quantity = $6,
           store_name = CASE WHEN owner_user_id IS NULL THEN '系统商城' ELSE store_name END,
           is_active = $7
       WHERE id = $8
       RETURNING *`,
      [
        String(name ?? product.name).trim(),
        String(description ?? product.description).trim(),
        Number.isInteger(Number(price)) ? Number(price) : product.price,
        String(category ?? product.category).trim(),
        String(image_url ?? product.image_url).trim(),
        normalizedStock,
        normalizedStock > 0 && (typeof is_active === 'boolean' ? is_active : product.is_active),
        id,
      ],
    )
    await logAction('product_updated', { id, admin: req.admin.username })
    res.json(normalizeProduct(updated))
  } catch {
    res.status(500).json({ message: '编辑商品失败' })
  }
})

app.delete('/api/admin/products/:id', authRequired, adminPermissionRequired('products'), async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM products WHERE id = $1', [id])
    await logAction('product_deleted', { id, admin: req.admin.username })
    res.json({ message: '商品已删除' })
  } catch {
    res.status(500).json({ message: '删除商品失败' })
  }
})

app.get('/api/admin/admins', authRequired, rootAdminRequired, async (req, res) => {
  try {
    const rows = await getRows('SELECT id, username, admin_role, created_at FROM admins ORDER BY id ASC')
    res.json(rows)
  } catch {
    res.status(500).json({ message: '获取管理员失败' })
  }
})

app.get('/api/admin/users', authRequired, adminPermissionRequired('users'), async (req, res) => {
  try {
    const search = String(req.query.search || '').trim()
    const rows = search
      ? await getRows(
        `SELECT id, username, player_id, email, invite_code, member_tier, member_balance, total_recharge,
                is_merchant, store_name, store_description, store_notice, store_balance, last_store_checkin_at,
                is_banned, banned_reason, created_at, last_login_at
         FROM users
         WHERE username ILIKE $1 OR player_id ILIKE $1 OR email ILIKE $1 OR invite_code ILIKE $1 OR member_tier ILIKE $1
         ORDER BY created_at DESC, id DESC`,
        [`%${search}%`],
      )
      : await getRows(
        `SELECT id, username, player_id, email, invite_code, member_tier, member_balance, total_recharge,
                is_merchant, store_name, store_description, store_notice, store_balance, last_store_checkin_at,
                is_banned, banned_reason, created_at, last_login_at
         FROM users
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
      )
    res.json(rows.map(normalizeUser))
  } catch {
    res.status(500).json({ message: '获取用户失败' })
  }
})

app.put('/api/admin/users/:id/ban', authRequired, adminPermissionRequired('users'), async (req, res) => {
  try {
    const { id } = req.params
    const { is_banned, banned_reason = '' } = req.body || {}
    if (typeof is_banned !== 'boolean') return res.status(400).json({ message: '请提供正确的封禁状态' })
    const user = await getRow('SELECT * FROM users WHERE id = $1', [id])
    if (!user) return res.status(404).json({ message: '用户不存在' })
    const updated = await getRow(
      `UPDATE users
       SET is_banned = $1, banned_reason = $2
       WHERE id = $3
       RETURNING *`,
      [is_banned, is_banned ? String(banned_reason || '').trim() : '', id],
    )
    await logAction(is_banned ? 'user_banned' : 'user_unbanned', {
      id: updated.id,
      username: updated.username,
      admin: req.admin.username,
      reason: updated.banned_reason,
    })
    res.json(normalizeUser(updated))
  } catch {
    res.status(500).json({ message: '更新封禁状态失败' })
  }
})

app.put('/api/admin/users/:id/member', authRequired, adminPermissionRequired('users'), async (req, res) => {
  try {
    const { id } = req.params
    const { member_tier, balance_delta = 0, recharge_delta = 0, note = '' } = req.body || {}
    const normalizedBalanceDelta = Number(balance_delta)
    const normalizedRechargeDelta = Number(recharge_delta)
    if (!Number.isInteger(normalizedBalanceDelta) || !Number.isInteger(normalizedRechargeDelta)) {
      return res.status(400).json({ message: '余额变动和累计充值变动必须是整数' })
    }
    if (!['none', 'iron', 'gold', undefined].includes(member_tier)) {
      return res.status(400).json({ message: '会员等级无效' })
    }

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id])
      const user = rows[0]
      if (!user) {
        const error = new Error('用户不存在')
        error.statusCode = 404
        throw error
      }

      const nextBalance = Number(user.member_balance || 0) + normalizedBalanceDelta
      const nextTotalRecharge = Math.max(0, Number(user.total_recharge || 0) + normalizedRechargeDelta)
      if (nextBalance < 0) {
        const error = new Error('会员卡余额不能小于 0')
        error.statusCode = 400
        throw error
      }

      const autoTier = getMemberTierInfo(nextTotalRecharge).tier
      let nextTier = member_tier || user.member_tier || 'none'
      if (autoTier === 'gold' || nextTier === 'gold') nextTier = 'gold'
      else if (autoTier === 'iron' || nextTier === 'iron') nextTier = 'iron'
      else nextTier = 'none'

      const updatedResult = await client.query(
        `UPDATE users
         SET member_tier = $1, member_balance = $2, total_recharge = $3
         WHERE id = $4
         RETURNING *`,
        [nextTier, nextBalance, nextTotalRecharge, id],
      )
      const updated = updatedResult.rows[0]

      if (normalizedBalanceDelta !== 0) {
        await createWalletLog(client, {
          userId: updated.id,
          changeType: normalizedBalanceDelta > 0 ? (normalizedRechargeDelta > 0 ? 'recharge' : 'gift') : 'admin_adjustment',
          amount: normalizedBalanceDelta,
          balanceAfter: nextBalance,
          note: String(note || '').trim() || (normalizedRechargeDelta > 0 ? '管理员充值入账' : '管理员余额调整'),
          createdByAdmin: req.admin.username,
        })
      }

      return updated
    })

    await logAction('user_member_updated', {
      id,
      memberTier: result.member_tier,
      balanceDelta: normalizedBalanceDelta,
      rechargeDelta: normalizedRechargeDelta,
      admin: req.admin.username,
    })
    res.json(normalizeUser(result))
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message })
    res.status(500).json({ message: '更新会员信息失败' })
  }
})

app.put('/api/admin/users/:id/merchant', authRequired, adminPermissionRequired('users'), async (req, res) => {
  try {
    const { id } = req.params
    const { is_merchant, store_name = '' } = req.body || {}
    if (typeof is_merchant !== 'boolean') return res.status(400).json({ message: '请提供正确的商家认证状态' })
    const user = await getRow('SELECT * FROM users WHERE id = $1', [id])
    if (!user) return res.status(404).json({ message: '用户不存在' })
    const nextStoreName = String(store_name || '').trim() || user.player_id
    const updated = await withTransaction(async (client) => {
      const updatedResult = await client.query(
        `UPDATE users
         SET is_merchant = $1, store_name = $2
         WHERE id = $3
         RETURNING *`,
        [is_merchant, nextStoreName, id],
      )
      const nextUser = updatedResult.rows[0]

      if (is_merchant) {
        await client.query('UPDATE products SET store_name = $1 WHERE owner_user_id = $2', [nextStoreName, id])
      } else {
        await client.query('UPDATE products SET is_active = FALSE WHERE owner_user_id = $1', [id])
        const pendingOrders = await client.query('SELECT * FROM orders WHERE merchant_user_id = $1 AND status = $2 ORDER BY id ASC', [id, 'pending'])
        for (const order of pendingOrders.rows) {
          await cancelOrderAndRefundIfNeeded(client, order, {
            note: `商家权限关闭，订单自动取消并退款 ${order.order_number}`,
            adminName: req.admin.username,
          })
        }
      }

      return nextUser
    })
    await logAction(is_merchant ? 'merchant_enabled' : 'merchant_disabled', { id, admin: req.admin.username, storeName: nextStoreName })
    res.json(normalizeUser(updated))
  } catch {
    res.status(500).json({ message: '更新商家状态失败' })
  }
})

app.get('/api/admin/announcements', authRequired, adminPermissionRequired('announcements'), async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM announcements ORDER BY is_pinned DESC, updated_at DESC, id DESC')
    res.json(rows)
  } catch {
    res.status(500).json({ message: '获取公告失败' })
  }
})

app.post('/api/admin/announcements', authRequired, adminPermissionRequired('announcements'), async (req, res) => {
  try {
    const { title, content, is_pinned = false } = req.body || {}
    if (!title || !content) return res.status(400).json({ message: '公告标题和内容不能为空' })
    const created = await getRow(
      `INSERT INTO announcements (title, content, is_pinned, created_by_admin_id, created_by_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [String(title).trim(), String(content).trim(), Boolean(is_pinned), req.admin.id, req.admin.username],
    )
    await logAction('announcement_created', { id: created.id, admin: req.admin.username })
    res.status(201).json(created)
  } catch {
    res.status(500).json({ message: '创建公告失败' })
  }
})

app.put('/api/admin/announcements/:id', authRequired, adminPermissionRequired('announcements'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, content, is_pinned } = req.body || {}
    const announcement = await getRow('SELECT * FROM announcements WHERE id = $1', [id])
    if (!announcement) return res.status(404).json({ message: '公告不存在' })
    const updated = await getRow(
      `UPDATE announcements
       SET title = $1, content = $2, is_pinned = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        String(title ?? announcement.title).trim(),
        String(content ?? announcement.content).trim(),
        typeof is_pinned === 'boolean' ? is_pinned : announcement.is_pinned,
        id,
      ],
    )
    await logAction('announcement_updated', { id, admin: req.admin.username })
    res.json(updated)
  } catch {
    res.status(500).json({ message: '更新公告失败' })
  }
})

app.delete('/api/admin/announcements/:id', authRequired, adminPermissionRequired('announcements'), async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM announcements WHERE id = $1', [id])
    await logAction('announcement_deleted', { id, admin: req.admin.username })
    res.json({ message: '公告已删除' })
  } catch {
    res.status(500).json({ message: '删除公告失败' })
  }
})

app.get('/api/admin/payout-requests', authRequired, adminPermissionRequired('payouts'), async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM payout_requests ORDER BY requested_at DESC, id DESC')
    res.json(rows.map(normalizePayoutRequest))
  } catch {
    res.status(500).json({ message: '获取提现申请失败' })
  }
})

app.get('/api/admin/merchant-overview', authRequired, adminPermissionRequired('merchants'), async (req, res) => {
  try {
    const merchants = await getRows('SELECT * FROM users WHERE is_merchant = TRUE ORDER BY id DESC')
    const orders = await getRows('SELECT * FROM orders WHERE merchant_user_id IS NOT NULL ORDER BY created_at DESC, id DESC')
    const payoutRequests = await getRows('SELECT * FROM payout_requests ORDER BY requested_at DESC, id DESC')
    const walletLogs = await getRows(
      `SELECT * FROM wallet_logs
       WHERE change_type IN ('store_income', 'store_payout')
       ORDER BY created_at DESC, id DESC`,
    )
    res.json({
      merchants: merchants.map(normalizeUser),
      orders: orders.map(normalizeOrder),
      payout_requests: payoutRequests.map(normalizePayoutRequest),
      wallet_logs: walletLogs.map(normalizeWalletLog),
    })
  } catch {
    res.status(500).json({ message: '获取商家总览失败' })
  }
})

app.put('/api/admin/payout-requests/:id/status', authRequired, adminPermissionRequired('payouts'), async (req, res) => {
  try {
    const { id } = req.params
    const status = String(req.body?.status || '').trim()
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: '申请状态无效' })

    const request = await getRow('SELECT * FROM payout_requests WHERE id = $1', [id])
    if (!request) return res.status(404).json({ message: '提现申请不存在' })
    if (request.status !== 'pending') return res.status(400).json({ message: '该申请已处理' })

    await withTransaction(async (client) => {
      if (status === 'approved') {
        const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [request.user_id])
        const merchant = rows[0]
        if (!merchant) {
          const error = new Error('商家不存在')
          error.statusCode = 404
          throw error
        }
        if (Number(merchant.store_balance || 0) < Number(request.amount || 0)) {
          const error = new Error('店铺收入余额不足，无法批准该申请')
          error.statusCode = 400
          throw error
        }
        const nextStoreBalance = Number(merchant.store_balance || 0) - Number(request.amount || 0)
        await client.query('UPDATE users SET store_balance = $1 WHERE id = $2', [nextStoreBalance, merchant.id])
        await createWalletLog(client, {
          userId: merchant.id,
          changeType: 'store_payout',
          amount: -Number(request.amount || 0),
          balanceAfter: nextStoreBalance,
          note: `商家提现申请 #${request.id}`,
          createdByAdmin: req.admin.username,
        })
      }

      await client.query(
        `UPDATE payout_requests
         SET status = $1, reviewed_at = NOW(), reviewed_by_admin = $2
         WHERE id = $3`,
        [status, req.admin.username, id],
      )
    })

    await logAction('payout_request_reviewed', { id, status, admin: req.admin.username })
    res.json({ message: status === 'approved' ? '提现申请已批准' : '提现申请已拒绝' })
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message })
    res.status(500).json({ message: '处理提现申请失败' })
  }
})

app.get('/api/admin/invites', authRequired, adminPermissionRequired('invites'), async (req, res) => {
  try {
    const rows = await getRows(
      `SELECT ic.*, a.username AS created_by_admin_username, u.username AS used_by_username
       FROM invite_codes ic
       LEFT JOIN admins a ON a.id = ic.created_by_admin_id
       LEFT JOIN users u ON u.id = ic.used_by_user_id
       ORDER BY ic.created_at DESC, ic.id DESC`,
    )
    res.json(rows.map(normalizeInvite))
  } catch {
    res.status(500).json({ message: '获取邀请码失败' })
  }
})

app.post('/api/admin/invites', authRequired, adminPermissionRequired('invites'), async (req, res) => {
  try {
    const count = Math.min(Math.max(Number(req.body?.count || 1), 1), 50)
    const note = String(req.body?.note || '').trim()
    const assigned_to = String(req.body?.assigned_to || '').trim()
    const created = []
    for (let index = 0; index < count; index += 1) {
      let code = `INV-${randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10)}`
      while (await getRow('SELECT 1 FROM invite_codes WHERE code = $1', [code])) {
        code = `INV-${randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10)}`
      }
      const row = await getRow(
        `INSERT INTO invite_codes (code, note, assigned_to, created_by_admin_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [code, note, assigned_to, req.admin.id],
      )
      created.push(normalizeInvite({
        ...row,
        created_by_admin_username: req.admin.username,
        used_by_username: null,
      }))
    }
    await logAction('invite_codes_created', { count, admin: req.admin.username, assigned_to, note })
    res.status(201).json(created)
  } catch {
    res.status(500).json({ message: '生成邀请码失败' })
  }
})

app.put('/api/admin/invites/:id', authRequired, adminPermissionRequired('invites'), async (req, res) => {
  try {
    const { id } = req.params
    const invite = await getRow('SELECT * FROM invite_codes WHERE id = $1', [id])
    if (!invite) return res.status(404).json({ message: '邀请码不存在' })
    if (invite.used_by_user_id) return res.status(400).json({ message: '已使用的邀请码不能再修改分发信息' })
    const updated = await getRow(
      `UPDATE invite_codes
       SET note = $1, assigned_to = $2
       WHERE id = $3
       RETURNING *`,
      [String(req.body?.note || '').trim(), String(req.body?.assigned_to || '').trim(), id],
    )
    await logAction('invite_code_updated', { id, admin: req.admin.username })
    res.json(normalizeInvite({
      ...updated,
      created_by_admin_username: req.admin.username,
      used_by_username: null,
    }))
  } catch {
    res.status(500).json({ message: '更新邀请码失败' })
  }
})

app.post('/api/admin/admins', authRequired, rootAdminRequired, async (req, res) => {
  try {
    const { username, password, admin_role = ADMIN_ROLES.operations_admin } = req.body || {}
    if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' })
    if (!Object.values(ADMIN_ROLES).includes(admin_role) || admin_role === ADMIN_ROLES.super_admin) {
      return res.status(400).json({ message: '管理员角色无效' })
    }
    const exists = await getRow('SELECT 1 FROM admins WHERE username = $1', [username])
    if (exists) return res.status(400).json({ message: '用户名已存在' })
    const hash = await bcrypt.hash(password, 10)
    const created = await getRow(
      'INSERT INTO admins (username, admin_role, password_hash) VALUES ($1, $2, $3) RETURNING id, username, admin_role, created_at',
      [String(username).trim(), admin_role, hash],
    )
    await logAction('admin_created', { id: created.id, admin: req.admin.username })
    res.status(201).json(created)
  } catch {
    res.status(500).json({ message: '添加管理员失败' })
  }
})

app.delete('/api/admin/admins/:id', authRequired, rootAdminRequired, async (req, res) => {
  try {
    const { id } = req.params
    const target = await getRow('SELECT id, username FROM admins WHERE id = $1', [id])
    if (!target) return res.status(404).json({ message: '管理员不存在' })
    if (isRootAdmin(target)) return res.status(400).json({ message: '不能删除主管理员 admin' })
    const count = await getRow('SELECT COUNT(*)::int AS count FROM admins')
    if (count.count <= 1) return res.status(400).json({ message: '不能删除最后一个管理员' })
    if (Number(id) === Number(req.admin.id)) return res.status(400).json({ message: '不能删除当前登录管理员' })
    const deleted = await getRow('DELETE FROM admins WHERE id = $1 RETURNING id', [id])
    await logAction('admin_deleted', { id, admin: req.admin.username })
    res.json({ message: '管理员已删除' })
  } catch {
    res.status(500).json({ message: '删除管理员失败' })
  }
})

app.put('/api/admin/admins/:id/password', authRequired, rootAdminRequired, async (req, res) => {
  try {
    const { id } = req.params
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ message: '密码不能为空' })
    const target = await getRow('SELECT id, username FROM admins WHERE id = $1', [id])
    if (!target) return res.status(404).json({ message: '管理员不存在' })
    if (isRootAdmin(target) && Number(target.id) !== Number(req.admin.id)) {
      return res.status(400).json({ message: '不能修改主管理员 admin 的密码' })
    }
    const hash = await bcrypt.hash(password, 10)
    const updated = await getRow('UPDATE admins SET password_hash = $1 WHERE id = $2 RETURNING id', [hash, id])
    await logAction('admin_password_changed', { id, admin: req.admin.username })
    res.json({ message: '密码已更新' })
  } catch {
    res.status(500).json({ message: '修改密码失败' })
  }
})

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error?.message === '仅支持图片文件上传') {
    const message = error.code === 'LIMIT_FILE_SIZE' ? `图片不能超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` : error.message
    return res.status(400).json({ message })
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
