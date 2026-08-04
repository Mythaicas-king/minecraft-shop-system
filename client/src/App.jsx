import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import { api, authHeader, setAuthToken } from './api'
import './App.css'

const emptyProductForm = {
  name: '',
  description: '',
  price: '',
  category: '热门补给',
  image_url: '',
   stock_quantity: '1',
  is_active: true,
}

const emptyAdminForm = {
  username: '',
  password: '',
  confirmPassword: '',
  admin_role: 'operations_admin',
}

const emptyUserAuthForm = {
  username: '',
  player_id: '',
  email: '',
  invite_code: '',
  password: '',
  confirmPassword: '',
}

const fallbackImage = 'https://picsum.photos/seed/mc-shop-fallback/900/600'

const orderStatusLabels = {
  pending: { text: '待处理', className: 'badge-warning' },
  shipped: { text: '已发货', className: 'badge-success' },
  cancelled: { text: '已取消', className: 'badge-danger' },
}

const memberTierLabels = {
  none: '普通会员',
  iron: '铁锭会员',
  gold: '黄金会员',
}

const payoutStatusMeta = {
  pending: { text: '待处理', className: 'badge-warning' },
  approved: { text: '已批准', className: 'badge-success' },
  rejected: { text: '已拒绝', className: 'badge-danger' },
}

const storeCreditMeta = {
  none: { text: '系统商城', className: 'badge-success' },
  pending: { text: '待入账', className: 'badge-warning' },
  credited: { text: '已入账', className: 'badge-success' },
}

const adminRoleLabels = {
  super_admin: '主管理员',
  operations_admin: '运营管理员',
  order_admin: '订单管理员',
}

