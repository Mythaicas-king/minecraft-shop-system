import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import { api, setAuthToken } from './api'
import './App.css'

const emptyProductForm = {
  name: '',
  description: '',
  price: '',
  image_url: '',
  is_active: true,
}

const emptyAdminForm = {
  username: '',
  password: '',
  confirmPassword: '',
}

const fallbackImage = 'https://picsum.photos/seed/mc-shop-fallback/900/600'

const orderStatusLabels = {
  pending: { text: '待处理', className: 'badge-warning' },
  shipped: { text: '已发货', className: 'badge-success' },
  cancelled: { text: '已取消', className: 'badge-danger' },
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

function App() {
  return (
    <HashRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminShell />} />
        <Route path="*" element={<Storefront />} />
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

function Storefront() {
  const [products, setProducts] = useState([])
  const [siteContent, setSiteContent] = useState(createDefaultSiteContent)
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

  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data)).catch(() => toast.error('获取商品失败'))
    api.get('/site-content').then(({ data }) => setSiteContent({ ...createDefaultSiteContent(), ...data })).catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem('ms_cart', JSON.stringify(cart))
  }, [cart])

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])
  const totalQuantity = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])

  const featuredProduct = products[0]
  const secondaryProducts = products.slice(1, 3)
  const serverStats = [
    { value: `${products.length}`, label: '在售礼包' },
    { value: totalQuantity ? `${totalQuantity}` : '0', label: '购物车数量' },
    { value: '24H', label: '默认处理周期' },
    { value: 'Manual', label: '人工发货模式' },
  ]

  const addToCart = (product) => {
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
      const { data } = await api.post('/orders', payload)
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
            <p><strong>总价：</strong>{successData.total_price} 金币</p>
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
      title="商品商店"
      right={
        <>
          <Link className="ghost-button" to="/admin/login">管理员登录</Link>
          <button className="cart-button" onClick={() => setDrawerOpen(true)}>购物车 {totalQuantity}</button>
        </>
      }
    >
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
            <button className="primary-button" onClick={() => setDrawerOpen(true)}>查看购物车</button>
            <a className="ghost-button" href="#query-section">订单查询</a>
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

      <section className="section-head">
        <h3>热卖商品</h3>
        <p className="muted">点击加入购物车后可统一结算。</p>
      </section>

      <div className="product-grid">
        {products.map((product) => (
          <article className="product-card panel" key={product.id}>
            <SafeImage src={product.image_url} alt={product.name} />
            <div className="product-body">
              <h4>{product.name}</h4>
              <p>{product.description}</p>
              <div className="product-foot">
                <strong>{product.price} 金币</strong>
                <button className="primary-button small" onClick={() => addToCart(product)}>加入购物车</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="query-panel panel" id="query-section">
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
      </section>

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

function UploadDropzone({ imageUrl, loading, onFileSelect }) {
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
      <p className="muted">或点击选择文件，上传后会自动写入图片 URL。</p>
      <label className="ghost-button upload-button">
        选择图片
        <input type="file" accept="image/*" hidden onChange={(e) => handleFiles(e.target.files)} />
      </label>
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

function CheckoutModal({ loading, onClose, onSubmit, cart, total }) {
  const [form, setForm] = useState({ player_id: '', note: '', email: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.player_id.trim()) {
      toast.error('游戏ID不能为空')
      return
    }
    onSubmit({
      player_id: form.player_id.trim(),
      note: form.note.trim(),
      email: form.email.trim(),
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
          <input value={form.player_id} onChange={(e) => setForm((s) => ({ ...s, player_id: e.target.value }))} />
        </label>
        <label>
          物资需求说明
          <textarea value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
        </label>
        <label>
          联系邮箱
          <input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
        </label>
        <div className="drawer-foot stretch">
          <strong>应付：{total} 金币</strong>
          <button className="primary-button" disabled={loading}>{loading ? '提交中...' : '提交订单'}</button>
        </div>
      </form>
    </ModalFrame>
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
        <p><strong>下单时间：</strong>{formatTime(order.created_at)}</p>
      </div>
      <div className="mini-list">
        {order.items.map((item) => <span key={`${order.order_number}-${item.product_id}`}>{item.name} x{item.quantity}</span>)}
      </div>
      {order.note && <p className="muted"><strong>备注：</strong>{order.note}</p>}
      {order.status === 'shipped' && <pre>{order.shipping_instruction}</pre>}
    </div>
  )
}

function CopyButton({ value, label = '复制' }) {
  return <button className="ghost-button" onClick={() => { navigator.clipboard.writeText(value); toast.success('已复制') }}>{label}</button>
}

function AdminLoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: 'admin', password: 'admin123' })
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
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [admins, setAdmins] = useState([])
  const [siteContentForm, setSiteContentForm] = useState(createDefaultSiteContent)
  const [statusFilter, setStatusFilter] = useState('all')
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [shipTarget, setShipTarget] = useState(null)
  const [shippingInstruction, setShippingInstruction] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [adminForm, setAdminForm] = useState(emptyAdminForm)
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [passwordModal, setPasswordModal] = useState({ open: false, id: null, password: '', confirmPassword: '' })

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
    setOrders(data)
  }

  const loadProducts = async () => {
    const { data } = await api.get('/admin/products')
    setProducts(data)
  }

  const loadAdmins = async () => {
    const { data } = await api.get('/admin/admins')
    setAdmins(data)
  }

  const loadSiteContent = async () => {
    const { data } = await api.get('/admin/site-content')
    setSiteContentForm({ ...createDefaultSiteContent(), ...data })
  }

  useEffect(() => {
    if (!tokenReady) return
    if (section === 'orders') loadOrders().catch(() => toast.error('加载订单失败'))
    if (section === 'products') loadProducts().catch(() => toast.error('加载商品失败'))
    if (section === 'admins') loadAdmins().catch(() => toast.error('加载管理员失败'))
    if (section === 'content') loadSiteContent().catch(() => toast.error('加载页面内容失败'))
  }, [section, statusFilter, tokenReady])

  useEffect(() => {
    if (!tokenReady) return
    if (location.pathname === '/admin') navigate('/admin/orders', { replace: true })
  }, [location.pathname, navigate, tokenReady])

  useEffect(() => {
    const path = location.pathname.split('/').at(-1)
    if (['orders', 'products', 'admins', 'content'].includes(path)) setSection(path)
  }, [location.pathname])

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
    const payload = { ...productForm, price: Number(productForm.price) }
    if (editingProductId) {
      await api.put(`/admin/products/${editingProductId}`, payload)
      toast.success('商品已更新')
    } else {
      await api.post('/admin/products', payload)
      toast.success('商品已添加')
    }
    setProductForm(emptyProductForm)
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
    await api.put(`/admin/products/${product.id}`, { ...product, is_active: !product.is_active })
    toast.success('商品状态已更新')
    loadProducts()
  }

  const uploadImage = async (file) => {
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)
    setImageUploading(true)
    try {
      const { data } = await api.post('/admin/uploads', formData)
      const baseHost = api.defaults.baseURL.replace(/\/api$/, '')
      const imageUrl = data.url.startsWith('http') ? data.url : `${baseHost}${data.url}`
      setProductForm((current) => ({ ...current, image_url: imageUrl }))
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
    await api.post('/admin/admins', { username: adminForm.username.trim(), password: adminForm.password })
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

  return (
    <Shell
      title="后台管理面板"
      right={<><span className="muted">{admin?.username}</span><button className="ghost-button" onClick={logout}>登出</button></>}
    >
      <div className="admin-layout">
        <aside className="sidebar panel">
          <button className={section === 'orders' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/orders')}>订单管理</button>
          <button className={section === 'products' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/products')}>商品管理</button>
          <button className={section === 'content' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/content')}>内容管理</button>
          <button className={section === 'admins' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/admins')}>管理员管理</button>
        </aside>
        <main className="content-column">
          {section === 'orders' && (
            <section className="panel">
              <div className="section-toolbar wrap">
                <div>
                  <h3>订单管理</h3>
                  <p className="muted">按状态筛选，支持复制指令、发货和取消订单。</p>
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">全部</option>
                  <option value="pending">待处理</option>
                  <option value="shipped">已发货</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>订单号</th><th>游戏ID</th><th>商品</th><th>总价</th><th>状态</th><th>提交时间</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.order_number}>
                        <td>{order.order_number}</td>
                        <td>{order.player_id}</td>
                        <td>{order.items.map((item) => `${item.name} x${item.quantity}`).join('，')}</td>
                        <td>{order.total_price}</td>
                        <td><span className={`status-pill ${orderStatusLabels[order.status].className}`}>{orderStatusLabels[order.status].text}</span></td>
                        <td>{formatTime(order.created_at)}</td>
                        <td className="row-actions">
                          <button onClick={() => navigator.clipboard.writeText(order.shipping_instruction || `/give ${order.player_id} diamond 64\n/money pay ${order.player_id} ${order.total_price}`)}>复制发放指令</button>
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
            <section className="panel split-panel">
              <form className="form-grid" onSubmit={submitProduct}>
                <h3>{editingProductId ? '编辑商品' : '添加商品'}</h3>
                <label>商品名称<input value={productForm.name} onChange={(e) => setProductForm((s) => ({ ...s, name: e.target.value }))} /></label>
                <label>商品描述<textarea value={productForm.description} onChange={(e) => setProductForm((s) => ({ ...s, description: e.target.value }))} /></label>
                <label>价格<input type="number" value={productForm.price} onChange={(e) => setProductForm((s) => ({ ...s, price: e.target.value }))} /></label>
                <label>图片URL<input value={productForm.image_url} onChange={(e) => setProductForm((s) => ({ ...s, image_url: e.target.value }))} /></label>
                <UploadDropzone imageUrl={productForm.image_url} loading={imageUploading} onFileSelect={uploadImage} />
                <label className="switch-row"><input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm((s) => ({ ...s, is_active: e.target.checked }))} />上架状态</label>
                <div className="button-group">
                  {editingProductId && <button type="button" className="ghost-button" onClick={() => { setEditingProductId(null); setProductForm(emptyProductForm) }}>取消编辑</button>}
                  <button className="primary-button">{editingProductId ? '保存修改' : '提交商品'}</button>
                </div>
              </form>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>图片</th><th>名称</th><th>价格</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td><SafeImage className="thumb" src={product.image_url} alt={product.name} /></td>
                        <td>{product.name}</td>
                        <td>{product.price}</td>
                        <td>{product.is_active ? '上架' : '下架'}</td>
                        <td className="row-actions">
                          <button onClick={() => { setEditingProductId(product.id); setProductForm(product) }}>编辑</button>
                          <button onClick={() => setConfirmAction({ title: '删除商品', message: `确认删除商品 ${product.name} 吗？`, onConfirm: () => deleteProduct(product.id) })}>删除</button>
                          <button onClick={() => toggleProduct(product)}>{product.is_active ? '下架' : '上架'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <label>公告标题<input value={siteContentForm.announcement_title} onChange={(e) => setSiteContentForm((s) => ({ ...s, announcement_title: e.target.value }))} /></label>
                  <label>公告副标题<input value={siteContentForm.announcement_subtitle} onChange={(e) => setSiteContentForm((s) => ({ ...s, announcement_subtitle: e.target.value }))} /></label>
                  {siteContentForm.announcements.map((item, index) => (
                    <label key={`announcement-${index}`}>公告 {index + 1}<textarea value={item} onChange={(e) => updateAnnouncement(index, e.target.value)} /></label>
                  ))}
                </div>

                <div className="panel inset-panel full-span">
                  <h4>卖点卡片</h4>
                  <label>卖点区标题<input value={siteContentForm.feature_title} onChange={(e) => setSiteContentForm((s) => ({ ...s, feature_title: e.target.value }))} /></label>
                  <label>卖点区副标题<input value={siteContentForm.feature_subtitle} onChange={(e) => setSiteContentForm((s) => ({ ...s, feature_subtitle: e.target.value }))} /></label>
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
                  <p className="muted">添加管理员、修改密码，并保护最后一个管理员账号。</p>
                </div>
                <button className="primary-button" onClick={() => setAdminModalOpen(true)}>添加管理员</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>用户名</th><th>创建时间</th><th>操作</th></tr></thead>
                  <tbody>
                    {admins.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.username}</td>
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
