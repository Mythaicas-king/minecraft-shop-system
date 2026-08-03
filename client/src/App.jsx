import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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

function Storefront({ page = 'home' }) {
  const [products, setProducts] = useState([])
  const [siteContent, setSiteContent] = useState(createDefaultSiteContent)
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
    api.get('/products').then(({ data }) => setProducts(data)).catch(() => toast.error('获取商品失败'))
    api.get('/site-content').then(({ data }) => setSiteContent({ ...createDefaultSiteContent(), ...data })).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userToken) {
      setCurrentUser(null)
      return
    }
    api.get('/auth/me', authHeader(userToken))
      .then(({ data }) => {
        setCurrentUser(data.user)
        localStorage.setItem('ms_user', JSON.stringify(data.user))
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
    if (!keyword) return products
    return products.filter((product) => product.name.toLowerCase().includes(keyword))
  }, [products, searchTerm])

  const featuredProduct = useMemo(() => {
    if (siteContent.featured_product_id) {
      return products.find((product) => product.id === Number(siteContent.featured_product_id)) || products[0]
    }
    return products[0]
  }, [products, siteContent.featured_product_id])

  const secondaryProducts = filteredProducts.filter((product) => product.id !== featuredProduct?.id).slice(0, 2)
  const categorySections = siteContent.category_sections?.length ? siteContent.category_sections : createDefaultSiteContent().category_sections
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
      title={page === 'products' ? '商品目录' : '商品商店'}
      right={
        <>
          <nav className="site-nav">
            <Link className={page === 'home' ? 'site-nav-link active' : 'site-nav-link'} to="/">首页</Link>
            <Link className={page === 'products' ? 'site-nav-link active' : 'site-nav-link'} to="/products">商品目录</Link>
            <Link className="site-nav-link" to="/feedback">反馈页</Link>
          </nav>
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

      {page === 'products' && <section className="catalog-toolbar panel">
        <div className="catalog-heading">
          <p className="eyebrow">SHOP CATALOG</p>
          <h3>热卖商品</h3>
          <p className="muted">按分类浏览商品，点击卡片查看详情；登录后即可加入购物车。</p>
        </div>
        <label className="catalog-search">
          <span>搜索商品</span>
          <input placeholder="输入商品名进行搜索" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </label>
      </section>}

      {page === 'products' && groupedProducts.map((section) => (
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

      {page === 'products' && !!uncategorizedProducts.length && (
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

      {page === 'products' && !groupedProducts.length && !uncategorizedProducts.length && (
        <section className="panel empty-state catalog-empty">
          <strong>没有找到匹配商品</strong>
          <p className="muted">换一个商品名试试，或者清空搜索条件。</p>
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
            <p><strong>价格：</strong>{product.price} 金币</p>
          </div>
          <div className="button-group">
            <button className="ghost-button" onClick={onClose}>关闭</button>
            <button className="primary-button" onClick={() => onAdd(product)}>加入购物车</button>
          </div>
        </div>
      </div>
    </ModalFrame>
  )
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

function CheckoutModal({ currentUser, loading, onClose, onSubmit, cart, total }) {
  const [form, setForm] = useState({ player_id: currentUser?.player_id || '', note: '', email: currentUser?.email || '' })
  const [captcha, setCaptcha] = useState({ token: '', prompt: '', answer: '', expires_in: 0, loading: false })

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
        <CaptchaField
          answer={captcha.answer}
          loading={captcha.loading}
          prompt={captcha.prompt}
          onAnswerChange={(value) => setCaptcha((current) => ({ ...current, answer: value }))}
          onRefresh={loadCaptcha}
        />
        <div className="drawer-foot stretch">
          <strong>应付：{total} 金币</strong>
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
        <nav className="site-nav">
          <Link className="site-nav-link" to="/">首页</Link>
          <Link className="site-nav-link" to="/products">商品目录</Link>
          <Link className="site-nav-link active" to="/feedback">反馈页</Link>
        </nav>
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
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [admins, setAdmins] = useState([])
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [feedbacks, setFeedbacks] = useState([])
  const [siteContentForm, setSiteContentForm] = useState(createDefaultSiteContent)
  const [statusFilter, setStatusFilter] = useState('all')
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('all')
  const [inviteUsageFilter, setInviteUsageFilter] = useState('all')
  const [userSearch, setUserSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [inviteForm, setInviteForm] = useState({ count: 1, note: '', assigned_to: '' })
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [shipTarget, setShipTarget] = useState(null)
  const [shippingInstruction, setShippingInstruction] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [adminForm, setAdminForm] = useState(emptyAdminForm)
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [passwordModal, setPasswordModal] = useState({ open: false, id: null, password: '', confirmPassword: '' })
  const [banModal, setBanModal] = useState({ open: false, user: null, reason: '', nextStatus: true })
  const [inviteEditModal, setInviteEditModal] = useState({ open: false, invite: null, note: '', assigned_to: '' })

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

  const loadUsers = async (search = userSearch) => {
    const keyword = search.trim()
    const { data } = await api.get('/admin/users', { params: keyword ? { search: keyword } : {} })
    setUsers(data)
  }

  const loadInvites = async () => {
    const { data } = await api.get('/admin/invites')
    setInvites(data)
  }

  const loadFeedbacks = async () => {
    const { data } = await api.get('/admin/feedbacks', { params: { status: feedbackStatusFilter } })
    setFeedbacks(data)
  }

  const loadSiteContent = async () => {
    const { data } = await api.get('/admin/site-content')
    setSiteContentForm({ ...createDefaultSiteContent(), ...data })
  }

  const filteredAdminProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase()
    if (!keyword) return products
    return products.filter((product) => {
      const text = `${product.name} ${product.category} ${product.id}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [productSearch, products])

  const filteredInvites = useMemo(() => {
    if (inviteUsageFilter === 'unused') return invites.filter((invite) => !invite.is_used)
    if (inviteUsageFilter === 'used') return invites.filter((invite) => invite.is_used)
    return invites
  }, [inviteUsageFilter, invites])

  useEffect(() => {
    if (!tokenReady) return
    if (section === 'orders') loadOrders().catch(() => toast.error('加载订单失败'))
    if (section === 'products') loadProducts().catch(() => toast.error('加载商品失败'))
    if (section === 'admins') loadAdmins().catch(() => toast.error('加载管理员失败'))
    if (section === 'users') loadUsers().catch(() => toast.error('加载用户失败'))
    if (section === 'invites') loadInvites().catch(() => toast.error('加载邀请码失败'))
    if (section === 'feedbacks') loadFeedbacks().catch(() => toast.error('加载反馈失败'))
    if (section === 'content') {
      loadSiteContent().catch(() => toast.error('加载页面内容失败'))
      loadProducts().catch(() => toast.error('加载商品失败'))
    }
  }, [section, statusFilter, feedbackStatusFilter, tokenReady])

  useEffect(() => {
    if (!tokenReady) return
    if (location.pathname === '/admin') navigate('/admin/orders', { replace: true })
  }, [location.pathname, navigate, tokenReady])

  useEffect(() => {
    const path = location.pathname.split('/').at(-1)
    if (['orders', 'products', 'users', 'invites', 'feedbacks', 'admins', 'content'].includes(path)) setSection(path)
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

  const updateFeedbackStatus = async (feedback, nextStatus) => {
    await api.put(`/admin/feedbacks/${feedback.id}/status`, { status: nextStatus })
    toast.success(nextStatus === 'processed' ? '反馈已标记为已处理' : '反馈已改回未处理')
    loadFeedbacks()
  }

  return (
    <Shell
      title="后台管理面板"
      right={<><Link className="ghost-button" to="/">直达首页</Link><span className="muted">{admin?.username}</span><button className="ghost-button" onClick={logout}>登出</button></>}
    >
      <div className="admin-layout">
        <aside className="sidebar panel">
          <button className={section === 'orders' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/orders')}>订单管理</button>
          <button className={section === 'products' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/products')}>商品管理</button>
          <button className={section === 'users' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/users')}>用户管理</button>
          <button className={section === 'invites' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/invites')}>邀请码管理</button>
          <button className={section === 'feedbacks' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/feedbacks')}>反馈管理</button>
          <button className={section === 'content' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/content')}>内容管理</button>
          <button className={section === 'admins' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/admins')}>管理员管理</button>
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
                    <tr><th>订单号</th><th>关联账号</th><th>游戏ID</th><th>商品</th><th>总价</th><th>状态</th><th>提交时间</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.order_number}>
                        <td>{order.order_number}</td>
                        <td>{order.account_username || '-'}</td>
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
                <UploadDropzone imageUrl={productForm.image_url} loading={imageUploading} onFileSelect={uploadImage} />
                <label className="switch-row"><input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm((s) => ({ ...s, is_active: e.target.checked }))} />上架状态</label>
                {Number(productForm.stock_quantity) === 0 && <p className="muted">库存为 0 时会自动下架，前台不会继续展示该商品。</p>}
                <div className="button-group">
                  {editingProductId && <button type="button" className="ghost-button" onClick={() => { setEditingProductId(null); setProductForm(emptyProductForm) }}>取消编辑</button>}
                  <button className="primary-button">{editingProductId ? '保存修改' : '提交商品'}</button>
                </div>
              </form>
              <div className="product-list-panel">
                <div className="section-toolbar wrap compact-toolbar">
                  <div>
                    <h3>商品列表</h3>
                    <p className="muted">可按商品名、分类或 ID 搜索，并直接查看库存状态。</p>
                  </div>
                  <div className="search-inline">
                    <input placeholder="搜索商品名 / 分类 / ID" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                  </div>
                </div>
                <div className="table-wrap product-table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>图片</th><th>名称</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {filteredAdminProducts.map((product) => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td><SafeImage className="thumb" src={product.image_url} alt={product.name} /></td>
                        <td>{product.name}</td>
                        <td>{product.price}</td>
                        <td>{product.stock_quantity}</td>
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
                  <p className="muted">添加管理员、修改密码，并保护最后一个管理员账号。</p>
                </div>
                <button className="primary-button" onClick={() => setAdminModalOpen(true)}>添加管理员</button>
              </div>
              <div className="table-wrap admin-table-wrap">
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
                  <thead><tr><th>账号名</th><th>游戏ID</th><th>邀请码</th><th>邮箱</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id}>
                        <td>{item.username}</td>
                        <td>{item.player_id}</td>
                        <td><code>{item.invite_code || '-'}</code></td>
                        <td>{item.email || '-'}</td>
                        <td>
                          <div className="user-status-cell">
                            <span className={`status-pill ${item.is_banned ? 'badge-danger' : 'badge-success'}`}>{item.is_banned ? '已封禁' : '正常'}</span>
                            {item.banned_reason && <span className="muted tiny-text">{item.banned_reason}</span>}
                          </div>
                        </td>
                        <td>{formatTime(item.last_login_at)}</td>
                        <td className="row-actions">
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