const adminRoleSectionMap = {
  super_admin: ['orders', 'products', 'users', 'merchants', 'invites', 'feedbacks', 'announcements', 'payouts', 'content', 'admins'],
  operations_admin: ['products', 'users', 'merchants', 'invites', 'feedbacks', 'announcements', 'payouts', 'content'],
  order_admin: ['orders'],
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ANNOUNCEMENT_PREVIEW_LENGTH = 140

function formatMemberDiscount(rate = 1) {
  if (rate >= 1) return '无折扣'
  return `${Math.round(rate * 10)} 折`
}

function buildRechargeCommand(amount) {
  return `/cmi pay Mythaicas ${amount}`
}

function getRechargeBonusAmount(amount, bonusMin = 100, bonusAmount = 10) {
  if (bonusMin <= 0 || bonusAmount <= 0) return 0
  if (amount >= bonusMin) return Math.floor(amount / bonusMin) * bonusAmount
  return 0
}

function formatFileSize(size = 0) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

async function compressImageFile(file, maxBytes = MAX_UPLOAD_BYTES) {
  const dataUrl = await readImageAsDataUrl(file)
  const image = await loadImageElement(dataUrl)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持图片压缩')

  let width = image.width
  let height = image.height
  let quality = 0.9
  let scale = 1

  while (scale > 0.4) {
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    while (quality >= 0.45) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= maxBytes) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'compressed'}-compressed.jpg`, { type: 'image/jpeg' })
      }
      quality -= 0.1
    }

    scale -= 0.15
    quality = 0.82
  }

  throw new Error('压缩后图片仍然超过 10MB，请换一张更小的图片')
}

async function prepareImageUpload(file) {
  if (!file) return null
  if (!file.type?.startsWith('image/')) throw new Error('仅支持图片文件上传')
  if (file.size <= MAX_UPLOAD_BYTES) {
    return { file, originalSize: file.size, finalSize: file.size, compressed: false }
  }
  const compressedFile = await compressImageFile(file, MAX_UPLOAD_BYTES)
  return {
    file: compressedFile,
    originalSize: file.size,
    finalSize: compressedFile.size,
    compressed: true,
  }
}

function createDefaultSiteContent() {
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
    recharge_notice: '复制报价指令后，请联系管理员并发送支付截图，等待会员卡入账。',
  }
}

function normalizeSiteContent(payload) {
  const defaults = createDefaultSiteContent()
  return {
    ...defaults,
    ...(payload && typeof payload === 'object' ? payload : {}),
    announcements: Array.isArray(payload?.announcements) ? payload.announcements : defaults.announcements,
    features: Array.isArray(payload?.features) ? payload.features : defaults.features,
    category_sections: Array.isArray(payload?.category_sections) ? payload.category_sections : defaults.category_sections,
  }
}

function normalizeMemberDashboard(payload) {
  return {
    user: payload?.user || null,
    orders: Array.isArray(payload?.orders) ? payload.orders : [],
    wallet_logs: Array.isArray(payload?.wallet_logs) ? payload.wallet_logs : [],
  }
}

function normalizeMerchantDashboard(payload) {
  return {
    user: payload?.user || null,
    products: Array.isArray(payload?.products) ? payload.products : [],
    orders: Array.isArray(payload?.orders) ? payload.orders : [],
    payout_requests: Array.isArray(payload?.payout_requests) ? payload.payout_requests : [],
    wallet_logs: Array.isArray(payload?.wallet_logs) ? payload.wallet_logs : [],
    checked_in_today: Boolean(payload?.checked_in_today),
  }
}

function readCachedJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeCachedJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore cache write failures
  }
}

function App() {
  return (
    <HashRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminShell />} />
        <Route path="/products" element={<Storefront page="products" />} />
        <Route path="/stores" element={<StoreDirectoryPage />} />
        <Route path="/stores/:storeId" element={<Storefront page="store" />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/me" element={<MemberCenterPage />} />
        <Route path="/recharge" element={<RechargePage />} />
        <Route path="/merchant" element={<MerchantCenterPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="*" element={<Storefront page="home" />} />
      </Routes>
    </HashRouter>
  )
}

function Shell({ children, title, right }) {
  return (
    <div className="page">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <div>
          <div className="eyebrow">Minecraft Shop System</div>
          <h1>{title}</h1>
        </div>
        <div className="topbar-actions">{right}</div>
      </header>
      {children}
    </div>
  )
}

function PublicNav({ currentUser, activePage = 'home' }) {
  return (
    <nav className="site-nav">
      <Link className={activePage === 'home' ? 'site-nav-link active' : 'site-nav-link'} to="/">首页</Link>
      <Link className={activePage === 'products' ? 'site-nav-link active' : 'site-nav-link'} to="/products">商品目录</Link>
      <Link className={activePage === 'stores' ? 'site-nav-link active' : 'site-nav-link'} to="/stores">其他商家</Link>
      <Link className={activePage === 'announcements' ? 'site-nav-link active' : 'site-nav-link'} to="/announcements">公告页</Link>
      <Link className={activePage === 'feedback' ? 'site-nav-link active' : 'site-nav-link'} to="/feedback">反馈页</Link>
      {currentUser && <Link className={activePage === 'member' ? 'site-nav-link active' : 'site-nav-link'} to="/me">会员中心</Link>}
      {currentUser && <Link className={activePage === 'recharge' ? 'site-nav-link active' : 'site-nav-link'} to="/recharge">会员充值</Link>}
      {currentUser?.is_merchant && <Link className={activePage === 'merchant' ? 'site-nav-link active' : 'site-nav-link'} to="/merchant">商家中心</Link>}
    </nav>
  )
}

function Storefront({ page = 'home' }) {
  const { storeId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isStorePage = page === 'store'
  const [products, setProducts] = useState(() => readCachedJson('ms_storefront_products_all', []))
  const [storeMeta, setStoreMeta] = useState(null)
  const [stores, setStores] = useState(() => readCachedJson('ms_storefront_stores', []))
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [sortMode, setSortMode] = useState('latest')
  const [siteContent, setSiteContent] = useState(() => normalizeSiteContent(readCachedJson('ms_storefront_site_content', {})))
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('ms_cart')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [queryForm, setQueryForm] = useState({ order_no: '', api_key: '' })
  const [queryResult, setQueryResult] = useState(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [successData, setSuccessData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [queryLoading, setQueryLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [userToken, setUserToken] = useState(() => localStorage.getItem('ms_user_token') || '')
  const [authModalMode, setAuthModalMode] = useState('login')
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [userAuthForm, setUserAuthForm] = useState(emptyUserAuthForm)
  const [userAuthLoading, setUserAuthLoading] = useState(false)

  useEffect(() => {
    if (page !== 'products') return
    const params = new URLSearchParams(location.search)
    setSelectedStoreId(params.get('store') || '')
    setSortMode(params.get('sort') || 'latest')
  }, [location.search, page])

  useEffect(() => {
    if (page !== 'products') return
    const params = new URLSearchParams(location.search)
    const currentStore = params.get('store') || ''
    const currentSort = params.get('sort') || 'latest'
    if (currentStore === selectedStoreId && currentSort === sortMode) return
    if (selectedStoreId) params.set('store', selectedStoreId)
    else params.delete('store')
    if (sortMode && sortMode !== 'latest') params.set('sort', sortMode)
    else params.delete('sort')
    const queryString = params.toString()
    navigate(`/products${queryString ? `?${queryString}` : ''}`, { replace: true })
  }, [selectedStoreId, sortMode, page, location.search, navigate])

  useEffect(() => {
    const loadProducts = isStorePage
      ? api.get(`/stores/${storeId}`).then(({ data }) => {
        setStoreMeta(data.store)
        setProducts(data.products || [])
        writeCachedJson('ms_storefront_products_all', data.products || [])
      })
      : api.get('/products', { params: selectedStoreId ? { store_id: selectedStoreId } : {} }).then(({ data }) => {
        setStoreMeta(null)
        setProducts(data)
        writeCachedJson('ms_storefront_products_all', data)
      })

    loadProducts.catch((error) => {
      toast.error(error?.response?.data?.message || '获取商品失败')
    })
    if (!isStorePage) {
      api.get('/stores').then(({ data }) => {
        setStores(data)
        writeCachedJson('ms_storefront_stores', data)
      }).catch(() => {})
    }
    api.get('/site-content').then(({ data }) => {
      const nextContent = normalizeSiteContent(data)
      setSiteContent(nextContent)
      writeCachedJson('ms_storefront_site_content', nextContent)
    }).catch(() => {})
  }, [isStorePage, storeId, selectedStoreId])

  useEffect(() => {
    if (!userToken) {
      setCurrentUser(null)
      return
    }
    api.get('/auth/me', authHeader(userToken))
      .then(({ data }) => {
        const previous = (() => {
          try {
            return JSON.parse(localStorage.getItem('ms_user') || 'null')
          } catch {
            return null
          }
        })()
        setCurrentUser(data.user)
        localStorage.setItem('ms_user', JSON.stringify(data.user))
        if (previous && Number(data.user.member_balance || 0) > Number(previous.member_balance || 0)) {
          toast.success(`会员卡余额已到账：${data.user.member_balance} 金币`)
        }
      })
      .catch((error) => {
        localStorage.removeItem('ms_user_token')
        localStorage.removeItem('ms_user')
        setUserToken('')
        setCurrentUser(null)
        toast.error(error?.response?.data?.message || '账号状态已失效，请重新登录')
      })
  }, [userToken])

  useEffect(() => {
    localStorage.setItem('ms_cart', JSON.stringify(cart))
  }, [cart])

  const persistUserSession = (token, user) => {
    localStorage.setItem('ms_user_token', token)
    localStorage.setItem('ms_user', JSON.stringify(user))
    setUserToken(token)
    setCurrentUser(user)
  }

  const clearUserSession = () => {
    localStorage.removeItem('ms_user_token')
    localStorage.removeItem('ms_user')
    setUserToken('')
    setCurrentUser(null)
    setDrawerOpen(false)
    setCheckoutOpen(false)
  }

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])
  const totalQuantity = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])

  const filteredProducts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    const searched = !keyword ? products : products.filter((product) => product.name.toLowerCase().includes(keyword))
    const sorted = [...searched]
    if (sortMode === 'price_asc') sorted.sort((a, b) => Number(a.price) - Number(b.price))
    else if (sortMode === 'price_desc') sorted.sort((a, b) => Number(b.price) - Number(a.price))
    else if (sortMode === 'name') sorted.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
    else sorted.sort((a, b) => Number(b.id) - Number(a.id))
    return sorted
  }, [products, searchTerm, sortMode])

  const featuredProduct = useMemo(() => {
    if (siteContent.featured_product_id) {
      return products.find((product) => product.id === Number(siteContent.featured_product_id)) || products[0]
    }
    return products[0]
  }, [products, siteContent.featured_product_id])

  const secondaryProducts = filteredProducts.filter((product) => product.id !== featuredProduct?.id).slice(0, 2)
  const categorySections = Array.isArray(siteContent.category_sections) && siteContent.category_sections.length ? siteContent.category_sections : createDefaultSiteContent().category_sections
  const groupedProducts = categorySections.map((section) => ({
    ...section,
    products: filteredProducts.filter((product) => product.category === section.key),
  })).filter((section) => section.products.length > 0)
  const uncategorizedProducts = filteredProducts.filter((product) => !categorySections.some((section) => section.key === product.category))
  const serverStats = [
    { value: `${products.length}`, label: '在售礼包' },
    { value: totalQuantity ? `${totalQuantity}` : '0', label: '购物车数量' },
    { value: '24H', label: '默认处理周期' },
    { value: 'Manual', label: '人工发货模式' },
  ]
  const storefrontTitle = isStorePage ? (storeMeta?.store_name || '店铺详情') : page === 'products' ? '商品目录' : '商品商店'
  const storefrontActivePage = isStorePage ? 'stores' : page === 'products' ? 'products' : 'home'
  const selectedStoreMeta = stores.find((item) => String(item.id) === String(selectedStoreId)) || null

  const addToCart = (product) => {
    if (!currentUser) {
      setAuthModalMode('login')
      setAuthModalOpen(true)
      toast.error('请先登录账号，再加入购物车')
      return
    }
    setCart((current) => {
      const exists = current.find((item) => item.id === product.id)
      if (exists) {
        return current.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      }
      return [...current, { ...product, quantity: 1 }]
    })
    toast.success('已加入购物车')
  }

  const adjustItem = (id, delta) => {
    setCart((current) =>
      current
        .map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    )
  }

  const removeItem = (id) => {
    setCart((current) => current.filter((item) => item.id !== id))
    toast.success('已移出购物车')
  }

  const clearCart = () => {
    setCart([])
    toast.success('购物车已清空')
  }

  const submitOrder = async (payload) => {
    setLoading(true)
    try {
      const { data } = await api.post('/orders', payload, authHeader(userToken))
      if (currentUser) {
        const nextUser = {
          ...currentUser,
          member_balance: data.member_balance ?? currentUser.member_balance,
          member_tier: data.member_tier || currentUser.member_tier,
          member_discount_rate: data.member_discount_rate ?? currentUser.member_discount_rate,
          member_tier_label: memberTierLabels[data.member_tier] || currentUser.member_tier_label,
        }
        setCurrentUser(nextUser)
        localStorage.setItem('ms_user', JSON.stringify(nextUser))
      }
      setSuccessData(data)
      setCart([])
      setCheckoutOpen(false)
      toast.success('订单提交成功')
    } catch (error) {
      toast.error(error?.response?.data?.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const submitUserAuth = async (event, captcha, refreshCaptcha) => {
    event.preventDefault()
    const payload = {
      username: userAuthForm.username.trim(),
      player_id: userAuthForm.player_id.trim(),
      email: userAuthForm.email.trim(),
      invite_code: userAuthForm.invite_code.trim().toUpperCase(),
      password: userAuthForm.password,
      captcha_token: captcha?.token || '',
      captcha_answer: captcha?.answer?.trim() || '',
    }
    if (!payload.username || !payload.password || (authModalMode === 'register' && (!payload.player_id || !payload.invite_code))) {
      toast.error(authModalMode === 'register' ? '请填写完整注册信息' : '请填写用户名和密码')
      return
    }
    if (authModalMode === 'register' && payload.password !== userAuthForm.confirmPassword) {
      toast.error('两次密码输入不一致')
      return
    }
    if (authModalMode === 'register' && !payload.captcha_answer) {
      toast.error('请先完成验证码')
      return
    }

    setUserAuthLoading(true)
    try {
      const { data } = authModalMode === 'register'
        ? await api.post('/auth/register', payload)
        : await api.post('/auth/login', { username: payload.username, password: payload.password })
      persistUserSession(data.token, data.user)
      setAuthModalOpen(false)
      setUserAuthForm(emptyUserAuthForm)
      toast.success(authModalMode === 'register' ? '注册成功，已自动登录' : '登录成功')
    } catch (error) {
      if (authModalMode === 'register') refreshCaptcha?.()
      toast.error(error?.response?.data?.message || (authModalMode === 'register' ? '注册失败' : '登录失败'))
    } finally {
      setUserAuthLoading(false)
    }
  }

  const queryOrder = async () => {
    setQueryLoading(true)
    try {
      const params = {}
      if (queryForm.order_no.trim()) params.order_no = queryForm.order_no.trim()
      if (queryForm.api_key.trim()) params.api_key = queryForm.api_key.trim()
      const { data } = await api.get('/orders/query', { params })
      setQueryResult(data)
      toast.success('订单查询成功')
    } catch (error) {
      setQueryResult(null)
      toast.error(error?.response?.data?.message || '未查询到订单')
    } finally {
      setQueryLoading(false)
    }
  }

  if (successData) {
    return (
      <Shell title="订单提交成功">
        <section className="panel success-panel">
          <p className="eyebrow">请保存以下信息</p>
          <div className="big-code">{successData.order_number}</div>
          <div className="copy-stack">
            <div className="copy-row">
              <code>{successData.order_number}</code>
              <CopyButton value={successData.order_number} label="复制订单号" />
            </div>
            <div className="copy-row">
              <code>{successData.api_key}</code>
              <CopyButton value={successData.api_key} label="复制 API Key" />
            </div>
          </div>
          <div className="summary-card">
            <p><strong>游戏ID：</strong>{successData.player_id}</p>
            <p><strong>订单总价：</strong>{successData.total_price} 金币</p>
            <p><strong>会员实付：</strong>{successData.paid_amount || successData.total_price} 金币</p>
            <p><strong>优惠金额：</strong>{successData.discount_amount || 0} 金币</p>
            {successData.member_balance !== undefined && <p><strong>剩余余额：</strong>{successData.member_balance} 金币</p>}
            <p><strong>商品数量：</strong>{successData.items.reduce((sum, item) => sum + item.quantity, 0)} 件</p>
          </div>
          <p className="muted">管理员将在24小时内处理您的订单，请使用 API Key 在订单查询页面查看进度。</p>
          <button className="primary-button" onClick={() => setSuccessData(null)}>返回首页</button>
        </section>
      </Shell>
    )
  }

  return (
      <Shell
      title={storefrontTitle}
      right={
        <>
          <PublicNav currentUser={currentUser} activePage={storefrontActivePage} />
          {currentUser ? (
            <>
              <span className="account-pill">{currentUser.username} · {currentUser.player_id}</span>
              <button className="ghost-button" onClick={clearUserSession}>退出账号</button>
            </>
          ) : (
            <>
              <button className="ghost-button" onClick={() => { setAuthModalMode('login'); setAuthModalOpen(true) }}>用户登录</button>
              <button className="ghost-button" onClick={() => { setAuthModalMode('register'); setAuthModalOpen(true) }}>注册账号</button>
            </>
          )}
          <Link className="ghost-button" to="/admin/login">管理员登录</Link>
          <button className="cart-button" onClick={() => currentUser ? setDrawerOpen(true) : (setAuthModalMode('login'), setAuthModalOpen(true))}>
            <span>购物车</span>
            <strong>{totalQuantity}</strong>
          </button>
        </>
      }
    >
      {page === 'home' && <>
      <section className="hero hero-home panel">
        <div className="hero-copy">
          <p className="eyebrow">{siteContent.hero_badge}</p>
          <h2>{siteContent.hero_title}</h2>
          <p className="muted hero-lead">{siteContent.hero_subtitle}</p>
          <p className="muted">{siteContent.hero_description}</p>
          <div className="feature-chips">
            <span>网页下单</span>
            <span>人工审核</span>
            <span>API Key 查询</span>
            <span>移动端适配</span>
          </div>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => currentUser ? setDrawerOpen(true) : (setAuthModalMode('login'), setAuthModalOpen(true))}>{currentUser ? '查看购物车' : '登录后购买'}</button>
            <a className="ghost-button" href="#query-section">订单查询</a>
          </div>
          <div className="account-banner">
            {currentUser
              ? `当前已登录账号：${currentUser.username}，下单将自动绑定到 ${currentUser.player_id}`
              : '现在必须先登录账号，才能加入购物车和购买；注册时需要输入后台发放的邀请码。'}
          </div>
        </div>
        <div className="hero-stage">
          <div className="status-banner">
            <span className="status-dot" />
            {siteContent.status_text}
          </div>
          <div className="server-stats-grid">
            {serverStats.map((item) => (
              <div className="stat-card" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="hero-panel-card">
            <div>
              <p className="eyebrow">{siteContent.featured_label}</p>
              <h3>{featuredProduct ? featuredProduct.name : siteContent.featured_title}</h3>
              <p className="muted">{featuredProduct ? featuredProduct.description : siteContent.featured_description}</p>
            </div>
            <div className="hero-panel-price">
              <strong>{featuredProduct ? `${featuredProduct.price} 金币` : `${total} 金币`}</strong>
              {featuredProduct && <button className="ghost-button" onClick={() => addToCart(featuredProduct)}>加入推荐礼包</button>}
            </div>
          </div>
        </div>
      </section>

      <section className="info-grid">
        <article className="panel notice-panel">
          <div className="section-head compact">
            <h3>{siteContent.announcement_title}</h3>
            <p className="muted">{siteContent.announcement_subtitle}</p>
          </div>
          <div className="announcement-list">
            {siteContent.announcements.map((item) => (
              <div className="announcement-item" key={item}>{item}</div>
            ))}
          </div>
        </article>
        <article className="panel features-panel">
          <div className="section-head compact">
            <h3>{siteContent.feature_title}</h3>
            <p className="muted">{siteContent.feature_subtitle}</p>
          </div>
          <div className="feature-card-grid">
            {siteContent.features.map((card) => (
              <div className="feature-card" key={card.title}>
                <strong>{card.title}</strong>
                <p>{card.text}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {featuredProduct && (
        <section className="spotlight panel">
          <div className="spotlight-copy">
            <p className="eyebrow">本周推荐</p>
            <h3>{featuredProduct.name}</h3>
            <p className="muted">{featuredProduct.description}</p>
            <div className="spotlight-actions">
              <strong>{featuredProduct.price} 金币</strong>
              <button className="primary-button" onClick={() => addToCart(featuredProduct)}>立即加入</button>
            </div>
          </div>
          <SafeImage className="spotlight-image" src={featuredProduct.image_url} alt={featuredProduct.name} />
        </section>
      )}

      {!!secondaryProducts.length && (
        <section className="showcase-grid">
          {secondaryProducts.map((product) => (
            <article className="panel showcase-card" key={product.id}>
              <SafeImage className="showcase-image" src={product.image_url} alt={product.name} />
              <div className="showcase-copy">
                <p className="eyebrow">精选补给</p>
                <h3>{product.name}</h3>
                {product.owner_user_id ? <Link className="text-button store-link-button" to={`/stores/${product.owner_user_id}`}>{product.store_name || '系统商城'}</Link> : <p className="muted tiny-text">{product.store_name || '系统商城'}</p>}
                <p className="muted">{product.description}</p>
                <div className="spotlight-actions">
                  <strong>{product.price} 金币</strong>
                  <button className="ghost-button" onClick={() => addToCart(product)}>加入购物车</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
      </>}

      {(page === 'products' || isStorePage) && <section className="catalog-toolbar panel">
        <div className="catalog-heading">
          <p className="eyebrow">{isStorePage ? 'STORE DETAIL' : 'SHOP CATALOG'}</p>
          <h3>{isStorePage ? (storeMeta?.store_name || '店铺商品') : selectedStoreMeta ? `${selectedStoreMeta.store_name} 的商品` : '热卖商品'}</h3>
          <p className="muted">{isStorePage ? `${storeMeta?.username || '商家'} 的在售商品都在这里，支持直接加入购物车。` : selectedStoreMeta ? '你当前正在浏览指定商家的在售商品，也可以切回全部商品。' : '按分类浏览商品，点击卡片查看详情；登录后即可加入购物车。'}</p>
          {isStorePage && storeMeta && <div className="feature-chips"><span>店主：{storeMeta.username}</span><span>{storeMeta.product_count || products.length} 件商品</span><span>{storeMeta.has_checked_in_today ? '今日已签到' : '今日未签到'}</span></div>}
          {isStorePage && <div className="hero-actions"><Link className="ghost-button" to="/stores">返回商家广场</Link><Link className="ghost-button" to="/products">去商品目录</Link><Link className="ghost-button" to="/">直达首页</Link></div>}
        </div>
        <div className="catalog-filter-stack">
          {!isStorePage && (
            <label className="catalog-search">
              <span>按店铺筛选</span>
              <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>
                <option value="">全部店铺</option>
                {stores.map((item) => <option key={item.id} value={item.id}>{item.store_name}</option>)}
              </select>
            </label>
          )}
          <label className="catalog-search">
            <span>商品排序</span>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
              <option value="latest">最新上架</option>
              <option value="price_asc">价格从低到高</option>
              <option value="price_desc">价格从高到低</option>
              <option value="name">按名称排序</option>
            </select>
          </label>
          <label className="catalog-search">
            <span>搜索商品</span>
            <input placeholder="输入商品名进行搜索" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </label>
        </div>
      </section>}

      {page === 'products' && !!stores.length && (
        <section className="panel store-filter-panel">
          <div className="section-head compact">
            <h3>快捷筛选店铺</h3>
            {selectedStoreId ? <button className="ghost-button small" onClick={() => setSelectedStoreId('')}>查看全部商品</button> : <p className="muted">点击标签可只看某一家店</p>}
          </div>
          <div className="feature-chips store-chip-grid">
            <button type="button" className={!selectedStoreId ? 'ghost-button small active-chip' : 'ghost-button small'} onClick={() => setSelectedStoreId('')}>全部</button>
            {stores.map((item) => (
              <button type="button" key={item.id} className={String(selectedStoreId) === String(item.id) ? 'ghost-button small active-chip' : 'ghost-button small'} onClick={() => setSelectedStoreId(String(item.id))}>{item.store_name}</button>
            ))}
          </div>
        </section>
      )}

      {isStorePage && storeMeta && (
        <section className="store-info-grid">
          <article className="panel store-profile-card">
            <p className="eyebrow">STORE PROFILE</p>
            <h3>{storeMeta.store_name}</h3>
            <p className="muted">{storeMeta.store_description || '这位商家还没有填写店铺简介。'}</p>
            <div className="feature-chips"><span>主营补给</span><span>支持网页下单</span><span>人工处理发货</span></div>
          </article>
          <article className="panel store-notice-card">
            <p className="eyebrow">STORE NOTICE</p>
            <h3>店铺公告</h3>
            <p className="muted announcement-body-text">{storeMeta.store_notice || '当前暂无店铺公告，购买前可先查看商品详情。'}</p>
          </article>
          <article className="panel store-owner-card">
            <p className="eyebrow">OWNER INFO</p>
            <h3>{storeMeta.username}</h3>
            <div className="mini-list">
              <span>{storeMeta.product_count || products.length} 件在售商品</span>
              <span>{storeMeta.has_checked_in_today ? '今日已签到' : '今日未签到'}</span>
              <span>店铺余额 {storeMeta.store_balance || 0} 金币</span>
            </div>
            <div className="button-group">
              <Link className="ghost-button" to="/stores">更多商家</Link>
              <Link className="primary-button" to="/products">浏览全部商品</Link>
            </div>
          </article>
        </section>
      )}

      {(page === 'products' || isStorePage) && groupedProducts.map((section) => (
        <section className="category-section" key={section.key}>
          <div className="section-head compact">
            <h3>{section.title}</h3>
            <p className="muted">{section.products.length} 件商品</p>
          </div>
          <div className="product-grid compact-grid">
            {section.products.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={addToCart} onView={setSelectedProduct} />
            ))}
          </div>
        </section>
      ))}

      {(page === 'products' || isStorePage) && !!uncategorizedProducts.length && (
        <section className="category-section">
          <div className="section-head compact">
            <h3>更多商品</h3>
            <p className="muted">未归类商品</p>
          </div>
          <div className="product-grid compact-grid">
            {uncategorizedProducts.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={addToCart} onView={setSelectedProduct} />
            ))}
          </div>
        </section>
      )}

      {(page === 'products' || isStorePage) && !groupedProducts.length && !uncategorizedProducts.length && (
        <section className="panel empty-state catalog-empty">
          <strong>{isStorePage ? '这家店暂时没有可展示商品' : '没有找到匹配商品'}</strong>
          <p className="muted">{isStorePage ? '可能是商家今天未签到，或者当前商品都已下架。' : '换一个商品名试试，或者清空搜索条件。'}</p>
          <button className="ghost-button" onClick={() => setSearchTerm('')}>清空搜索</button>
        </section>
      )}

      {page === 'home' && <section className="query-panel panel" id="query-section">
        <div>
          <h3>订单查询</h3>
          <p className="muted">输入订单号或 API Key 查看状态。</p>
        </div>
        <div className="query-form">
          <input placeholder="订单号 MC-XXXXXXXX" value={queryForm.order_no} onChange={(e) => setQueryForm((s) => ({ ...s, order_no: e.target.value }))} />
          <input placeholder="API Key sk-..." value={queryForm.api_key} onChange={(e) => setQueryForm((s) => ({ ...s, api_key: e.target.value }))} />
          <button className="primary-button" onClick={queryOrder} disabled={queryLoading}>{queryLoading ? '查询中...' : '查询'}</button>
        </div>
        {queryResult && <OrderStatusCard order={queryResult} />}
      </section>}

      {drawerOpen && (
        <CartDrawer
          cart={cart}
          total={total}
          onClose={() => setDrawerOpen(false)}
          onAdjust={adjustItem}
          onRemove={removeItem}
          onClear={clearCart}
          onCheckout={() => setCheckoutOpen(true)}
        />
      )}

      {checkoutOpen && (
        <CheckoutModal
          loading={loading}
          onClose={() => setCheckoutOpen(false)}
          onSubmit={submitOrder}
          cart={cart}
          total={total}
          currentUser={currentUser}
        />
      )}

      {selectedProduct && (
        <ProductDetailModal product={selectedProduct} onAdd={addToCart} onClose={() => setSelectedProduct(null)} />
      )}

      {authModalOpen && (
        <UserAuthModal
          form={userAuthForm}
          loading={userAuthLoading}
          mode={authModalMode}
          onChange={setUserAuthForm}
          onClose={() => setAuthModalOpen(false)}
          onModeChange={setAuthModalMode}
          onSubmit={submitUserAuth}
        />
      )}
    </Shell>
  )
}

function SafeImage({ alt, className = '', src }) {
  const [imageSrc, setImageSrc] = useState(src || fallbackImage)

  useEffect(() => {
    setImageSrc(src || fallbackImage)
  }, [src])

  return <img className={className} src={imageSrc} alt={alt} onError={() => setImageSrc(fallbackImage)} />
}

function ProductCard({ onAdd, onView, product }) {
  return (
    <article className="product-card panel" key={product.id}>
      <SafeImage src={product.image_url} alt={product.name} />
      <div className="product-body">
        <div className="product-meta-row">
          <span className="category-chip">{product.category}</span>
          <button className="text-button" onClick={() => onView(product)}>商品详情</button>
        </div>
        <h4>{product.name}</h4>
        <p className="muted tiny-text">{product.store_name || '系统商城'}</p>
        {product.owner_user_id && <Link className="text-button store-link-button" to={`/stores/${product.owner_user_id}`}>查看店铺</Link>}
        <p>{product.description}</p>
        <div className="product-foot">
          <strong>{product.price} 金币</strong>
          <button className="primary-button small" onClick={() => onAdd(product)}>加入购物车</button>
        </div>
      </div>
    </article>
  )
}

function ProductDetailModal({ product, onAdd, onClose }) {
  return (
    <ModalFrame title={product.name} onClose={onClose}>
      <div className="detail-modal-grid">
        <SafeImage className="detail-image" src={product.image_url} alt={product.name} />
        <div className="form-grid">
          <span className="category-chip">{product.category}</span>
          <p className="muted">{product.description}</p>
          <div className="summary-card">
            <p><strong>商品名称：</strong>{product.name}</p>
            <p><strong>分类：</strong>{product.category}</p>
            <p><strong>店铺：</strong>{product.store_name || '系统商城'}</p>
            <p><strong>价格：</strong>{product.price} 金币</p>
          </div>
          <div className="button-group">
            <button className="ghost-button" onClick={onClose}>关闭</button>
            {product.owner_user_id && <Link className="ghost-button" to={`/stores/${product.owner_user_id}`} onClick={onClose}>进入店铺</Link>}
            <button className="primary-button" onClick={() => onAdd(product)}>加入购物车</button>
          </div>
        </div>
      </div>
    </ModalFrame>
  )
}

function UploadDropzone({ imageUrl, loading, onFileSelect, uploadMeta }) {
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files) => {
    const file = files?.[0]
    if (!file) return
    onFileSelect(file)
  }

  return (
    <div
      className={dragging ? 'upload-dropzone active' : 'upload-dropzone'}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      <strong>{loading ? '上传中...' : '拖拽图片到这里上传'}</strong>
      <p className="muted">或点击选择文件，上传后会自动写入图片 URL。超过 10MB 会先尝试压缩，仍超出则禁止上传。</p>
      <label className="ghost-button upload-button">
        选择图片
        <input type="file" accept="image/*" hidden onChange={(e) => handleFiles(e.target.files)} />
      </label>
      {uploadMeta && (
        <div className="upload-meta-card">
          <span>原图：{formatFileSize(uploadMeta.originalSize)}</span>
          <span>上传：{formatFileSize(uploadMeta.finalSize)}</span>
          <span>{uploadMeta.compressed ? '已压缩上传' : '无需压缩'}</span>
        </div>
      )}
      {imageUrl && <SafeImage className="upload-preview" src={imageUrl} alt="商品预览" />}
    </div>
  )
}

function CartDrawer({ cart, total, onClose, onAdjust, onCheckout, onRemove, onClear }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>购物车</h3>
          <button className="ghost-button" onClick={onClose}>关闭</button>
        </div>
        <div className="drawer-list">
          {cart.length === 0 ? (
            <div className="empty-state">
              <strong>购物车还是空的</strong>
              <p className="muted">先挑几件商品，再回来统一下单。</p>
            </div>
          ) : cart.map((item) => (
            <div className="cart-item" key={item.id}>
              <SafeImage src={item.image_url} alt={item.name} />
              <div>
                <strong>{item.name}</strong>
                <p>{item.price} 金币</p>
                <div className="stepper-row">
                  <div className="stepper">
                    <button onClick={() => onAdjust(item.id, -1)}>-</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => onAdjust(item.id, 1)}>+</button>
                  </div>
                  <button className="text-button" onClick={() => onRemove(item.id)}>移除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="drawer-foot stretch">
          <strong>总价：{total} 金币</strong>
          <div className="button-group">
            <button className="ghost-button" disabled={!cart.length} onClick={onClear}>清空</button>
            <button className="primary-button" disabled={!cart.length} onClick={onCheckout}>结算</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function CheckoutModal({ currentUser, loading, onClose, onSubmit, cart, total }) {
  const [form, setForm] = useState({ player_id: currentUser?.player_id || '', note: '', email: currentUser?.email || '' })
  const [captcha, setCaptcha] = useState({ token: '', prompt: '', answer: '', expires_in: 0, loading: false })
  const payableTotal = Math.round(total * Number(currentUser?.member_discount_rate || 1))
  const discountAmount = Math.max(0, total - payableTotal)

  useEffect(() => {
    setForm((current) => ({
      ...current,
      player_id: currentUser?.player_id || current.player_id,
      email: currentUser?.email || current.email,
    }))
  }, [currentUser])

  const loadCaptcha = async () => {
    setCaptcha((current) => ({ ...current, loading: true }))
    try {
      const { data } = await api.get('/captcha', { params: { purpose: 'order' } })
      setCaptcha({ ...data, answer: '', loading: false })
    } catch {
      setCaptcha((current) => ({ ...current, loading: false }))
      toast.error('验证码加载失败')
    }
  }

  useEffect(() => {
    loadCaptcha()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const effectivePlayerId = currentUser?.player_id || form.player_id.trim()
    if (!effectivePlayerId) {
      toast.error('游戏ID不能为空')
      return
    }
    if (!captcha.answer.trim()) {
      toast.error('请先完成验证码')
      return
    }
    onSubmit({
      player_id: effectivePlayerId,
      note: form.note.trim(),
      email: form.email.trim(),
      captcha_token: captcha.token,
      captcha_answer: captcha.answer.trim(),
      items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
    })
  }

  return (
    <ModalFrame title="提交订单" onClose={onClose}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="mini-list">
          {cart.map((item) => <span key={item.id}>{item.name} x{item.quantity}</span>)}
        </div>
        <label>
          游戏ID
          <input value={currentUser?.player_id || form.player_id} disabled={Boolean(currentUser)} onChange={(e) => setForm((s) => ({ ...s, player_id: e.target.value }))} />
        </label>
        {currentUser && <p className="muted">当前账号已绑定游戏ID，如需修改请先联系管理员处理。</p>}
        <label>
          自定义备注 / 物资需求说明
          <textarea value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
        </label>
        <label>
          联系邮箱
          <input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
        </label>
        {currentUser && (
          <div className="summary-card">
            <p><strong>会员等级：</strong>{currentUser.member_tier_label || memberTierLabels[currentUser.member_tier] || '普通会员'}（{formatMemberDiscount(currentUser.member_discount_rate)}）</p>
            <p><strong>会员卡余额：</strong>{currentUser.member_balance || 0} 金币</p>
            <p><strong>优惠金额：</strong>{discountAmount} 金币</p>
          </div>
        )}
        <CaptchaField
          answer={captcha.answer}
          loading={captcha.loading}
          prompt={captcha.prompt}
          onAnswerChange={(value) => setCaptcha((current) => ({ ...current, answer: value }))}
          onRefresh={loadCaptcha}
        />
        <div className="drawer-foot stretch">
          <strong>应付：{payableTotal} 金币</strong>
          <button className="primary-button" disabled={loading}>{loading ? '提交中...' : '提交订单'}</button>
        </div>
      </form>
    </ModalFrame>
  )
}

function UserAuthModal({ form, loading, mode, onChange, onClose, onModeChange, onSubmit }) {
  const [captcha, setCaptcha] = useState({ token: '', prompt: '', answer: '', expires_in: 0, loading: false })

  const loadCaptcha = async () => {
    setCaptcha((current) => ({ ...current, loading: true }))
    try {
      const { data } = await api.get('/captcha', { params: { purpose: 'register' } })
      setCaptcha({ ...data, answer: '', loading: false })
    } catch {
      setCaptcha((current) => ({ ...current, loading: false }))
      toast.error('验证码加载失败')
    }
  }

  useEffect(() => {
    if (mode === 'register') loadCaptcha()
  }, [mode])

  return (
    <ModalFrame title={mode === 'register' ? '注册账号' : '用户登录'} onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => onSubmit(event, captcha, loadCaptcha)}>
        <div className="segmented-toggle">
          <button type="button" className={mode === 'login' ? 'nav-item active' : 'nav-item'} onClick={() => onModeChange('login')}>登录</button>
          <button type="button" className={mode === 'register' ? 'nav-item active' : 'nav-item'} onClick={() => onModeChange('register')}>注册</button>
        </div>
        <label>
          账号名
          <input value={form.username} onChange={(e) => onChange((current) => ({ ...current, username: e.target.value }))} />
        </label>
        {mode === 'register' && (
          <label>
            绑定游戏ID
            <input value={form.player_id} onChange={(e) => onChange((current) => ({ ...current, player_id: e.target.value }))} />
          </label>
        )}
        {mode === 'register' && (
          <label>
            联系邮箱
            <input type="email" value={form.email} onChange={(e) => onChange((current) => ({ ...current, email: e.target.value }))} />
          </label>
        )}
        {mode === 'register' && (
          <label>
            邀请码
            <input value={form.invite_code} onChange={(e) => onChange((current) => ({ ...current, invite_code: e.target.value.toUpperCase() }))} placeholder="例如 INV-ABCDEFG123" />
          </label>
        )}
        <label>
          密码
          <input type="password" value={form.password} onChange={(e) => onChange((current) => ({ ...current, password: e.target.value }))} />
        </label>
        {mode === 'register' && (
          <label>
            确认密码
            <input type="password" value={form.confirmPassword} onChange={(e) => onChange((current) => ({ ...current, confirmPassword: e.target.value }))} />
          </label>
        )}
        {mode === 'register' && (
          <CaptchaField
            answer={captcha.answer}
            loading={captcha.loading}
            prompt={captcha.prompt}
            onAnswerChange={(value) => setCaptcha((current) => ({ ...current, answer: value }))}
            onRefresh={loadCaptcha}
          />
        )}
        <div className="button-group">
          <button type="button" className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" disabled={loading}>{loading ? '提交中...' : mode === 'register' ? '创建账号' : '立即登录'}</button>
        </div>
      </form>
    </ModalFrame>
  )
}

function CaptchaField({ answer, loading, prompt, onAnswerChange, onRefresh }) {
  return (
    <div className="captcha-block">
      <div className="captcha-head">
        <strong>人机校验</strong>
        <button type="button" className="ghost-button small" onClick={onRefresh} disabled={loading}>{loading ? '加载中...' : '刷新验证码'}</button>
      </div>
      <label>
        请输入结果
        <div className="captcha-row">
          <div className="captcha-prompt">{prompt || '加载中...'}</div>
          <input value={answer} onChange={(e) => onAnswerChange(e.target.value)} placeholder="填写答案" />
        </div>
      </label>
    </div>
  )
}

function OrderStatusCard({ order }) {
  const label = orderStatusLabels[order.status] || orderStatusLabels.pending
  return (
    <div className="order-status panel">
      <div className={`status-pill ${label.className}`}>{label.text}</div>
      <div className="status-grid">
        <p><strong>订单号：</strong>{order.order_number}</p>
        <p><strong>游戏ID：</strong>{order.player_id}</p>
        <p><strong>总价：</strong>{order.total_price} 金币</p>
        <p><strong>实付：</strong>{order.paid_amount || order.total_price} 金币</p>
        <p><strong>下单时间：</strong>{formatTime(order.created_at)}</p>
      </div>
      <div className="mini-list">
        {order.items.map((item) => <span key={`${order.order_number}-${item.product_id}`}>{item.name} x{item.quantity}</span>)}
      </div>
      {order.note && <p className="muted"><strong>备注：</strong>{order.note}</p>}
      {order.status === 'shipped' && <p className="muted shipped-note">管理员已完成发货，请回到服务器内查收。</p>}
    </div>
  )
}

function CopyButton({ value, label = '复制' }) {
  return <button className="ghost-button" onClick={() => { navigator.clipboard.writeText(value); toast.success('已复制') }}>{label}</button>
}

function ExpandableAnnouncement({ content }) {
  const [expanded, setExpanded] = useState(false)
  const normalized = String(content || '')
  const shouldCollapse = normalized.length > ANNOUNCEMENT_PREVIEW_LENGTH
  const displayText = !shouldCollapse || expanded ? normalized : `${normalized.slice(0, ANNOUNCEMENT_PREVIEW_LENGTH)}...`

  return (
    <div className="announcement-expand-wrap">
      <p className="muted announcement-body-text">{displayText}</p>
      {shouldCollapse && (
        <button type="button" className="text-button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? '收起公告' : '展开全文'}
        </button>
      )}
    </div>
  )
}

function FeedbackPage() {
  const [form, setForm] = useState({ contact: '', message: '' })
  const [loading, setLoading] = useState(false)
  const userToken = localStorage.getItem('ms_user_token') || ''
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('ms_user') || 'null')
    } catch {
      return null
    }
  })()

  const submit = async (event) => {
    event.preventDefault()
    if (!form.message.trim()) {
      toast.error('请填写反馈内容')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/feedback', {
        contact: form.contact.trim(),
        message: form.message.trim(),
      }, authHeader(userToken))
      toast.success(data.message || '反馈已提交')
      setForm({ contact: '', message: '' })
    } catch (error) {
      toast.error(error?.response?.data?.message || '提交反馈失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell
      title="意见反馈"
      right={
        <PublicNav currentUser={user} activePage="feedback" />
      }
    >
      <section className="feedback-layout">
        <div className="panel feedback-intro">
          <p className="eyebrow">FEEDBACK DESK</p>
          <h2>告诉我们哪里可以做得更好</h2>
          <p className="muted">商品建议、库存问题、订单体验或页面反馈，都可以在这里告诉管理员。</p>
          <div className="feature-chips">
            <span>商品建议</span>
            <span>订单问题</span>
            <span>页面反馈</span>
          </div>
          {user && <p className="account-banner">当前反馈会关联账号：{user.username}</p>}
        </div>
        <form className="panel form-grid feedback-form" onSubmit={submit}>
          <h3>提交反馈</h3>
          <label>联系方式（可选）<input value={form.contact} onChange={(e) => setForm((current) => ({ ...current, contact: e.target.value }))} placeholder="邮箱、QQ 或 Discord" /></label>
          <label>反馈内容<textarea value={form.message} onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))} placeholder="请描述你遇到的问题或想增加的功能" /></label>
          <button className="primary-button" disabled={loading}>{loading ? '提交中...' : '提交反馈'}</button>
        </form>
      </section>
    </Shell>
  )
}

function MemberCenterPage() {
  const [data, setData] = useState(() => normalizeMemberDashboard(readCachedJson('ms_member_dashboard_cache', { user: null, orders: [], wallet_logs: [] })))
  const [loading, setLoading] = useState(true)
  const userToken = localStorage.getItem('ms_user_token') || ''

  useEffect(() => {
    if (!userToken) {
      setLoading(false)
      return
    }
    api.get('/me/dashboard', authHeader(userToken))
      .then(({ data: response }) => {
        const next = normalizeMemberDashboard(response)
        setData(next)
        writeCachedJson('ms_member_dashboard_cache', next)
      })
      .catch((error) => toast.error(error?.response?.data?.message || '加载会员中心失败'))
      .finally(() => setLoading(false))
  }, [userToken])

  if (!userToken) {
    return (
      <Shell title="会员中心" right={<PublicNav currentUser={null} activePage="member" />}>
        <section className="panel empty-state">
          <strong>请先登录账号</strong>
          <p className="muted">登录后才能查看历史订单、会员卡余额和充值记录。</p>
          <Link className="primary-button" to="/">返回首页</Link>
        </section>
      </Shell>
    )
  }

  const user = data.user

  return (
    <Shell title="会员中心" right={<PublicNav currentUser={user} activePage="member" />}>
      <section className="member-layout">
        <div className="panel member-summary-grid">
          <div className="member-summary-card">
            <p className="eyebrow">MEMBER PROFILE</p>
            <h2>{user?.username || '加载中...'}</h2>
            <p className="muted">{user?.member_tier_label || memberTierLabels[user?.member_tier] || '普通会员'} · {formatMemberDiscount(user?.member_discount_rate || 1)}</p>
          </div>
          <div className="stat-card"><strong>{user?.member_balance || 0}</strong><span>会员卡余额</span></div>
          <div className="stat-card"><strong>{user?.total_recharge || 0}</strong><span>累计充值</span></div>
          <div className="stat-card"><strong>{data.orders.length}</strong><span>历史订单</span></div>
        </div>

        <div className="member-actions-row">
          <Link className="primary-button" to="/recharge">会员卡充值</Link>
          <Link className="ghost-button" to="/">直达首页</Link>
        </div>

        <section className="panel">
          <div className="section-toolbar wrap">
            <div>
              <h3>历史订单</h3>
              <p className="muted">这里会显示你使用会员卡支付的全部订单记录。</p>
            </div>
          </div>
          <div className="table-wrap admin-table-wrap">
            <table>
              <thead><tr><th>订单号</th><th>提交时间</th><th>总价</th><th>实付</th><th>会员等级</th><th>状态</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="6">加载中...</td></tr> : data.orders.map((order) => (
                  <tr key={order.order_number}>
                    <td>{order.order_number}</td>
                    <td>{formatTime(order.created_at)}</td>
                    <td>{order.total_price}</td>
                    <td>{order.paid_amount || order.total_price}</td>
                    <td>{memberTierLabels[order.member_tier] || '普通会员'}</td>
                    <td><span className={`status-pill ${orderStatusLabels[order.status]?.className || 'badge-warning'}`}>{orderStatusLabels[order.status]?.text || order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="section-toolbar wrap">
            <div>
              <h3>余额变动记录</h3>
              <p className="muted">管理员赠送、充值入账和订单扣款都会记录在这里。</p>
            </div>
          </div>
          <div className="table-wrap admin-table-wrap">
            <table>
              <thead><tr><th>时间</th><th>类型</th><th>变动</th><th>余额</th><th>备注</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="5">加载中...</td></tr> : data.wallet_logs.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.created_at)}</td>
                    <td>{item.change_type}</td>
                    <td>{item.amount > 0 ? `+${item.amount}` : item.amount}</td>
                    <td>{item.balance_after}</td>
                    <td>{item.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </Shell>
  )
}

function StoreDirectoryPage() {
  const [stores, setStores] = useState(() => readCachedJson('ms_storefront_stores', []))
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('ms_user') || 'null')
    } catch {
      return null
    }
  })()

  useEffect(() => {
    api.get('/stores').then(({ data }) => {
      setStores(data)
      writeCachedJson('ms_storefront_stores', data)
    }).catch(() => toast.error('获取商家列表失败'))
  }, [])

  return (
    <Shell title="其他商家" right={<PublicNav currentUser={user} activePage="stores" />}>
      <section className="panel">
        <div className="section-toolbar wrap">
          <div>
            <h3>商家广场</h3>
            <p className="muted">查看已入驻商家与店铺状态。</p>
          </div>
          <Link className="ghost-button" to="/">直达首页</Link>
        </div>
        <div className="product-grid compact-grid">
          {stores.map((store) => (
            <article className="product-card panel" key={store.id}>
              <div className="product-body">
                <div className="product-meta-row">
                  <span className="category-chip">商家店铺</span>
                  <span className={`status-pill ${store.has_checked_in_today ? 'badge-success' : 'badge-warning'}`}>{store.has_checked_in_today ? '今日已签到' : '今日未签到'}</span>
                </div>
                <h4>{store.store_name || store.username}</h4>
                <p className="muted tiny-text">店主：{store.username}</p>
                <p className="muted">店铺余额：{store.store_balance || 0} 金币</p>
                <div className="button-group">
                  <Link className="primary-button" to={`/stores/${store.id}`}>进入店铺</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </Shell>
  )
}

function MerchantCenterPage() {
  const [dashboard, setDashboard] = useState(() => normalizeMerchantDashboard(readCachedJson('ms_merchant_dashboard_cache', { user: null, products: [], orders: [], payout_requests: [], wallet_logs: [], checked_in_today: false })))
  const [loading, setLoading] = useState(true)
  const [storeForm, setStoreForm] = useState({ store_name: '', store_description: '', store_notice: '' })
  const [payoutForm, setPayoutForm] = useState({ amount: '0', note: '' })
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [uploadMeta, setUploadMeta] = useState(null)
  const [shippingOrder, setShippingOrder] = useState(null)
  const [shippingInstruction, setShippingInstruction] = useState('')
  const userToken = localStorage.getItem('ms_user_token') || ''

  const syncStoredUser = (nextUser) => {
    if (!nextUser) return
    localStorage.setItem('ms_user', JSON.stringify(nextUser))
  }

  const loadDashboard = async () => {
    const { data } = await api.get('/merchant/dashboard', authHeader(userToken))
    const next = normalizeMerchantDashboard(data)
    setDashboard(next)
    writeCachedJson('ms_merchant_dashboard_cache', next)
    setStoreForm({
      store_name: next.user?.store_name || '',
      store_description: next.user?.store_description || '',
      store_notice: next.user?.store_notice || '',
    })
    syncStoredUser(next.user)
    return next
  }

  useEffect(() => {
    if (!userToken) {
      setLoading(false)
      return
    }
    loadDashboard()
      .catch((error) => toast.error(error?.response?.data?.message || '加载商家中心失败'))
      .finally(() => setLoading(false))
  }, [userToken])

  const saveStore = async (event) => {
    event.preventDefault()
    const { data } = await api.put('/merchant/store', {
      store_name: storeForm.store_name.trim(),
      store_description: storeForm.store_description.trim(),
      store_notice: storeForm.store_notice.trim(),
    }, authHeader(userToken))
    setDashboard((current) => ({ ...current, user: data }))
    setStoreForm({
      store_name: data.store_name || '',
      store_description: data.store_description || '',
      store_notice: data.store_notice || '',
    })
    syncStoredUser(data)
    toast.success('店铺信息已更新')
  }

  const checkIn = async () => {
    await api.post('/merchant/check-in', {}, authHeader(userToken))
    await loadDashboard()
    toast.success('今日签到成功')
  }

  const requestPayout = async (event) => {
    event.preventDefault()
    await api.post('/merchant/payout-requests', { amount: Number(payoutForm.amount), note: payoutForm.note.trim() }, authHeader(userToken))
    await loadDashboard()
    toast.success('提现申请已提交')
    setPayoutForm({ amount: '0', note: '' })
  }

  const uploadMerchantImage = async (file) => {
    if (!file) return
    setImageUploading(true)
    try {
      const prepared = await prepareImageUpload(file)
      const formData = new FormData()
      formData.append('image', prepared.file)
      const { data } = await api.post('/merchant/uploads', formData, authHeader(userToken))
      const baseHost = api.defaults.baseURL.replace(/\/api$/, '')
      const imageUrl = data.url.startsWith('http') ? data.url : `${baseHost}${data.url}`
      setProductForm((current) => ({ ...current, image_url: imageUrl }))
      setUploadMeta(prepared)
      if (prepared.compressed) toast.success(`图片已压缩：${formatFileSize(prepared.originalSize)} -> ${formatFileSize(prepared.finalSize)}`)
      toast.success('商品图片上传成功')
    } catch (error) {
      toast.error(error?.response?.data?.message || '图片上传失败')
    } finally {
      setImageUploading(false)
    }
  }

  const submitProduct = async (event) => {
    event.preventDefault()
    const payload = {
      ...productForm,
      price: Number(productForm.price),
      stock_quantity: Number(productForm.stock_quantity),
    }
    if (editingProductId) {
      await api.put(`/merchant/products/${editingProductId}`, payload, authHeader(userToken))
      toast.success('商品已更新')
    } else {
      await api.post('/merchant/products', payload, authHeader(userToken))
      toast.success('商品已上架')
    }
    setProductForm(emptyProductForm)
    setUploadMeta(null)
    setEditingProductId(null)
    await loadDashboard()
  }

  const editProduct = (product) => {
    setEditingProductId(product.id)
    setProductForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      category: product.category,
      image_url: product.image_url,
      stock_quantity: String(product.stock_quantity),
      is_active: Boolean(product.is_active),
    })
    setUploadMeta(null)
  }

  const deleteProduct = async (id) => {
    await api.delete(`/merchant/products/${id}`, authHeader(userToken))
    toast.success('商品已删除')
    if (editingProductId === id) {
      setEditingProductId(null)
      setProductForm(emptyProductForm)
      setUploadMeta(null)
    }
    await loadDashboard()
  }

  const toggleProduct = async (product) => {
    if (!product.is_active && Number(product.stock_quantity) <= 0) {
      toast.error('库存为 0 的商品不能上架')
      return
    }
    await api.put(`/merchant/products/${product.id}`, { ...product, is_active: !product.is_active }, authHeader(userToken))
    toast.success('商品状态已更新')
    await loadDashboard()
  }

  const submitShipping = async () => {
    if (!shippingOrder) return
    if (!shippingInstruction.trim()) {
      toast.error('请输入发放指令')
      return
    }
    await api.put(`/merchant/orders/${shippingOrder.order_number}/ship`, { shipping_instruction: shippingInstruction.trim() }, authHeader(userToken))
    toast.success('订单已发货，收入已更新')
    setShippingOrder(null)
    setShippingInstruction('')
    await loadDashboard()
  }

  const user = dashboard.user
  const paidOutTotal = dashboard.wallet_logs
    .filter((item) => item.change_type === 'store_payout')
    .reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0)
  const incomeTotal = dashboard.wallet_logs
    .filter((item) => item.change_type === 'store_income')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  if (!userToken) {
    return <Shell title="商家中心" right={<PublicNav currentUser={null} activePage="merchant" />}><section className="panel empty-state"><strong>请先登录</strong><p className="muted">商家中心仅对已开通商家权限的账号开放。</p><Link className="primary-button" to="/">直达首页</Link></section></Shell>
  }

  if (!loading && !user?.is_merchant) {
    return <Shell title="商家中心" right={<PublicNav currentUser={user} activePage="merchant" />}><section className="panel empty-state"><strong>你还没有商家权限</strong><p className="muted">请联系管理员在后台为你的账号开通商家入驻资格。</p><Link className="primary-button" to="/">直达首页</Link></section></Shell>
  }

  return (
    <Shell title="商家中心" right={<PublicNav currentUser={user} activePage="merchant" />}>
      <section className="member-layout">
        <div className="panel member-summary-grid">
          <div className="member-summary-card"><p className="eyebrow">MERCHANT PROFILE</p><h2>{user?.store_name || user?.username || '加载中...'}</h2><p className="muted">店主：{user?.username || '-'}</p></div>
          <div className="stat-card"><strong>{user?.store_balance || 0}</strong><span>店铺余额</span></div>
          <div className="stat-card"><strong>{incomeTotal}</strong><span>累计收入</span></div>
          <div className="stat-card"><strong>{paidOutTotal}</strong><span>累计转出</span></div>
        </div>
        <div className="member-actions-row">
          <button className="primary-button" onClick={checkIn} disabled={loading || dashboard.checked_in_today}>{dashboard.checked_in_today ? '今日已签到' : '每日签到'}</button>
          <Link className="ghost-button" to="/stores">查看其他商家</Link>
          <Link className="ghost-button" to="/">直达首页</Link>
        </div>
        <div className="split-panel merchant-dashboard-grid">
          <section className="panel form-grid product-editor-form">
            <h3>{editingProductId ? '编辑商品' : '发布商品'}</h3>
            <p className="muted">{dashboard.checked_in_today ? '今天已签到，库存充足的商品可以正常上架。' : '今日未签到，提交商品后会先保持下架，签到后才会自动恢复。'}</p>
            <form className="form-grid" onSubmit={submitProduct}>
              <label>商品名称<input value={productForm.name} onChange={(e) => setProductForm((current) => ({ ...current, name: e.target.value }))} /></label>
              <label>商品描述<textarea value={productForm.description} onChange={(e) => setProductForm((current) => ({ ...current, description: e.target.value }))} /></label>
              <label>商品分类<input value={productForm.category} onChange={(e) => setProductForm((current) => ({ ...current, category: e.target.value }))} /></label>
              <label>价格<input type="number" min="0" value={productForm.price} onChange={(e) => setProductForm((current) => ({ ...current, price: e.target.value }))} /></label>
              <label>库存<input type="number" min="0" value={productForm.stock_quantity} onChange={(e) => setProductForm((current) => ({ ...current, stock_quantity: e.target.value }))} /></label>
              <label>图片 URL<input value={productForm.image_url} onChange={(e) => setProductForm((current) => ({ ...current, image_url: e.target.value }))} /></label>
              <UploadDropzone imageUrl={productForm.image_url} loading={imageUploading} onFileSelect={uploadMerchantImage} uploadMeta={uploadMeta} />
              <label className="switch-row"><input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm((current) => ({ ...current, is_active: e.target.checked }))} />允许上架</label>
              <div className="button-group">
                {editingProductId && <button type="button" className="ghost-button" onClick={() => { setEditingProductId(null); setProductForm(emptyProductForm); setUploadMeta(null) }}>取消编辑</button>}
                <button className="primary-button">{editingProductId ? '保存商品' : '发布商品'}</button>
              </div>
            </form>
          </section>
          <div className="product-list-panel">
            <section className="panel form-grid merchant-settings-panel">
              <div className="section-toolbar wrap compact-toolbar"><div><h3>店铺设置</h3><p className="muted">修改店名后，店铺商品会同步显示新的店铺名称。</p></div></div>
              <form className="form-grid" onSubmit={saveStore}>
                <label>店名<input value={storeForm.store_name} onChange={(e) => setStoreForm((current) => ({ ...current, store_name: e.target.value }))} /></label>
                <label>店铺简介<textarea value={storeForm.store_description} onChange={(e) => setStoreForm((current) => ({ ...current, store_description: e.target.value }))} placeholder="介绍你的主营内容、风格或服务特色" /></label>
                <label>店铺公告<textarea value={storeForm.store_notice} onChange={(e) => setStoreForm((current) => ({ ...current, store_notice: e.target.value }))} placeholder="例如：发货时间、活动说明、购买须知" /></label>
                <button className="primary-button">保存店铺信息</button>
              </form>
            </section>
            <section className="panel form-grid merchant-settings-panel">
              <div className="section-toolbar wrap compact-toolbar"><div><h3>申请转入游戏</h3><p className="muted">提交后等待管理员审核，批准后会从店铺余额扣除相应金额。</p></div></div>
              <form className="form-grid" onSubmit={requestPayout}>
                <label>申请金额<input type="number" min="1" value={payoutForm.amount} onChange={(e) => setPayoutForm((current) => ({ ...current, amount: e.target.value }))} /></label>
                <label>备注<textarea value={payoutForm.note} onChange={(e) => setPayoutForm((current) => ({ ...current, note: e.target.value }))} /></label>
                <button className="primary-button">提交申请</button>
              </form>
            </section>
          </div>
        </div>
        <section className="panel">
          <div className="section-toolbar wrap"><div><h3>商品列表</h3><p className="muted">你可以直接查看商品库存、上下架状态，并快速进入编辑。</p></div></div>
          <div className="table-wrap admin-table-wrap">
            <table>
              <thead><tr><th>ID</th><th>商品</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {dashboard.products.length ? dashboard.products.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td><div className="merchant-product-cell"><SafeImage className="thumb" src={item.image_url} alt={item.name} /><div><strong>{item.name}</strong><div className="muted tiny-text">{item.category} · {item.store_name || '系统商城'}</div></div></div></td>
                    <td>{item.price}</td>
                    <td>{item.stock_quantity}</td>
                    <td><span className={`status-pill ${item.is_active ? 'badge-success' : 'badge-danger'}`}>{item.is_active ? '上架中' : '已下架'}</span></td>
                    <td className="row-actions"><button onClick={() => editProduct(item)}>编辑</button><button onClick={() => deleteProduct(item.id)}>删除</button><button onClick={() => toggleProduct(item)}>{item.is_active ? '下架' : '上架'}</button></td>
                  </tr>
                )) : <tr><td colSpan="6">暂无商品，先发布第一件商品吧。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="section-toolbar wrap"><div><h3>商家订单</h3><p className="muted">查看属于你店铺的历史订单、收入状态，并对待处理订单执行发货。</p></div></div>
          <div className="table-wrap admin-table-wrap">
            <table>
              <thead><tr><th>订单号</th><th>玩家</th><th>商品</th><th>实付</th><th>商家收入</th><th>入账状态</th><th>订单状态</th><th>时间</th><th>操作</th></tr></thead>
              <tbody>
                {dashboard.orders.length ? dashboard.orders.map((item) => {
                  const creditMeta = storeCreditMeta[item.store_credit_status] || storeCreditMeta.pending
                  return (
                    <tr key={item.order_number}>
                      <td>{item.order_number}</td>
                      <td>{item.player_id}</td>
                      <td>{item.items.map((entry) => `${entry.name} x${entry.quantity}`).join('，')}</td>
                      <td>{item.paid_amount || item.total_price}</td>
                      <td>{item.merchant_income || 0}</td>
                      <td><span className={`status-pill ${creditMeta.className}`}>{creditMeta.text}</span></td>
                      <td><span className={`status-pill ${orderStatusLabels[item.status]?.className || 'badge-warning'}`}>{orderStatusLabels[item.status]?.text || item.status}</span></td>
                      <td>{formatTime(item.created_at)}</td>
                      <td className="row-actions"><button disabled={item.status !== 'pending'} onClick={() => { setShippingOrder(item); setShippingInstruction(`/give ${item.player_id} diamond 64`) }}>立即发货</button></td>
                    </tr>
                  )
                }) : <tr><td colSpan="9">暂无商家订单</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <div className="split-panel merchant-dashboard-grid">
          <section className="panel">
            <div className="section-toolbar wrap"><div><h3>店铺流水</h3><p className="muted">收入入账和提现扣款都会记录在这里。</p></div></div>
            <div className="table-wrap admin-table-wrap">
              <table>
                <thead><tr><th>时间</th><th>类型</th><th>变动</th><th>余额</th><th>备注</th></tr></thead>
                <tbody>
                  {dashboard.wallet_logs.length ? dashboard.wallet_logs.map((item) => (
                    <tr key={item.id}><td>{formatTime(item.created_at)}</td><td>{item.change_type}</td><td>{item.amount > 0 ? `+${item.amount}` : item.amount}</td><td>{item.balance_after}</td><td>{item.note || '-'}</td></tr>
                  )) : <tr><td colSpan="5">暂无店铺流水</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="section-toolbar wrap"><div><h3>提现记录</h3><p className="muted">这里显示你提交过的转入游戏申请及处理结果。</p></div></div>
            <div className="table-wrap admin-table-wrap">
              <table>
                <thead><tr><th>ID</th><th>金额</th><th>备注</th><th>状态</th><th>审核人</th><th>申请时间</th></tr></thead>
                <tbody>
                  {dashboard.payout_requests.length ? dashboard.payout_requests.map((item) => {
                    const meta = payoutStatusMeta[item.status] || payoutStatusMeta.pending
                    return <tr key={item.id}><td>{item.id}</td><td>{item.amount}</td><td>{item.note || '-'}</td><td><span className={`status-pill ${meta.className}`}>{meta.text}</span></td><td>{item.reviewed_by_admin || '-'}</td><td>{formatTime(item.requested_at)}</td></tr>
                  }) : <tr><td colSpan="6">暂无提现申请</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      {shippingOrder && (
        <ModalFrame title={`商家发货：${shippingOrder.order_number}`} onClose={() => setShippingOrder(null)}>
          <div className="form-grid">
            <p className="muted">提交后该订单会变为已发货，若该订单收入未入账，将自动增加到你的店铺余额。</p>
            <textarea value={shippingInstruction} onChange={(e) => setShippingInstruction(e.target.value)} />
            <div className="button-group">
              <button className="ghost-button" onClick={() => setShippingOrder(null)}>取消</button>
              <button className="primary-button" onClick={submitShipping}>确认发货</button>
            </div>
          </div>
        </ModalFrame>
      )}
    </Shell>
  )
}

function RechargePage() {
  const [siteContent, setSiteContent] = useState(() => normalizeSiteContent(readCachedJson('ms_storefront_site_content', {})))
  const [amount, setAmount] = useState('100')
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('ms_user') || 'null')
    } catch {
      return null
    }
  })()

  useEffect(() => {
    api.get('/site-content').then(({ data }) => {
      const nextContent = normalizeSiteContent(data)
      setSiteContent(nextContent)
      writeCachedJson('ms_storefront_site_content', nextContent)
    }).catch(() => {})
  }, [])

  const rechargeAmount = Math.max(0, Number(amount) || 0)
  const bonusMin = Number(siteContent.recharge_bonus_minimum || 0)
  const bonusPerTier = Number(siteContent.recharge_bonus_amount || 0)
  const hasRechargeBonus = bonusMin > 0 && bonusPerTier > 0
  const bonusAmount = getRechargeBonusAmount(rechargeAmount, bonusMin, bonusPerTier)
  const command = buildRechargeCommand(rechargeAmount)

  return (
    <Shell title="会员充值" right={<PublicNav currentUser={user} activePage="recharge" />}>
      <section className="feedback-layout">
        <div className="panel feedback-intro">
          <p className="eyebrow">RECHARGE DESK</p>
          <h2>充值会员卡余额</h2>
          <p className="muted">输入充值金额后，会自动生成支付报价指令。复制后在游戏内执行，并把截图发给管理员处理。</p>
          <div className="summary-card">
            <p><strong>当前优惠：</strong>{hasRechargeBonus ? `满 ${bonusMin} 送 ${bonusPerTier}` : '当前未开启满赠活动'}</p>
            <p><strong>预计到账：</strong>{rechargeAmount + bonusAmount} 金币</p>
          </div>
          <p className="account-banner">{siteContent.recharge_notice}</p>
        </div>
        <div className="panel form-grid feedback-form">
          <h3>生成充值指令</h3>
          <label>充值金额<input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <div className="summary-card">
            <p><strong>支付指令：</strong></p>
            <div className="copy-row"><code>{command}</code><CopyButton value={command} label="复制指令" /></div>
            <p><strong>基础金额：</strong>{rechargeAmount} 金币</p>
            <p><strong>赠送金额：</strong>{bonusAmount} 金币</p>
            <p><strong>预计入账：</strong>{rechargeAmount + bonusAmount} 金币</p>
          </div>
          <p className="muted">请添加管理员并发送支付截图，管理员确认后会为你的会员卡手动入账。</p>
          <div className="button-group">
            <Link className="ghost-button" to="/">直达首页</Link>
            <Link className="primary-button" to="/me">查看会员中心</Link>
          </div>
        </div>
      </section>
    </Shell>
  )
}

function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState(() => readCachedJson('ms_announcements_cache', []))
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('ms_user') || 'null')
    } catch {
      return null
    }
  })()

  useEffect(() => {
    api.get('/announcements').then(({ data }) => {
      setAnnouncements(data)
      writeCachedJson('ms_announcements_cache', data)
    }).catch(() => toast.error('获取公告失败'))
  }, [])

  return (
    <Shell title="公告中心" right={<PublicNav currentUser={user} activePage="announcements" />}>
      <section className="announcement-page-grid">
        {announcements.map((item) => (
          <article className="panel announcement-page-card" key={item.id}>
            <div className="section-toolbar wrap compact-toolbar">
              <div>
                <p className="eyebrow">{item.is_pinned ? 'PINNED NOTICE' : 'SERVER NOTICE'}</p>
                <h3>{item.title}</h3>
              </div>
              {item.is_pinned && <span className="status-pill badge-warning">置顶</span>}
            </div>
            <ExpandableAnnouncement content={item.content} />
            <p className="muted tiny-text">发布时间：{formatTime(item.updated_at || item.created_at)}</p>
          </article>
        ))}
      </section>
    </Shell>
  )
}

function AdminLoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/admin/login', form)
      localStorage.setItem('ms_token', data.token)
      localStorage.setItem('ms_admin', JSON.stringify(data.admin))
      setAuthToken(data.token)
      toast.success('登录成功')
      navigate('/admin/orders')
    } catch (error) {
      toast.error(error?.response?.data?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell title="管理员登录">
      <section className="panel auth-panel">
        <form className="form-grid" onSubmit={submit}>
          <label>用户名<input value={form.username} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))} /></label>
          <label>密码<input type="password" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} /></label>
          <button className="primary-button" disabled={loading}>{loading ? '登录中...' : '登录'}</button>
        </form>
      </section>
    </Shell>
  )
}

function AdminShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tokenReady, setTokenReady] = useState(false)
  const [admin, setAdmin] = useState(null)
  const [section, setSection] = useState('orders')
  const [products, setProducts] = useState(() => readCachedJson('ms_admin_products_cache', []))
  const [orders, setOrders] = useState(() => readCachedJson('ms_admin_orders_cache', []))
  const [admins, setAdmins] = useState(() => readCachedJson('ms_admin_admins_cache', []))
  const [users, setUsers] = useState(() => readCachedJson('ms_admin_users_cache', []))
  const [invites, setInvites] = useState(() => readCachedJson('ms_admin_invites_cache', []))
  const [feedbacks, setFeedbacks] = useState(() => readCachedJson('ms_admin_feedbacks_cache', []))
  const [announcements, setAnnouncements] = useState(() => readCachedJson('ms_admin_announcements_cache', []))
  const [payoutRequests, setPayoutRequests] = useState(() => readCachedJson('ms_admin_payout_requests_cache', []))
  const [merchantOverview, setMerchantOverview] = useState(() => readCachedJson('ms_admin_merchant_overview_cache', { merchants: [], orders: [], payout_requests: [], wallet_logs: [] }))
  const [siteContentForm, setSiteContentForm] = useState(() => normalizeSiteContent(readCachedJson('ms_admin_site_content_cache', {})))
  const [statusFilter, setStatusFilter] = useState('all')
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('all')
  const [inviteUsageFilter, setInviteUsageFilter] = useState('all')
  const [userSearch, setUserSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [productOwnershipFilter, setProductOwnershipFilter] = useState('all')
  const [inviteForm, setInviteForm] = useState({ count: 1, note: '', assigned_to: '' })
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', is_pinned: false })
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [uploadMeta, setUploadMeta] = useState(null)
  const [shipTarget, setShipTarget] = useState(null)
  const [shippingInstruction, setShippingInstruction] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [adminForm, setAdminForm] = useState({ ...emptyAdminForm, admin_role: 'operations_admin' })
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [passwordModal, setPasswordModal] = useState({ open: false, id: null, password: '', confirmPassword: '' })
  const [banModal, setBanModal] = useState({ open: false, user: null, reason: '', nextStatus: true })
  const [inviteEditModal, setInviteEditModal] = useState({ open: false, invite: null, note: '', assigned_to: '' })
  const [memberModal, setMemberModal] = useState({ open: false, user: null, member_tier: 'none', balance_delta: '0', recharge_delta: '0', note: '' })
  const [merchantModal, setMerchantModal] = useState({ open: false, user: null, is_merchant: false, store_name: '' })
  const [payoutStatusFilter, setPayoutStatusFilter] = useState('all')
  const [merchantSearch, setMerchantSearch] = useState('')
  const adminRole = admin?.admin_role || (admin?.username === 'admin' ? 'super_admin' : 'operations_admin')
  const isRootAdmin = admin?.username === 'admin'
  const allowedSections = adminRoleSectionMap[adminRole] || []

  const extractList = (payload, fallbackKey) => {
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.items)) return payload.items
    if (fallbackKey && Array.isArray(payload?.[fallbackKey])) return payload[fallbackKey]
    return []
  }

  const normalizeMerchantOverview = (payload) => ({
    merchants: extractList(payload, 'merchants'),
    orders: extractList(payload, 'orders'),
    payout_requests: extractList(payload, 'payout_requests'),
    wallet_logs: extractList(payload, 'wallet_logs'),
  })

  useEffect(() => {
    const token = localStorage.getItem('ms_token')
    const rawAdmin = localStorage.getItem('ms_admin')
    if (!token || !rawAdmin) {
      navigate('/admin/login')
      return
    }
    setAuthToken(token)
    setAdmin(JSON.parse(rawAdmin))
    setTokenReady(true)
  }, [navigate])

  const loadOrders = async () => {
    const { data } = await api.get('/admin/orders', { params: { status: statusFilter } })
    const next = extractList(data)
    setOrders(next)
    writeCachedJson('ms_admin_orders_cache', next)
  }

  const loadProducts = async () => {
    const { data } = await api.get('/admin/products')
    const next = extractList(data, 'all')
    setProducts(next)
    writeCachedJson('ms_admin_products_cache', next)
  }

  const loadAdmins = async () => {
    const { data } = await api.get('/admin/admins')
    const next = extractList(data)
    setAdmins(next)
    writeCachedJson('ms_admin_admins_cache', next)
  }

  const loadUsers = async (search = userSearch) => {
    const keyword = search.trim()
    const { data } = await api.get('/admin/users', { params: keyword ? { search: keyword } : {} })
    const next = extractList(data)
    setUsers(next)
    writeCachedJson('ms_admin_users_cache', next)
  }

  const loadInvites = async () => {
    const { data } = await api.get('/admin/invites')
    const next = extractList(data)
    setInvites(next)
    writeCachedJson('ms_admin_invites_cache', next)
  }

  const loadFeedbacks = async () => {
    const { data } = await api.get('/admin/feedbacks', { params: { status: feedbackStatusFilter } })
    const next = extractList(data)
    setFeedbacks(next)
    writeCachedJson('ms_admin_feedbacks_cache', next)
  }

  const loadAnnouncements = async () => {
    const { data } = await api.get('/admin/announcements')
    const next = extractList(data)
    setAnnouncements(next)
    writeCachedJson('ms_admin_announcements_cache', next)
  }

  const loadPayoutRequests = async () => {
    const { data } = await api.get('/admin/payout-requests')
    const next = extractList(data)
    setPayoutRequests(next)
    writeCachedJson('ms_admin_payout_requests_cache', next)
  }

  const loadMerchantOverview = async () => {
    const { data } = await api.get('/admin/merchant-overview')
    const next = normalizeMerchantOverview(data)
    setMerchantOverview(next)
    writeCachedJson('ms_admin_merchant_overview_cache', next)
  }

  const loadSiteContent = async () => {
    const { data } = await api.get('/admin/site-content')
    const next = normalizeSiteContent(data)
    setSiteContentForm(next)
    writeCachedJson('ms_admin_site_content_cache', next)
  }

  const filteredAdminProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase()
    return products.filter((product) => {
      if (productOwnershipFilter === 'system' && product.owner_user_id !== null) return false
      if (productOwnershipFilter === 'merchant' && product.owner_user_id === null) return false
      const text = `${product.name} ${product.category} ${product.id} ${product.store_name || ''} ${product.owner_user_id ? '商家商品' : '系统商品'}`.toLowerCase()
      return !keyword || text.includes(keyword)
    })
  }, [productOwnershipFilter, productSearch, products])

  const filteredInvites = useMemo(() => {
    if (inviteUsageFilter === 'unused') return invites.filter((invite) => !invite.is_used)
    if (inviteUsageFilter === 'used') return invites.filter((invite) => invite.is_used)
    return invites
  }, [inviteUsageFilter, invites])

  const merchantSummaries = useMemo(() => merchantOverview.merchants.map((merchant) => {
    const orders = merchantOverview.orders.filter((item) => Number(item.merchant_user_id) === Number(merchant.id))
    const walletLogs = merchantOverview.wallet_logs.filter((item) => Number(item.user_id) === Number(merchant.id))
    const payouts = merchantOverview.payout_requests.filter((item) => Number(item.user_id) === Number(merchant.id))
    return {
      ...merchant,
      order_count: orders.length,
      pending_order_count: orders.filter((item) => item.status === 'pending').length,
      total_income: walletLogs.filter((item) => item.change_type === 'store_income').reduce((sum, item) => sum + Number(item.amount || 0), 0),
      total_payout: walletLogs.filter((item) => item.change_type === 'store_payout').reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0),
      pending_payout_count: payouts.filter((item) => item.status === 'pending').length,
    }
  }).filter((merchant) => {
    const keyword = merchantSearch.trim().toLowerCase()
    if (!keyword) return true
    return `${merchant.username} ${merchant.store_name}`.toLowerCase().includes(keyword)
  }), [merchantOverview, merchantSearch])

  const filteredPayoutRequests = useMemo(() => {
    if (payoutStatusFilter === 'all') return payoutRequests
    return payoutRequests.filter((item) => item.status === payoutStatusFilter)
  }, [payoutRequests, payoutStatusFilter])

  useEffect(() => {
    if (!tokenReady) return
    if (section === 'orders') loadOrders().catch(() => toast.error('加载订单失败'))
    if (section === 'products') loadProducts().catch(() => toast.error('加载商品失败'))
    if (section === 'admins' && isRootAdmin) loadAdmins().catch(() => toast.error('加载管理员失败'))
    if (section === 'users') loadUsers().catch(() => toast.error('加载用户失败'))
    if (section === 'invites') loadInvites().catch(() => toast.error('加载邀请码失败'))
    if (section === 'feedbacks') loadFeedbacks().catch(() => toast.error('加载反馈失败'))
    if (section === 'announcements') loadAnnouncements().catch(() => toast.error('加载公告失败'))
    if (section === 'payouts') loadPayoutRequests().catch(() => toast.error('加载提现申请失败'))
    if (section === 'merchants') loadMerchantOverview().catch(() => toast.error('加载商家总览失败'))
    if (section === 'content') {
      loadSiteContent().catch(() => toast.error('加载页面内容失败'))
      loadProducts().catch(() => toast.error('加载商品失败'))
    }
  }, [section, statusFilter, feedbackStatusFilter, tokenReady, isRootAdmin])

  useEffect(() => {
    if (!tokenReady) return
    if (location.pathname === '/admin') navigate('/admin/orders', { replace: true })
  }, [location.pathname, navigate, tokenReady])

  useEffect(() => {
    const path = location.pathname.split('/').at(-1)
    if (['orders', 'products', 'users', 'invites', 'feedbacks', 'announcements', 'admins', 'content', 'payouts', 'merchants'].includes(path)) setSection(path)
  }, [location.pathname])

  useEffect(() => {
    if (!tokenReady) return
    if (!allowedSections.includes(section)) {
      navigate(`/admin/${allowedSections[0] || 'orders'}`, { replace: true })
    }
  }, [section, isRootAdmin, navigate, tokenReady, allowedSections])

  if (!tokenReady) return null

  const logout = () => {
    localStorage.removeItem('ms_token')
    localStorage.removeItem('ms_admin')
    setAuthToken(null)
    navigate('/admin/login')
  }

  const submitShipping = async () => {
    if (!shipTarget) return
    if (!shippingInstruction.trim()) {
      toast.error('请输入发放指令')
      return
    }
    await api.put(`/admin/orders/${shipTarget.order_number}/ship`, { shipping_instruction: shippingInstruction.trim() })
    toast.success('订单已发货')
    setShipTarget(null)
    setShippingInstruction('')
    loadOrders()
  }

  const cancelOrder = async (orderNo) => {
    await api.put(`/admin/orders/${orderNo}/cancel`)
    toast.success('订单已取消')
    setConfirmAction(null)
    loadOrders()
  }

  const submitProduct = async (e) => {
    e.preventDefault()
    const payload = {
      ...productForm,
      price: Number(productForm.price),
      stock_quantity: Number(productForm.stock_quantity),
    }
    if (editingProductId) {
      await api.put(`/admin/products/${editingProductId}`, payload)
      toast.success('商品已更新')
    } else {
      await api.post('/admin/products', payload)
      toast.success('商品已添加')
    }
    setProductForm(emptyProductForm)
    setUploadMeta(null)
    setEditingProductId(null)
    loadProducts()
  }

  const deleteProduct = async (id) => {
    await api.delete(`/admin/products/${id}`)
    toast.success('商品已删除')
    setConfirmAction(null)
    loadProducts()
  }

  const toggleProduct = async (product) => {
    if (!product.is_active && Number(product.stock_quantity) <= 0) {
      toast.error('库存为 0 的商品不能上架，请先补库存')
      return
    }
    await api.put(`/admin/products/${product.id}`, { ...product, is_active: !product.is_active })
    toast.success('商品状态已更新')
    loadProducts()
  }

  const uploadImage = async (file) => {
    if (!file) return
    setImageUploading(true)
    try {
      const prepared = await prepareImageUpload(file)
      const formData = new FormData()
      formData.append('image', prepared.file)
      const { data } = await api.post('/admin/uploads', formData)
      const baseHost = api.defaults.baseURL.replace(/\/api$/, '')
      const imageUrl = data.url.startsWith('http') ? data.url : `${baseHost}${data.url}`
      setProductForm((current) => ({ ...current, image_url: imageUrl }))
      setUploadMeta(prepared)
      if (prepared.compressed) toast.success(`图片已压缩：${formatFileSize(prepared.originalSize)} -> ${formatFileSize(prepared.finalSize)}`)
      toast.success('图片上传成功')
    } catch (error) {
      toast.error(error?.response?.data?.message || '图片上传失败')
    } finally {
      setImageUploading(false)
    }
  }

  const updateAnnouncement = (index, value) => {
    setSiteContentForm((current) => ({
      ...current,
      announcements: current.announcements.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }))
  }

  const updateFeature = (index, key, value) => {
    setSiteContentForm((current) => ({
      ...current,
      features: current.features.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }))
  }

  const saveSiteContent = async (e) => {
    e.preventDefault()
    const payload = {
      ...siteContentForm,
      recharge_bonus_minimum: Math.max(0, Number(siteContentForm.recharge_bonus_minimum || 0)),
      recharge_bonus_amount: Math.max(0, Number(siteContentForm.recharge_bonus_amount || 0)),
      announcements: siteContentForm.announcements.map((item) => item.trim()).filter(Boolean),
      features: siteContentForm.features
        .map((item) => ({ title: item.title.trim(), text: item.text.trim() }))
        .filter((item) => item.title && item.text),
    }
    const { data } = await api.put('/admin/site-content', payload)
    setSiteContentForm({ ...createDefaultSiteContent(), ...data })
    toast.success('首页内容已更新')
  }

  const submitAdmin = async (e) => {
    e.preventDefault()
    if (!adminForm.username.trim() || !adminForm.password) {
      toast.error('请填写完整管理员信息')
      return
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      toast.error('两次密码输入不一致')
      return
    }
    await api.post('/admin/admins', { username: adminForm.username.trim(), password: adminForm.password, admin_role: adminForm.admin_role })
    toast.success('管理员已添加')
    setAdminForm(emptyAdminForm)
    setAdminModalOpen(false)
    loadAdmins()
  }

  const submitPasswordChange = async (e) => {
    e.preventDefault()
    if (!passwordModal.password) {
      toast.error('请输入新密码')
      return
    }
    if (passwordModal.password !== passwordModal.confirmPassword) {
      toast.error('两次密码输入不一致')
      return
    }
    await api.put(`/admin/admins/${passwordModal.id}/password`, { password: passwordModal.password })
    toast.success('密码已更新')
    setPasswordModal({ open: false, id: null, password: '', confirmPassword: '' })
  }

  const deleteAdmin = async (id) => {
    await api.delete(`/admin/admins/${id}`)
    toast.success('管理员已删除')
    setConfirmAction(null)
    loadAdmins()
  }

  const submitUserBan = async (event) => {
    event?.preventDefault?.()
    if (!banModal.user) return
    await api.put(`/admin/users/${banModal.user.id}/ban`, {
      is_banned: banModal.nextStatus,
      banned_reason: banModal.reason.trim(),
    })
    toast.success(banModal.nextStatus ? '账号已封禁' : '账号已解除封禁')
    setBanModal({ open: false, user: null, reason: '', nextStatus: true })
    loadUsers()
  }

  const submitInvites = async (event) => {
    event.preventDefault()
    const count = Number(inviteForm.count)
    if (!Number.isInteger(count) || count <= 0) {
      toast.error('生成数量必须是正整数')
      return
    }
    const { data } = await api.post('/admin/invites', {
      count,
      note: inviteForm.note.trim(),
      assigned_to: inviteForm.assigned_to.trim(),
    })
    toast.success(`已生成 ${data.length} 个邀请码`)
    setInviteForm({ count: 1, note: '', assigned_to: '' })
    loadInvites()
  }

  const saveInviteEdit = async (event) => {
    event.preventDefault()
    if (!inviteEditModal.invite) return
    await api.put(`/admin/invites/${inviteEditModal.invite.id}`, {
      note: inviteEditModal.note.trim(),
      assigned_to: inviteEditModal.assigned_to.trim(),
    })
    toast.success('邀请码分发信息已更新')
    setInviteEditModal({ open: false, invite: null, note: '', assigned_to: '' })
    loadInvites()
  }

  const submitMemberUpdate = async (event) => {
    event.preventDefault()
    if (!memberModal.user) return
    await api.put(`/admin/users/${memberModal.user.id}/member`, {
      member_tier: memberModal.member_tier,
      balance_delta: Number(memberModal.balance_delta),
      recharge_delta: Number(memberModal.recharge_delta),
      note: memberModal.note,
    })
    toast.success('会员资料已更新')
    setMemberModal({ open: false, user: null, member_tier: 'none', balance_delta: '0', recharge_delta: '0', note: '' })
    loadUsers()
  }

  const submitMerchantUpdate = async (event) => {
    event.preventDefault()
    if (!merchantModal.user) return
    if (!merchantModal.is_merchant && merchantModal.user.is_merchant) {
      const confirmed = window.confirm(`关闭商家权限会自动下架该店铺商品，并取消所有待处理订单且退款给买家。确认继续吗？`)
      if (!confirmed) return
    }
    await api.put(`/admin/users/${merchantModal.user.id}/merchant`, {
      is_merchant: merchantModal.is_merchant,
      store_name: merchantModal.store_name.trim(),
    })
    toast.success('商家权限已更新')
    setMerchantModal({ open: false, user: null, is_merchant: false, store_name: '' })
    loadUsers()
  }

  const reviewPayoutRequest = async (item, status) => {
    await api.put(`/admin/payout-requests/${item.id}/status`, { status })
    toast.success(status === 'approved' ? '提现申请已批准' : '提现申请已拒绝')
    loadPayoutRequests()
  }

  const submitAnnouncement = async (event) => {
    event.preventDefault()
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      toast.error('请填写完整公告内容')
      return
    }
    if (editingAnnouncementId) {
      await api.put(`/admin/announcements/${editingAnnouncementId}`, {
        ...announcementForm,
        title: announcementForm.title.trim(),
        content: announcementForm.content.trim(),
      })
      toast.success('公告已更新')
    } else {
      await api.post('/admin/announcements', {
        ...announcementForm,
        title: announcementForm.title.trim(),
        content: announcementForm.content.trim(),
      })
      toast.success('公告已发布')
    }
    setAnnouncementForm({ title: '', content: '', is_pinned: false })
    setEditingAnnouncementId(null)
    loadAnnouncements()
  }

  const deleteAnnouncement = async (id) => {
    await api.delete(`/admin/announcements/${id}`)
    toast.success('公告已删除')
    setConfirmAction(null)
    loadAnnouncements()
  }

  const updateFeedbackStatus = async (feedback, nextStatus) => {
    await api.put(`/admin/feedbacks/${feedback.id}/status`, { status: nextStatus })
    toast.success(nextStatus === 'processed' ? '反馈已标记为已处理' : '反馈已改回未处理')
    loadFeedbacks()
  }

  return (
    <Shell
      title="后台管理面板"
      right={<><Link className="ghost-button" to="/">直达首页</Link><span className="muted">{admin?.username} · {adminRoleLabels[adminRole] || '管理员'}</span><button className="ghost-button" onClick={logout}>登出</button></>}
    >
      <div className="admin-layout">
        <aside className="sidebar panel">
          {allowedSections.includes('orders') && <button className={section === 'orders' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/orders')}>订单管理</button>}
          {allowedSections.includes('products') && <button className={section === 'products' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/products')}>商品管理</button>}
          {allowedSections.includes('users') && <button className={section === 'users' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/users')}>用户管理</button>}
          {allowedSections.includes('merchants') && <button className={section === 'merchants' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/merchants')}>商家总览</button>}
          {allowedSections.includes('invites') && <button className={section === 'invites' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/invites')}>邀请码管理</button>}
          {allowedSections.includes('feedbacks') && <button className={section === 'feedbacks' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/feedbacks')}>反馈管理</button>}
          {allowedSections.includes('announcements') && <button className={section === 'announcements' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/announcements')}>公告管理</button>}
          {allowedSections.includes('payouts') && <button className={section === 'payouts' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/payouts')}>提现审核</button>}
          {allowedSections.includes('content') && <button className={section === 'content' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/content')}>内容管理</button>}
          {allowedSections.includes('admins') && <button className={section === 'admins' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/admins')}>管理员管理</button>}
        </aside>
        <main className="content-column">
          {section === 'orders' && (
            <section className="panel">
              <div className="section-toolbar wrap">
                <div>
                  <h3>订单管理</h3>
                  <p className="muted">按状态筛选订单，查看关联账号，并执行发货或取消操作。</p>
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">全部</option>
                  <option value="pending">待处理</option>
                  <option value="shipped">已发货</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table>
                  <thead>
                    <tr><th>订单号</th><th>关联账号</th><th>店铺</th><th>游戏ID</th><th>商品</th><th>总价</th><th>状态</th><th>提交时间</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.order_number}>
                        <td>{order.order_number}</td>
                        <td>{order.account_username || '-'}</td>
                        <td>{order.merchant_store_name || '系统商城'}</td>
                        <td>{order.player_id}</td>
                        <td>{order.items.map((item) => `${item.name} x${item.quantity}`).join('，')}</td>
                        <td>{order.total_price}</td>
                        <td><span className={`status-pill ${orderStatusLabels[order.status].className}`}>{orderStatusLabels[order.status].text}</span></td>
                        <td>{formatTime(order.created_at)}</td>
                        <td className="row-actions">
                          <button disabled={order.status !== 'pending'} onClick={() => { setShipTarget(order); setShippingInstruction(`/give ${order.player_id} diamond 64\n/money pay ${order.player_id} ${order.total_price}`) }}>标记已发货</button>
                          <button disabled={order.status !== 'pending'} onClick={() => setConfirmAction({ title: '取消订单', message: `确认取消订单 ${order.order_number} 吗？`, onConfirm: () => cancelOrder(order.order_number) })}>取消订单</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === 'products' && (
            <section className="panel split-panel product-management-panel">
              <form className="form-grid product-editor-form" onSubmit={submitProduct}>
                <h3>{editingProductId ? '编辑商品' : '添加商品'}</h3>
                <label>商品名称<input value={productForm.name} onChange={(e) => setProductForm((s) => ({ ...s, name: e.target.value }))} /></label>
                <label>商品描述<textarea value={productForm.description} onChange={(e) => setProductForm((s) => ({ ...s, description: e.target.value }))} /></label>
                <label>价格<input type="number" value={productForm.price} onChange={(e) => setProductForm((s) => ({ ...s, price: e.target.value }))} /></label>
                <label>商品分类<input value={productForm.category || ''} onChange={(e) => setProductForm((s) => ({ ...s, category: e.target.value }))} /></label>
                <label>库存数量<input type="number" min="0" value={productForm.stock_quantity} onChange={(e) => setProductForm((s) => ({ ...s, stock_quantity: e.target.value }))} /></label>
                <label>图片URL<input value={productForm.image_url} onChange={(e) => setProductForm((s) => ({ ...s, image_url: e.target.value }))} /></label>
                <UploadDropzone imageUrl={productForm.image_url} loading={imageUploading} onFileSelect={uploadImage} uploadMeta={uploadMeta} />
                <label className="switch-row"><input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm((s) => ({ ...s, is_active: e.target.checked }))} />上架状态</label>
                {Number(productForm.stock_quantity) === 0 && <p className="muted">库存为 0 时会自动下架，前台不会继续展示该商品。</p>}
                <div className="button-group">
                  {editingProductId && <button type="button" className="ghost-button" onClick={() => { setEditingProductId(null); setProductForm(emptyProductForm); setUploadMeta(null) }}>取消编辑</button>}
                  <button className="primary-button">{editingProductId ? '保存修改' : '提交商品'}</button>
                </div>
              </form>
              <div className="product-list-panel">
                <div className="section-toolbar wrap compact-toolbar">
                  <div>
                    <h3>商品列表</h3>
                    <p className="muted">可按系统商品或商家商品分类查看，并直接看到商家店铺名称。</p>
                  </div>
                  <div className="search-inline wide-search-inline">
                    <select value={productOwnershipFilter} onChange={(e) => setProductOwnershipFilter(e.target.value)}>
                      <option value="all">全部商品</option>
                      <option value="system">系统商品</option>
                      <option value="merchant">商家商品</option>
                    </select>
                    <input placeholder="搜索商品名 / 分类 / ID" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                  </div>
                </div>
                <div className="table-wrap product-table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>图片</th><th>名称</th><th>归属</th><th>店铺</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredAdminProducts.map((product) => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td><SafeImage className="thumb" src={product.image_url} alt={product.name} /></td>
                        <td>{product.name}</td>
                        <td>{product.owner_user_id ? '商家商品' : '系统商品'}</td>
                        <td>{product.store_name || '系统商城'}</td>
                        <td>{product.price}</td>
                        <td>{product.stock_quantity}</td>
                        <td>{product.is_active ? '上架' : '下架'}</td>
                        <td className="row-actions">
                          <button onClick={() => { setEditingProductId(product.id); setProductForm(product); setUploadMeta(null) }}>编辑</button>
                          <button onClick={() => setConfirmAction({ title: '删除商品', message: `确认删除商品 ${product.name} 吗？`, onConfirm: () => deleteProduct(product.id) })}>删除</button>
                          <button onClick={() => toggleProduct(product)}>{product.is_active ? '下架' : '上架'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </section>
          )}

          {section === 'merchants' && (
            <section className="content-column">
              <div className="panel">
                <div className="section-toolbar wrap">
                  <div>
                    <h3>商家总览</h3>
                    <p className="muted">集中查看每个商家的订单、收入、提现和当前余额。</p>
                  </div>
                  <div className="search-inline">
                    <input placeholder="搜索店主 / 店铺名" value={merchantSearch} onChange={(e) => setMerchantSearch(e.target.value)} />
                  </div>
                </div>
                <div className="merchant-overview-cards">
                  {merchantSummaries.map((item) => (
                    <article className="stat-card merchant-overview-card" key={item.id}>
                      <strong>{item.store_name || item.username}</strong>
                      <span>店主：{item.username}</span>
                      <span>当前余额：{item.store_balance || 0}</span>
                      <span>订单数：{item.order_count}（待处理 {item.pending_order_count}）</span>
                      <span>累计收入：{item.total_income}</span>
                      <span>累计转出：{item.total_payout}</span>
                      <span>待审核提现：{item.pending_payout_count}</span>
                    </article>
                  ))}
                </div>
              </div>
              <div className="split-panel merchant-dashboard-grid">
                <section className="panel">
                  <div className="section-toolbar wrap"><div><h3>商家订单汇总</h3><p className="muted">快速查看每笔商家订单归属、收入金额和入账状态。</p></div></div>
                  <div className="table-wrap admin-table-wrap">
                    <table>
                      <thead><tr><th>订单号</th><th>店铺</th><th>玩家</th><th>实付</th><th>商家收入</th><th>入账状态</th><th>状态</th><th>时间</th></tr></thead>
                      <tbody>
                        {merchantOverview.orders.map((item) => {
                          const creditMeta = storeCreditMeta[item.store_credit_status] || storeCreditMeta.pending
                          return <tr key={item.order_number}><td>{item.order_number}</td><td>{item.merchant_store_name}</td><td>{item.player_id}</td><td>{item.paid_amount || item.total_price}</td><td>{item.merchant_income || 0}</td><td><span className={`status-pill ${creditMeta.className}`}>{creditMeta.text}</span></td><td><span className={`status-pill ${orderStatusLabels[item.status]?.className || 'badge-warning'}`}>{orderStatusLabels[item.status]?.text || item.status}</span></td><td>{formatTime(item.created_at)}</td></tr>
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel">
                  <div className="section-toolbar wrap"><div><h3>商家流水汇总</h3><p className="muted">收入入账与提现扣款都会记录在这里，便于核对账目。</p></div></div>
                  <div className="table-wrap admin-table-wrap">
                    <table>
                      <thead><tr><th>时间</th><th>用户ID</th><th>类型</th><th>变动</th><th>余额</th><th>备注</th></tr></thead>
                      <tbody>
                        {merchantOverview.wallet_logs.map((item) => (
                          <tr key={item.id}><td>{formatTime(item.created_at)}</td><td>{item.user_id}</td><td>{item.change_type}</td><td>{item.amount > 0 ? `+${item.amount}` : item.amount}</td><td>{item.balance_after}</td><td>{item.note || '-'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </section>
          )}

          {section === 'content' && (
            <section className="panel content-editor-panel">
              <div className="section-toolbar wrap">
                <div>
                  <h3>首页内容管理</h3>
                  <p className="muted">这里修改的文案会直接展示在商城首页，适合更新公告、卖点和推荐语。</p>
                </div>
              </div>
              <form className="content-editor-grid" onSubmit={saveSiteContent}>
                <div className="panel inset-panel">
                  <h4>首屏信息</h4>
                  <label>顶部标签<input value={siteContentForm.hero_badge} onChange={(e) => setSiteContentForm((s) => ({ ...s, hero_badge: e.target.value }))} /></label>
                  <label>主标题<input value={siteContentForm.hero_title} onChange={(e) => setSiteContentForm((s) => ({ ...s, hero_title: e.target.value }))} /></label>
                  <label>副标题<textarea value={siteContentForm.hero_subtitle} onChange={(e) => setSiteContentForm((s) => ({ ...s, hero_subtitle: e.target.value }))} /></label>
                  <label>说明文字<textarea value={siteContentForm.hero_description} onChange={(e) => setSiteContentForm((s) => ({ ...s, hero_description: e.target.value }))} /></label>
                  <label>状态条文字<input value={siteContentForm.status_text} onChange={(e) => setSiteContentForm((s) => ({ ...s, status_text: e.target.value }))} /></label>
                </div>

                <div className="panel inset-panel">
                  <h4>推荐与公告</h4>
                  <label>推荐区标签<input value={siteContentForm.featured_label} onChange={(e) => setSiteContentForm((s) => ({ ...s, featured_label: e.target.value }))} /></label>
                  <label>推荐区默认标题<input value={siteContentForm.featured_title} onChange={(e) => setSiteContentForm((s) => ({ ...s, featured_title: e.target.value }))} /></label>
                  <label>推荐区默认说明<textarea value={siteContentForm.featured_description} onChange={(e) => setSiteContentForm((s) => ({ ...s, featured_description: e.target.value }))} /></label>
                  <label>本周热门商品
                    <select value={siteContentForm.featured_product_id || ''} onChange={(e) => setSiteContentForm((s) => ({ ...s, featured_product_id: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">自动选择第一件商品</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </label>
                  <label>公告标题<input value={siteContentForm.announcement_title} onChange={(e) => setSiteContentForm((s) => ({ ...s, announcement_title: e.target.value }))} /></label>
                  <label>公告副标题<input value={siteContentForm.announcement_subtitle} onChange={(e) => setSiteContentForm((s) => ({ ...s, announcement_subtitle: e.target.value }))} /></label>
                  {siteContentForm.announcements.map((item, index) => (
                    <label key={`announcement-${index}`}>公告 {index + 1}<textarea value={item} onChange={(e) => updateAnnouncement(index, e.target.value)} /></label>
                  ))}
                </div>

                <div className="panel inset-panel">
                  <h4>会员充值设置</h4>
                  <label>满赠门槛<input type="number" min="0" value={siteContentForm.recharge_bonus_minimum || 0} onChange={(e) => setSiteContentForm((s) => ({ ...s, recharge_bonus_minimum: e.target.value }))} /></label>
                  <label>每档赠送金额<input type="number" min="0" value={siteContentForm.recharge_bonus_amount || 0} onChange={(e) => setSiteContentForm((s) => ({ ...s, recharge_bonus_amount: e.target.value }))} /></label>
                  <p className="muted tiny-text">门槛或赠送金额填 0 即表示关闭满赠，管理员可随时自定义活动规则。</p>
                  <label>充值提示<textarea value={siteContentForm.recharge_notice || ''} onChange={(e) => setSiteContentForm((s) => ({ ...s, recharge_notice: e.target.value }))} /></label>
                </div>

                <div className="panel inset-panel full-span">
                  <h4>卖点卡片</h4>
                  <label>卖点区标题<input value={siteContentForm.feature_title} onChange={(e) => setSiteContentForm((s) => ({ ...s, feature_title: e.target.value }))} /></label>
                  <label>卖点区副标题<input value={siteContentForm.feature_subtitle} onChange={(e) => setSiteContentForm((s) => ({ ...s, feature_subtitle: e.target.value }))} /></label>
                  <h4>商品分类标题</h4>
                  <div className="feature-editor-grid">
                    {siteContentForm.category_sections.map((item, index) => (
                      <div className="feature-editor-card" key={`category-${index}`}>
                        <label>分类键值<input value={item.key} onChange={(e) => setSiteContentForm((s) => ({ ...s, category_sections: s.category_sections.map((entry, entryIndex) => (entryIndex === index ? { ...entry, key: e.target.value } : entry)) }))} /></label>
                        <label>分类标题<input value={item.title} onChange={(e) => setSiteContentForm((s) => ({ ...s, category_sections: s.category_sections.map((entry, entryIndex) => (entryIndex === index ? { ...entry, title: e.target.value } : entry)) }))} /></label>
                      </div>
                    ))}
                  </div>
                  <h4>卖点卡片</h4>
                  <div className="feature-editor-grid">
                    {siteContentForm.features.map((item, index) => (
                      <div className="feature-editor-card" key={`feature-${index}`}>
                        <label>卡片标题<input value={item.title} onChange={(e) => updateFeature(index, 'title', e.target.value)} /></label>
                        <label>卡片描述<textarea value={item.text} onChange={(e) => updateFeature(index, 'text', e.target.value)} /></label>
                      </div>
                    ))}
                  </div>
                  <div className="button-group end-row">
                    <button className="primary-button">保存首页内容</button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {section === 'admins' && (
            <section className="panel">
              <div className="section-toolbar wrap">
                <div>
                  <h3>管理员管理</h3>
                  <p className="muted">只有主管理员可以添加管理员，并区分主管理员、运营管理员、订单管理员。</p>
                </div>
                <button className="primary-button" onClick={() => setAdminModalOpen(true)}>添加管理员</button>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>创建时间</th><th>操作</th></tr></thead>
                  <tbody>
                    {admins.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.username}</td>
                        <td>{adminRoleLabels[item.admin_role] || item.admin_role}</td>
                        <td>{formatTime(item.created_at)}</td>
                        <td className="row-actions">
                          <button onClick={() => setPasswordModal({ open: true, id: item.id, password: '', confirmPassword: '' })}>修改密码</button>
                          <button onClick={() => setConfirmAction({ title: '删除管理员', message: `确认删除管理员 ${item.username} 吗？`, onConfirm: () => deleteAdmin(item.id) })}>删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === 'users' && (
            <section className="panel">
              <div className="section-toolbar wrap">
                <div>
                  <h3>用户管理</h3>
                  <p className="muted">支持按账号名、游戏ID、邮箱或邀请码搜索，并可快速封禁或解除封禁。</p>
                </div>
                <form className="search-inline" onSubmit={(e) => { e.preventDefault(); loadUsers() }}>
                  <input placeholder="搜索账号 / 游戏ID / 邮箱 / 邀请码" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                  <button className="primary-button">搜索</button>
                </form>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table>
                  <thead><tr><th>账号名</th><th>游戏ID</th><th>邀请码</th><th>会员</th><th>商家</th><th>余额</th><th>累计充值</th><th>邮箱</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id}>
                        <td>{item.username}</td>
                        <td>{item.player_id}</td>
                        <td><code>{item.invite_code || '-'}</code></td>
                        <td>{memberTierLabels[item.member_tier] || '普通会员'}</td>
                        <td>{item.is_merchant ? (item.store_name || '已开通') : '未开通'}</td>
                        <td>{item.member_balance || 0}</td>
                        <td>{item.total_recharge || 0}</td>
                        <td>{item.email || '-'}</td>
                        <td>
                          <div className="user-status-cell">
                            <span className={`status-pill ${item.is_banned ? 'badge-danger' : 'badge-success'}`}>{item.is_banned ? '已封禁' : '正常'}</span>
                            {item.banned_reason && <span className="muted tiny-text">{item.banned_reason}</span>}
                          </div>
                        </td>
                        <td>{formatTime(item.last_login_at)}</td>
                        <td className="row-actions">
                          <button onClick={() => setMemberModal({ open: true, user: item, member_tier: item.member_tier || 'none', balance_delta: '0', recharge_delta: '0', note: '' })}>会员设置</button>
                          <button onClick={() => setMerchantModal({ open: true, user: item, is_merchant: Boolean(item.is_merchant), store_name: item.store_name || item.player_id || '' })}>商家设置</button>
                          {item.is_banned ? (
                            <button onClick={() => setBanModal({ open: true, user: item, reason: '', nextStatus: false })}>解除封禁</button>
                          ) : (
                            <button onClick={() => setBanModal({ open: true, user: item, reason: '', nextStatus: true })}>封禁账号</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === 'announcements' && (
            <section className="panel split-panel product-management-panel">
              <form className="form-grid product-editor-form" onSubmit={submitAnnouncement}>
                <h3>{editingAnnouncementId ? '编辑公告' : '发布公告'}</h3>
                <label>公告标题<input value={announcementForm.title} onChange={(e) => setAnnouncementForm((s) => ({ ...s, title: e.target.value }))} /></label>
                <label>公告内容<textarea value={announcementForm.content} onChange={(e) => setAnnouncementForm((s) => ({ ...s, content: e.target.value }))} /></label>
                <label className="switch-row"><input type="checkbox" checked={announcementForm.is_pinned} onChange={(e) => setAnnouncementForm((s) => ({ ...s, is_pinned: e.target.checked }))} />置顶公告</label>
                <div className="button-group">
                  {editingAnnouncementId && <button type="button" className="ghost-button" onClick={() => { setEditingAnnouncementId(null); setAnnouncementForm({ title: '', content: '', is_pinned: false }) }}>取消编辑</button>}
                  <button className="primary-button">{editingAnnouncementId ? '保存公告' : '发布公告'}</button>
                </div>
              </form>
              <div className="product-list-panel">
                <div className="section-toolbar wrap compact-toolbar">
                  <div>
                    <h3>公告列表</h3>
                    <p className="muted">支持置顶公告，前台公告中心会自动按置顶和更新时间排序。</p>
                  </div>
                </div>
                <div className="table-wrap admin-table-wrap product-table-wrap">
                  <table>
                    <thead><tr><th>标题</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
                    <tbody>
                      {announcements.map((item) => (
                        <tr key={item.id}>
                          <td>{item.title}</td>
                          <td><span className={`status-pill ${item.is_pinned ? 'badge-warning' : 'badge-success'}`}>{item.is_pinned ? '置顶' : '普通'}</span></td>
                          <td>{formatTime(item.updated_at || item.created_at)}</td>
                          <td className="row-actions">
                            <button onClick={() => { setEditingAnnouncementId(item.id); setAnnouncementForm({ title: item.title, content: item.content, is_pinned: item.is_pinned }) }}>编辑</button>
                            <button onClick={() => setConfirmAction({ title: '删除公告', message: `确认删除公告 ${item.title} 吗？`, onConfirm: () => deleteAnnouncement(item.id) })}>删除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {section === 'invites' && (
            <section className="panel split-panel invite-split-panel product-management-panel">
              <form className="form-grid product-editor-form" onSubmit={submitInvites}>
                <h3>邀请码生成器</h3>
                <label>生成数量<input type="number" min="1" max="50" value={inviteForm.count} onChange={(e) => setInviteForm((current) => ({ ...current, count: e.target.value }))} /></label>
                <label>分发对象备注<input value={inviteForm.assigned_to} onChange={(e) => setInviteForm((current) => ({ ...current, assigned_to: e.target.value }))} placeholder="例如：8月活动群 / 玩家昵称" /></label>
                <label>附加说明<textarea value={inviteForm.note} onChange={(e) => setInviteForm((current) => ({ ...current, note: e.target.value }))} placeholder="例如：仅限内测玩家，每码限 1 人使用" /></label>
                <button className="primary-button">生成邀请码</button>
              </form>
              <div className="product-list-panel">
                <div className="section-toolbar wrap compact-toolbar">
                  <div>
                    <h3>邀请码列表</h3>
                    <p className="muted">按使用状态筛选邀请码，优先查看未使用分类，避免页面无限拉长。</p>
                  </div>
                  <select value={inviteUsageFilter} onChange={(e) => setInviteUsageFilter(e.target.value)}>
                    <option value="all">全部邀请码</option>
                    <option value="unused">未使用</option>
                    <option value="used">已使用</option>
                  </select>
                </div>
                <div className="table-wrap admin-table-wrap product-table-wrap">
                <table>
                  <thead><tr><th>邀请码</th><th>分发对象</th><th>说明</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredInvites.map((invite) => (
                      <tr key={invite.id}>
                        <td><code>{invite.code}</code></td>
                        <td>{invite.assigned_to || '-'}</td>
                        <td>{invite.note || '-'}</td>
                        <td>
                          <div className="user-status-cell">
                            <span className={`status-pill ${invite.is_used ? 'badge-danger' : 'badge-success'}`}>{invite.is_used ? '已使用' : '未使用'}</span>
                            {invite.is_used && <span className="muted tiny-text">使用者：{invite.used_by_username || `#${invite.used_by_user_id}`}</span>}
                          </div>
                        </td>
                        <td>{formatTime(invite.created_at)}</td>
                        <td className="row-actions">
                          <CopyButton value={invite.code} label="复制邀请码" />
                          {!invite.is_used && <button onClick={() => setInviteEditModal({ open: true, invite, note: invite.note || '', assigned_to: invite.assigned_to || '' })}>编辑分发</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </section>
          )}

          {section === 'payouts' && (
            <section className="panel">
              <div className="section-toolbar wrap">
                <div>
                  <h3>商家提现申请</h3>
                  <p className="muted">查看商家申请转入游戏内余额的记录，并执行批准或拒绝。</p>
                </div>
                <select value={payoutStatusFilter} onChange={(e) => setPayoutStatusFilter(e.target.value)}>
                  <option value="all">全部状态</option>
                  <option value="pending">待处理</option>
                  <option value="approved">已批准</option>
                  <option value="rejected">已拒绝</option>
                </select>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>商家账号</th><th>店铺名</th><th>金额</th><th>备注</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredPayoutRequests.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.username}</td>
                        <td>{item.store_name}</td>
                        <td>{item.amount}</td>
                        <td>{item.note || '-'}</td>
                        <td><span className={`status-pill ${(payoutStatusMeta[item.status] || payoutStatusMeta.pending).className}`}>{(payoutStatusMeta[item.status] || payoutStatusMeta.pending).text}</span></td>
                        <td>{formatTime(item.requested_at)}</td>
                        <td className="row-actions">
                          <button disabled={item.status !== 'pending'} onClick={() => reviewPayoutRequest(item, 'approved')}>批准</button>
                          <button disabled={item.status !== 'pending'} onClick={() => reviewPayoutRequest(item, 'rejected')}>拒绝</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === 'feedbacks' && (
            <section className="panel">
              <div className="section-toolbar wrap">
                <div>
                  <h3>反馈管理</h3>
                  <p className="muted">查看玩家提交的商品、订单和页面建议，并标记处理状态。</p>
                </div>
                <select value={feedbackStatusFilter} onChange={(e) => setFeedbackStatusFilter(e.target.value)}>
                  <option value="all">全部反馈</option>
                  <option value="pending">未处理</option>
                  <option value="processed">已处理</option>
                </select>
              </div>
              <div className="table-wrap admin-table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>提交时间</th><th>账号名</th><th>联系方式</th><th>内容</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {feedbacks.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{formatTime(item.created_at)}</td>
                        <td>{item.username || '-'}</td>
                        <td>{item.contact || '-'}</td>
                        <td className="feedback-message-cell">{item.message}</td>
                        <td>
                          <div className="user-status-cell">
                            <span className={`status-pill ${item.status === 'processed' ? 'badge-success' : 'badge-warning'}`}>{item.status === 'processed' ? '已处理' : '未处理'}</span>
                            {item.status === 'processed' && <span className="muted tiny-text">{item.processed_by_admin || '-'} · {formatTime(item.processed_at)}</span>}
                          </div>
                        </td>
                        <td className="row-actions">
                          {item.status === 'processed'
                            ? <button onClick={() => updateFeedbackStatus(item, 'pending')}>改回未处理</button>
                            : <button onClick={() => updateFeedbackStatus(item, 'processed')}>标记已处理</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>

      {shipTarget && (
        <ModalFrame title={`发货：${shipTarget.order_number}`} onClose={() => setShipTarget(null)}>
          <div className="form-grid">
            <p className="muted">请确认发放指令，提交后订单状态将变为“已发货”。</p>
            <textarea value={shippingInstruction} onChange={(e) => setShippingInstruction(e.target.value)} />
            <div className="button-group">
              <button className="ghost-button" onClick={() => setShipTarget(null)}>取消</button>
              <button className="primary-button" onClick={submitShipping}>确认发货</button>
            </div>
          </div>
        </ModalFrame>
      )}

      {confirmAction && (
        <ModalFrame title={confirmAction.title} onClose={() => setConfirmAction(null)}>
          <div className="form-grid">
            <p className="muted">{confirmAction.message}</p>
            <div className="button-group">
              <button className="ghost-button" onClick={() => setConfirmAction(null)}>取消</button>
              <button className="primary-button danger-button" onClick={confirmAction.onConfirm}>确认</button>
            </div>
          </div>
        </ModalFrame>
      )}

      {adminModalOpen && (
        <ModalFrame title="添加管理员" onClose={() => setAdminModalOpen(false)}>
          <form className="form-grid" onSubmit={submitAdmin}>
            <label>用户名<input value={adminForm.username} onChange={(e) => setAdminForm((s) => ({ ...s, username: e.target.value }))} /></label>
            <label>管理员角色
              <select value={adminForm.admin_role} onChange={(e) => setAdminForm((s) => ({ ...s, admin_role: e.target.value }))}>
                <option value="operations_admin">运营管理员</option>
                <option value="order_admin">订单管理员</option>
              </select>
            </label>
            <label>密码<input type="password" value={adminForm.password} onChange={(e) => setAdminForm((s) => ({ ...s, password: e.target.value }))} /></label>
            <label>确认密码<input type="password" value={adminForm.confirmPassword} onChange={(e) => setAdminForm((s) => ({ ...s, confirmPassword: e.target.value }))} /></label>
            <div className="button-group">
              <button type="button" className="ghost-button" onClick={() => setAdminModalOpen(false)}>取消</button>
              <button className="primary-button">创建管理员</button>
            </div>
          </form>
        </ModalFrame>
      )}

      {passwordModal.open && (
        <ModalFrame title="修改管理员密码" onClose={() => setPasswordModal({ open: false, id: null, password: '', confirmPassword: '' })}>
          <form className="form-grid" onSubmit={submitPasswordChange}>
            <label>新密码<input type="password" value={passwordModal.password} onChange={(e) => setPasswordModal((s) => ({ ...s, password: e.target.value }))} /></label>
            <label>确认新密码<input type="password" value={passwordModal.confirmPassword} onChange={(e) => setPasswordModal((s) => ({ ...s, confirmPassword: e.target.value }))} /></label>
            <div className="button-group">
              <button type="button" className="ghost-button" onClick={() => setPasswordModal({ open: false, id: null, password: '', confirmPassword: '' })}>取消</button>
              <button className="primary-button">保存密码</button>
            </div>
          </form>
        </ModalFrame>
      )}

      {banModal.open && banModal.user && (
        <ModalFrame title={banModal.nextStatus ? `封禁：${banModal.user.username}` : `解除封禁：${banModal.user.username}`} onClose={() => setBanModal({ open: false, user: null, reason: '', nextStatus: true })}>
          <form className="form-grid" onSubmit={submitUserBan}>
            <p className="muted">
              {banModal.nextStatus
                ? `封禁后，账号 ${banModal.user.username} 将无法继续登录和提交订单。`
                : `解除封禁后，账号 ${banModal.user.username} 可以重新登录和下单。`}
            </p>
            <label>
              {banModal.nextStatus ? '封禁原因' : '备注'}
              <textarea value={banModal.reason} onChange={(e) => setBanModal((current) => ({ ...current, reason: e.target.value }))} placeholder={banModal.nextStatus ? '例如：恶意刷单、违规下单' : '可选，留空则不记录'} />
            </label>
            <div className="button-group">
              <button type="button" className="ghost-button" onClick={() => setBanModal({ open: false, user: null, reason: '', nextStatus: true })}>取消</button>
              <button className="primary-button">确认{banModal.nextStatus ? '封禁' : '解除封禁'}</button>
            </div>
          </form>
        </ModalFrame>
      )}

      {memberModal.open && memberModal.user && (
        <ModalFrame title={`会员设置：${memberModal.user.username}`} onClose={() => setMemberModal({ open: false, user: null, member_tier: 'none', balance_delta: '0', recharge_delta: '0', note: '' })}>
          <form className="form-grid" onSubmit={submitMemberUpdate}>
            <label>会员等级
              <select value={memberModal.member_tier} onChange={(e) => setMemberModal((s) => ({ ...s, member_tier: e.target.value }))}>
                <option value="none">普通会员</option>
                <option value="iron">铁锭会员</option>
                <option value="gold">黄金会员</option>
              </select>
            </label>
            <label>余额变动（可正可负）<input type="number" value={memberModal.balance_delta} onChange={(e) => setMemberModal((s) => ({ ...s, balance_delta: e.target.value }))} /></label>
            <label>累计充值增加<input type="number" min="0" value={memberModal.recharge_delta} onChange={(e) => setMemberModal((s) => ({ ...s, recharge_delta: e.target.value }))} /></label>
            <label>备注<textarea value={memberModal.note} onChange={(e) => setMemberModal((s) => ({ ...s, note: e.target.value }))} placeholder="例如：管理员赠送 / 充值入账 / 活动补偿" /></label>
            <div className="button-group">
              <button type="button" className="ghost-button" onClick={() => setMemberModal({ open: false, user: null, member_tier: 'none', balance_delta: '0', recharge_delta: '0', note: '' })}>取消</button>
              <button className="primary-button">保存会员资料</button>
            </div>
          </form>
        </ModalFrame>
      )}

      {merchantModal.open && merchantModal.user && (
        <ModalFrame title={`商家设置：${merchantModal.user.username}`} onClose={() => setMerchantModal({ open: false, user: null, is_merchant: false, store_name: '' })}>
          <form className="form-grid" onSubmit={submitMerchantUpdate}>
            <label className="switch-row"><input type="checkbox" checked={merchantModal.is_merchant} onChange={(e) => setMerchantModal((current) => ({ ...current, is_merchant: e.target.checked }))} />开通商家权限</label>
            <label>店铺名称<input value={merchantModal.store_name} onChange={(e) => setMerchantModal((current) => ({ ...current, store_name: e.target.value }))} /></label>
            <div className="button-group">
              <button type="button" className="ghost-button" onClick={() => setMerchantModal({ open: false, user: null, is_merchant: false, store_name: '' })}>取消</button>
              <button className="primary-button">保存商家设置</button>
            </div>
          </form>
        </ModalFrame>
      )}

      {inviteEditModal.open && inviteEditModal.invite && (
        <ModalFrame title={`编辑邀请码：${inviteEditModal.invite.code}`} onClose={() => setInviteEditModal({ open: false, invite: null, note: '', assigned_to: '' })}>
          <form className="form-grid" onSubmit={saveInviteEdit}>
            <label>分发对象备注<input value={inviteEditModal.assigned_to} onChange={(e) => setInviteEditModal((current) => ({ ...current, assigned_to: e.target.value }))} /></label>
            <label>附加说明<textarea value={inviteEditModal.note} onChange={(e) => setInviteEditModal((current) => ({ ...current, note: e.target.value }))} /></label>
            <div className="button-group">
              <button type="button" className="ghost-button" onClick={() => setInviteEditModal({ open: false, invite: null, note: '', assigned_to: '' })}>取消</button>
              <button className="primary-button">保存分发信息</button>
            </div>
          </form>
        </ModalFrame>
      )}
    </Shell>
  )
}

function ModalFrame({ children, onClose, title }) {
  return (
    <div className="drawer-backdrop center" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="ghost-button" onClick={onClose}>关闭</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function formatTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export default App
