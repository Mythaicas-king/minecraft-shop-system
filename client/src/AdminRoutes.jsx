import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api, setAuthToken } from './api'
import {
  Shell,
  ModalFrame,
  SafeImage,
  UploadDropzone,
  CopyButton,
  createDefaultSiteContent,
  emptyAdminForm,
  emptyProductForm,
  formatFileSize,
  formatTime,
  prepareImageUpload,
  adminRoleLabels,
  adminRoleSectionMap,
  memberTierLabels,
  orderStatusLabels,
  payoutStatusMeta,
  storeCreditMeta,
} from './App.jsx'

function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timeoutId)
  }, [value, delay])

  return debouncedValue
}

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        username: form.username.trim(),
        password: form.password,
      }
      const { data } = await api.post('/admin/login', payload, { __retryTransient: true, __retryLimit: 1, __retryDelays: [120] })
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
          <button type="submit" className="primary-button" disabled={loading}>{loading ? '登录中...' : '登录'}</button>
        </form>
      </section>
    </Shell>
  )
}

export function AdminShell() {
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
  const [announcements, setAnnouncements] = useState([])
  const [payoutRequests, setPayoutRequests] = useState([])
  const [merchantOverview, setMerchantOverview] = useState({ merchants: [], orders: [], payout_requests: [], wallet_logs: [] })
  const [siteContentForm, setSiteContentForm] = useState(createDefaultSiteContent)
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
  const [ordersPagination, setOrdersPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 })
  const [productsPagination, setProductsPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 })
  const [usersPagination, setUsersPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 })
  const [invitesPagination, setInvitesPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 })
  const [payoutsPagination, setPayoutsPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 })
  const adminRole = admin?.admin_role || (admin?.username === 'admin' ? 'super_admin' : 'operations_admin')
  const isRootAdmin = admin?.username === 'admin'
  const allowedSections = adminRoleSectionMap[adminRole] || []
  const debouncedUserSearch = useDebouncedValue(userSearch, 350)
  const debouncedProductSearch = useDebouncedValue(productSearch, 350)
  const debouncedMerchantSearch = useDebouncedValue(merchantSearch, 350)

  const getPaginatedItems = (data) => (Array.isArray(data) ? data : data.items || [])

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
    const { data } = await api.get('/admin/orders', { params: { status: statusFilter, page: ordersPagination.page, limit: ordersPagination.limit } })
    setOrders(getPaginatedItems(data))
    setOrdersPagination(data.pagination || ordersPagination)
  }

  const loadProducts = async () => {
    const keyword = debouncedProductSearch.trim()
    const { data } = await api.get('/admin/products', {
      params: {
        ...(keyword ? { search: keyword } : {}),
        ownership: productOwnershipFilter,
        page: productsPagination.page,
        limit: productsPagination.limit,
      },
    })
    setProducts(data.all || [])
    setProductsPagination(data.pagination || productsPagination)
  }

  const loadAdmins = async () => {
    const { data } = await api.get('/admin/admins')
    setAdmins(data)
  }

  const loadUsers = async (search = debouncedUserSearch) => {
    const keyword = search.trim()
    const { data } = await api.get('/admin/users', { params: { ...(keyword ? { search: keyword } : {}), page: usersPagination.page, limit: usersPagination.limit } })
    setUsers(getPaginatedItems(data))
    setUsersPagination(data.pagination || usersPagination)
  }

  const loadInvites = async () => {
    const { data } = await api.get('/admin/invites', { params: { usage: inviteUsageFilter, page: invitesPagination.page, limit: invitesPagination.limit } })
    setInvites(getPaginatedItems(data))
    setInvitesPagination(data.pagination || invitesPagination)
  }

  const loadFeedbacks = async () => {
    const { data } = await api.get('/admin/feedbacks', { params: { status: feedbackStatusFilter } })
    setFeedbacks(data)
  }

  const loadAnnouncements = async () => {
    const { data } = await api.get('/admin/announcements')
    setAnnouncements(data)
  }

  const loadPayoutRequests = async () => {
    const { data } = await api.get('/admin/payout-requests', { params: { status: payoutStatusFilter, page: payoutsPagination.page, limit: payoutsPagination.limit } })
    setPayoutRequests(getPaginatedItems(data))
    setPayoutsPagination(data.pagination || payoutsPagination)
  }

  const loadMerchantOverview = async () => {
    const { data } = await api.get('/admin/merchant-overview')
    setMerchantOverview(data)
  }

  const loadSiteContent = async () => {
    const { data } = await api.get('/admin/site-content')
    setSiteContentForm({ ...createDefaultSiteContent(), ...data })
  }

  const filteredAdminProducts = products

  const filteredInvites = invites

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
    const keyword = debouncedMerchantSearch.trim().toLowerCase()
    if (!keyword) return true
    return `${merchant.username} ${merchant.store_name}`.toLowerCase().includes(keyword)
  }), [merchantOverview, debouncedMerchantSearch])

  const filteredPayoutRequests = payoutRequests

  useEffect(() => {
    setOrdersPagination((current) => ({ ...current, page: 1 }))
  }, [statusFilter])

  useEffect(() => {
    setUsersPagination((current) => ({ ...current, page: 1 }))
  }, [debouncedUserSearch])

  useEffect(() => {
    setProductsPagination((current) => ({ ...current, page: 1 }))
  }, [debouncedProductSearch, productOwnershipFilter])

  useEffect(() => {
    setInvitesPagination((current) => ({ ...current, page: 1 }))
  }, [inviteUsageFilter])

  useEffect(() => {
    setPayoutsPagination((current) => ({ ...current, page: 1 }))
  }, [payoutStatusFilter])

  const PaginationBar = ({ pagination, onChange, onLimitChange }) => (
    <div className="section-toolbar wrap compact-toolbar">
      <p className="muted tiny-text">第 {pagination.page} / {pagination.total_pages} 页，共 {pagination.total} 条</p>
      <div className="button-group">
        <select value={pagination.limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
          <option value="5">每页 5 条</option>
          <option value="10">每页 10 条</option>
          <option value="20">每页 20 条</option>
          <option value="50">每页 50 条</option>
        </select>
        <button type="button" className="ghost-button small" disabled={pagination.page <= 1} onClick={() => onChange(pagination.page - 1)}>上一页</button>
        <button type="button" className="ghost-button small" disabled={pagination.page >= pagination.total_pages} onClick={() => onChange(pagination.page + 1)}>下一页</button>
      </div>
    </div>
  )

  useEffect(() => {
    if (!tokenReady) return
    if (section === 'orders') loadOrders().catch(() => toast.error('加载订单失败'))
    if (section === 'products') loadProducts().catch(() => toast.error('加载商品失败'))
    if (section === 'admins' && isRootAdmin) loadAdmins().catch(() => toast.error('加载管理员失败'))
    if (section === 'users') loadUsers(userSearch).catch(() => toast.error('加载用户失败'))
    if (section === 'invites') loadInvites().catch(() => toast.error('加载邀请码失败'))
    if (section === 'feedbacks') loadFeedbacks().catch(() => toast.error('加载反馈失败'))
    if (section === 'announcements') loadAnnouncements().catch(() => toast.error('加载公告失败'))
    if (section === 'payouts') loadPayoutRequests().catch(() => toast.error('加载提现申请失败'))
    if (section === 'merchants') loadMerchantOverview().catch(() => toast.error('加载商家总览失败'))
    if (section === 'content') {
      loadSiteContent().catch(() => toast.error('加载页面内容失败'))
      loadProducts().catch(() => toast.error('加载商品失败'))
    }
  }, [
    section,
    statusFilter,
    feedbackStatusFilter,
    debouncedUserSearch,
    debouncedProductSearch,
    productOwnershipFilter,
    inviteUsageFilter,
    payoutStatusFilter,
    tokenReady,
    isRootAdmin,
    ordersPagination.page,
    ordersPagination.limit,
    productsPagination.page,
    productsPagination.limit,
    usersPagination.page,
    usersPagination.limit,
    invitesPagination.page,
    invitesPagination.limit,
    payoutsPagination.page,
    payoutsPagination.limit,
  ])

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

  const deleteInvite = async (invite) => {
    await api.delete(`/admin/invites/${invite.id}`)
    toast.success('邀请码已删除')
    setConfirmAction(null)
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
          {allowedSections.includes('orders') && <button type="button" className={section === 'orders' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/orders')}>订单管理</button>}
          {allowedSections.includes('products') && <button type="button" className={section === 'products' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/products')}>商品管理</button>}
          {allowedSections.includes('users') && <button type="button" className={section === 'users' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/users')}>用户管理</button>}
          {allowedSections.includes('merchants') && <button type="button" className={section === 'merchants' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/merchants')}>商家总览</button>}
          {allowedSections.includes('invites') && <button type="button" className={section === 'invites' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/invites')}>邀请码管理</button>}
          {allowedSections.includes('feedbacks') && <button type="button" className={section === 'feedbacks' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/feedbacks')}>反馈管理</button>}
          {allowedSections.includes('announcements') && <button type="button" className={section === 'announcements' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/announcements')}>公告管理</button>}
          {allowedSections.includes('payouts') && <button type="button" className={section === 'payouts' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/payouts')}>提现审核</button>}
          {allowedSections.includes('content') && <button type="button" className={section === 'content' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/content')}>内容管理</button>}
          {allowedSections.includes('admins') && <button type="button" className={section === 'admins' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/admin/admins')}>管理员管理</button>}
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
                          <button type="button" disabled={order.status !== 'pending'} onClick={() => { setShipTarget(order); setShippingInstruction(`/give ${order.player_id} diamond 64\n/money pay ${order.player_id} ${order.total_price}`) }}>标记已发货</button>
                          <button type="button" disabled={order.status !== 'pending'} onClick={() => setConfirmAction({ title: '取消订单', message: `确认取消订单 ${order.order_number} 吗？`, onConfirm: () => cancelOrder(order.order_number) })}>取消订单</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar pagination={ordersPagination} onChange={(page) => setOrdersPagination((current) => ({ ...current, page }))} onLimitChange={(limit) => setOrdersPagination((current) => ({ ...current, page: 1, limit }))} />
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
                          <button type="button" onClick={() => { setEditingProductId(product.id); setProductForm(product); setUploadMeta(null) }}>编辑</button>
                          <button type="button" onClick={() => setConfirmAction({ title: '删除商品', message: `确认删除商品 ${product.name} 吗？`, onConfirm: () => deleteProduct(product.id) })}>删除</button>
                          <button type="button" onClick={() => toggleProduct(product)}>{product.is_active ? '下架' : '上架'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <PaginationBar pagination={productsPagination} onChange={(page) => setProductsPagination((current) => ({ ...current, page }))} onLimitChange={(limit) => setProductsPagination((current) => ({ ...current, page: 1, limit }))} />
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
                <button type="button" className="primary-button" onClick={() => setAdminModalOpen(true)}>添加管理员</button>
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
                          <button type="button" onClick={() => setPasswordModal({ open: true, id: item.id, password: '', confirmPassword: '' })}>修改密码</button>
                          <button type="button" onClick={() => setConfirmAction({ title: '删除管理员', message: `确认删除管理员 ${item.username} 吗？`, onConfirm: () => deleteAdmin(item.id) })}>删除</button>
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
                <form className="search-inline" onSubmit={(e) => { e.preventDefault(); loadUsers(userSearch) }}>
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
                          <button type="button" onClick={() => setMemberModal({ open: true, user: item, member_tier: item.member_tier || 'none', balance_delta: '0', recharge_delta: '0', note: '' })}>会员设置</button>
                          <button type="button" onClick={() => setMerchantModal({ open: true, user: item, is_merchant: Boolean(item.is_merchant), store_name: item.store_name || item.player_id || '' })}>商家设置</button>
                          {item.is_banned ? (
                            <button type="button" onClick={() => setBanModal({ open: true, user: item, reason: '', nextStatus: false })}>解除封禁</button>
                          ) : (
                            <button type="button" onClick={() => setBanModal({ open: true, user: item, reason: '', nextStatus: true })}>封禁账号</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar pagination={usersPagination} onChange={(page) => setUsersPagination((current) => ({ ...current, page }))} onLimitChange={(limit) => setUsersPagination((current) => ({ ...current, page: 1, limit }))} />
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
                            <button type="button" onClick={() => { setEditingAnnouncementId(item.id); setAnnouncementForm({ title: item.title, content: item.content, is_pinned: item.is_pinned }) }}>编辑</button>
                            <button type="button" onClick={() => setConfirmAction({ title: '删除公告', message: `确认删除公告 ${item.title} 吗？`, onConfirm: () => deleteAnnouncement(item.id) })}>删除</button>
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
                          {!invite.is_used && <button type="button" onClick={() => setInviteEditModal({ open: true, invite, note: invite.note || '', assigned_to: invite.assigned_to || '' })}>编辑分发</button>}
                          {!invite.is_used && <button type="button" onClick={() => setConfirmAction({ title: '删除邀请码', message: `确认删除邀请码 ${invite.code} 吗？`, onConfirm: () => deleteInvite(invite) })}>删除</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <PaginationBar pagination={invitesPagination} onChange={(page) => setInvitesPagination((current) => ({ ...current, page }))} onLimitChange={(limit) => setInvitesPagination((current) => ({ ...current, page: 1, limit }))} />
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
                          <button type="button" disabled={item.status !== 'pending'} onClick={() => reviewPayoutRequest(item, 'approved')}>批准</button>
                          <button type="button" disabled={item.status !== 'pending'} onClick={() => reviewPayoutRequest(item, 'rejected')}>拒绝</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar pagination={payoutsPagination} onChange={(page) => setPayoutsPagination((current) => ({ ...current, page }))} onLimitChange={(limit) => setPayoutsPagination((current) => ({ ...current, page: 1, limit }))} />
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
                            ? <button type="button" onClick={() => updateFeedbackStatus(item, 'pending')}>改回未处理</button>
                            : <button type="button" onClick={() => updateFeedbackStatus(item, 'processed')}>标记已处理</button>}
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
              <button type="button" className="ghost-button" onClick={() => setShipTarget(null)}>取消</button>
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
              <button type="button" className="ghost-button" onClick={() => setConfirmAction(null)}>取消</button>
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
