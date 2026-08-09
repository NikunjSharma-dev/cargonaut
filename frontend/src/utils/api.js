import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api/v1`
    : '/api/v1',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

// Re-attach token on every request (in case of tab refresh)
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('cargonaut-auth')
  if (raw) {
    try {
      const { state } = JSON.parse(raw)
      if (state?.token) {
        config.headers['Authorization'] = `Bearer ${state.token}`
      }
    } catch (_) {}
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Return empty mock data on network error or missing backend server to prevent application crash
    if (!err.response || err.code === 'ERR_NETWORK') {
      console.warn('Backend API offline — serving fallback ops data')
      return Promise.resolve({ data: {} })
    }
    return Promise.reject(err)
  }
)

export async function apiFetch(path, options = {}) {
  const cleanPath = path.startsWith('/api/v1') ? path.replace('/api/v1', '') : path
  const method = (options.method || 'GET').toLowerCase()
  const data = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined
  try {
    const res = await api({ url: cleanPath, method, data })
    return res.data
  } catch (_) {
    return {}
  }
}

export default api
