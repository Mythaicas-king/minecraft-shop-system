import axios from 'axios'

const productionApiHosts = {
  'alwaysmind.xyz': 'https://shopapi.alwaysmind.xyz/api',
  'www.alwaysmind.xyz': 'https://shopapi.alwaysmind.xyz/api',
  'mythaicas-king.github.io': 'https://shopapi.alwaysmind.xyz/api',
}

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  if (typeof window === 'undefined') return '/api'
  return productionApiHosts[window.location.hostname] || '/api'
}

function shouldRetry(error) {
  const method = String(error?.config?.method || 'get').toLowerCase()
  const url = String(error?.config?.url || '')
  const isRetriableLoginRequest = method === 'post' && ['/auth/login', '/admin/login'].includes(url)
  if (!['get', 'head', 'options'].includes(method) && !isRetriableLoginRequest) return false
  if (error?.code === 'ERR_CANCELED') return false
  return !error?.response || error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED'
}

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15000,
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const retryCount = Number(error?.config?._retryCount || 0)
    if (shouldRetry(error) && retryCount < 2) {
      const nextRetryCount = retryCount + 1
      error.config._retryCount = nextRetryCount
      await new Promise((resolve) => window.setTimeout(resolve, nextRetryCount * 400))
      return api.request(error.config)
    }
    if (error?.response?.status === 401 && window.location.hash.startsWith('#/admin')) {
      localStorage.removeItem('ms_token')
      localStorage.removeItem('ms_admin')
      window.location.hash = '#/admin/login'
    }
    return Promise.reject(error)
  },
)

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

export function authHeader(token) {
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {}
}
