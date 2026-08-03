import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
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
