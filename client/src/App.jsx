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

const orderStatusLabels = {
  pending: { text: '待处理', className: 'badge-warning' },
  shipped: { text: '已发货', className: 'badge-success' },
  cancelled: { text: '已取消', className: 'badge-danger' },
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
  const [cart, setCart] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [queryForm, setQueryForm] = useState({ order_no: '', api_key: '' })
  const [queryResult, setQueryResult] = useState(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [successData, setSuccessData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data)).catch(() => toast.error('获取商品失败'))
  }, [])

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])

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
    setCart((current) => current.map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item)).filter((item) => item.quantity > 0))
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
    try {
      const params = {}
      if (queryForm.order_no.trim()) params.order_no = queryForm.order_no.trim()
      if (queryForm.api_key.trim()) params.api_key = queryForm.api_key.trim()
      const { data } = await api.get('/orders/query', { params })
      setQueryResult(data)
    } catch (error) {
      setQueryResult(null)
      toast.error(error?.response?.data?.message || '未查询到订单')
    }
  }

  if (successData) {
    return (
      <Shell title="订单提交成功">
        <section className="panel success-panel">
          <p className="eyebrow">请保存以下信息</p>
          <div className="big-code">{successData.order_number}</div>
          <div className="copy-row">
            <code>{successData.api_key}</code>
            <CopyButton value={successData.api_key} />
          </div>
          <p className="muted">管理员将在24小时内处理您的订单，请使用API Key在订单查询页面查看进度。</p>
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
          <button className="cart-button" onClick={() => setDrawerOpen(true)}>购物车 {cart.length}</button>
        </>
      }
    >
      <section className="hero panel">
        <div>
          <p className="eyebrow">轻量级 Minecraft 物品交易平台</p>
          <h2>浏览商品、提交订单、管理员手动发货</h2>
          <p className="muted">支持订单号与 API Key 查询，适合小型服务器快速部署。</p>
        </div>
        <div className="hero-stats">
          <div><strong>{products.length}</strong><span>在售商品</span></div>
          <div><strong>{cart.length}</strong><span>购物车商品</span></div>
          <div><strong>{total}</strong><span>金币总额</span></div>
        </div>
      </section>

      <section className="section-head">
        <h3>热卖商品</h3>
        <p className="muted">点击加入购物车后可统一结算。</p>
      </section>

      <div className="product-grid">
        {products.map((product) => (
          <article className="product-card panel" key={product.id}>
            <img src={product.image_url} alt={product.name} />
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

      <section className="query-panel panel">
        <div>
          <h3>订单查询</h3>
          <p className="muted">输入订单号或 API Key 查看状态。</p>
        </div>
        <div className="query-form">
          <input placeholder="订单号 MC-XXXXXXXX" value={queryForm.order_no} onChange={(e) => setQueryForm((s) => ({ ...s, order_no: e.target.value }))} />
          <input placeholder="API Key sk-..." value={queryForm.api_key} onChange={(e) => setQueryForm((s) => ({ ...s, api_key: e.target.value }))} />
          <button className="primary-button" onClick={queryOrder}>查询</button>
        </div>
        {queryResult && <OrderStatusCard order={queryResult} />}
      </section>

      {drawerOpen && (
        <CartDrawer
          cart={cart}
          total={total}
          onClose={() => setDrawerOpen(false)}
          onAdjust={adjustItem}
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

function CartDrawer({ cart, total, onClose, onAdjust, onCheckout }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>购物车</h3>
          <button className="ghost-button" onClick={onClose}>关闭</button>
        </div>
        <div className="drawer-list">
          {cart.length === 0 ? <p className="muted">购物车为空。</p> : cart.map((item) => (
            <div className="cart-item" key={item.id}>
              <img src={item.image_url} alt="" />
              <div>
                <strong>{item.name}</strong>
                <p>{item.price} 金币</p>
                <div className="stepper">
                  <button onClick={() => onAdjust(item.id, -1)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => onAdjust(item.id, 1)}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="drawer-foot">
          <strong>总价：{total} 金币</strong>
          <button className="primary-button" disabled={!cart.length} onClick={onCheckout}>结算</button>
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
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>提交订单</h3>
          <button className="ghost-button" onClick={onClose}>关闭</button>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
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
          <div className="drawer-foot">
            <strong>应付：{total} 金币</strong>
            <button className="primary-button" disabled={loading}>{loading ? '提交中...' : '提交订单'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function OrderStatusCard({ order }) {
  const label = orderStatusLabels[order.status] || orderStatusLabels.pending
  return (
    <div className="order-status panel">
      <div className={`status-pill ${label.className}`}>{label.text}</div>
      <p><strong>订单号：</strong>{order.order_number}</p>
      <p><strong>游戏ID：</strong>{order.player_id}</p>
      <p><strong>总价：</strong>{order.total_price} 金币</p>
      {order.status === 'shipped' && <pre>{order.shipping_instruction}</pre>}
    </div>
  )
}

function CopyButton({ value }) {
  return <button className="ghost-button" onClick={() => { navigator.clipboard.writeText(value); toast.success('已复制') }}>复制</button>
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState(null)

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

  useEffect(() => {
    if (!tokenReady) return
    if (section === 'orders') loadOrders().catch(() => toast.error('加载订单失败'))
    if (section === 'products') loadProducts().catch(() => toast.error('加载商品失败'))
    if (section === 'admins') loadAdmins().catch(() => toast.error('加载管理员失败'))
  }, [section, statusFilter, tokenReady])

  useEffect(() => {
    if (!tokenReady) return
    if (location.pathname === '/admin') navigate('/admin/orders', { replace: true })
  }, [location.pathname, navigate, tokenReady])

  useEffect(() => {
    const path = location.pathname.split('/').at(-1)
    if (['orders', 'products', 'admins'].includes(path)) setSection(path)
  }, [location.pathname])

  if (!tokenReady) return null

  const logout = () => {
    localStorage.removeItem('ms_token')
    localStorage.removeItem('ms_admin')
    setAuthToken(null)
    navigate('/admin/login')
  }

  const shipOrder = async (orderNo) => {
    const shipping_instruction = window.prompt('请输入发放指令')
    if (!shipping_instruction) return
    if (!window.confirm('确认标记为已发货？')) return
    await api.put(`/admin/orders/${orderNo}/ship`, { shipping_instruction })
    toast.success('订单已发货')
    loadOrders()
  }

  const cancelOrder = async (orderNo) => {
    if (!window.confirm('确认取消该订单？')) return
    await api.put(`/admin/orders/${orderNo}/cancel`)
    toast.success('订单已取消')
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
    if (!window.confirm('确认删除该商品？')) return
    await api.delete(`/admin/products/${id}`)
    toast.success('商品已删除')
    loadProducts()
  }

  const toggleProduct = async (product) => {
    await api.put(`/admin/products/${product.id}`, { ...product, is_active: !product.is_active })
    toast.success('商品状态已更新')
    loadProducts()
  }

  const addAdmin = async () => {
    const username = window.prompt('请输入新管理员用户名')
    if (!username) return
    const password = window.prompt('请输入新管理员密码')
    if (!password) return
    await api.post('/admin/admins', { username, password })
    toast.success('管理员已添加')
    loadAdmins()
  }

  const changePassword = async (id) => {
    const password = window.prompt('请输入新密码')
    if (!password) return
    await api.put(`/admin/admins/${id}/password`, { password })
    toast.success('密码已更新')
  }

  const deleteAdmin = async (id) => {
    if (!window.confirm('确认删除该管理员？')) return
    await api.delete(`/admin/admins/${id}`)
    toast.success('管理员已删除')
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
          <button className={section === 'admins' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/admins')}>管理员管理</button>
        </aside>
        <main className="content-column">
          {section === 'orders' && (
            <section className="panel">
              <div className="section-toolbar">
                <h3>订单管理</h3>
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
                        <td>{order.created_at}</td>
                        <td className="row-actions">
                          <button onClick={() => navigator.clipboard.writeText(order.shipping_instruction || `/give ${order.player_id} diamond 64\n/money pay ${order.player_id} ${order.total_price}`)}>复制发放指令</button>
                          <button disabled={order.status !== 'pending'} onClick={() => shipOrder(order.order_number)}>标记已发货</button>
                          <button disabled={order.status !== 'pending'} onClick={() => cancelOrder(order.order_number)}>取消订单</button>
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
                <label className="switch-row"><input type="checkbox" checked={productForm.is_active} onChange={(e) => setProductForm((s) => ({ ...s, is_active: e.target.checked }))} />上架状态</label>
                <button className="primary-button">{editingProductId ? '保存修改' : '提交商品'}</button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>图片</th><th>名称</th><th>价格</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td><img className="thumb" src={product.image_url} alt="" /></td>
                        <td>{product.name}</td>
                        <td>{product.price}</td>
                        <td>{product.is_active ? '上架' : '下架'}</td>
                        <td className="row-actions">
                          <button onClick={() => { setEditingProductId(product.id); setProductForm(product) }}>编辑</button>
                          <button onClick={() => deleteProduct(product.id)}>删除</button>
                          <button onClick={() => toggleProduct(product)}>{product.is_active ? '下架' : '上架'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === 'admins' && (
            <section className="panel">
              <div className="section-toolbar">
                <h3>管理员管理</h3>
                <button className="primary-button" onClick={addAdmin}>添加管理员</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>用户名</th><th>创建时间</th><th>操作</th></tr></thead>
                  <tbody>
                    {admins.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.username}</td>
                        <td>{item.created_at}</td>
                        <td className="row-actions">
                          <button onClick={() => changePassword(item.id)}>修改密码</button>
                          <button onClick={() => deleteAdmin(item.id)}>删除</button>
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
    </Shell>
  )
}

export default App
