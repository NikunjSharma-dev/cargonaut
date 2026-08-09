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

/** Live view of API reachability, for "demo data" affordances in the UI. */
export const apiStatus = { offline: false }

/** A static host answers API paths with the SPA shell instead of JSON. */
function isHtmlPayload(data) {
  return typeof data === 'string' && /^\s*<(!doctype|html)/i.test(data)
}

api.interceptors.response.use(
  (res) => {
    if (isHtmlPayload(res.data)) {
      apiStatus.offline = true
      return { ...res, data: {} }
    }
    apiStatus.offline = false
    return res
  },
  (err) => {
    // A static host (GitHub Pages) answers API paths with an HTML 404 rather
    // than failing to connect, so treat that as "no API" too. A JSON 404 from
    // the real API — "Hub not found" — stays a genuine error.
    const htmlNotFound = err.response?.status === 404 && isHtmlPayload(err.response.data)
    const unreachable = !err.response || err.code === 'ERR_NETWORK' || htmlNotFound
    const isRead = (err.config?.method || 'get').toLowerCase() === 'get'

    if (unreachable) {
      apiStatus.offline = true

      // Reads degrade to an empty payload so screens can render placeholders.
      // Writes must never do this: resolving here would report a success for a
      // request that never reached the server.
      if (isRead) {
        console.warn('API unreachable — rendering without live data')
        return Promise.resolve({ data: {} })
      }
      return Promise.reject(
        Object.assign(err, {
          response: { data: { detail: 'Cannot reach the API — the change was not saved.' } },
        })
      )
    }

    if (err.response?.status === 401) {
      err.response.data = {
        detail: err.response.data?.detail || 'Not authenticated — sign in again to continue.',
      }
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
