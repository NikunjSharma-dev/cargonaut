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

function offlineError(config, isRead) {
  apiStatus.offline = true
  return Object.assign(new Error('API unavailable'), {
    config,
    isOffline: true,
    response: {
      status: 503,
      data: {
        detail: isRead
          ? 'Cannot reach the API.'
          : 'Cannot reach the API — the change was not saved.',
      },
    },
  })
}

api.interceptors.response.use(
  (res) => {
    // A static host answers API paths with the SPA shell, status 200 and all
    if (isHtmlPayload(res.data)) {
      return Promise.reject(offlineError(res.config, true))
    }
    apiStatus.offline = false
    return res
  },
  (err) => {
    // ...or with an HTML 404. A JSON 404 from the real API — "Hub not found" —
    // stays a genuine error.
    const htmlNotFound = err.response?.status === 404 && isHtmlPayload(err.response.data)
    const unreachable = !err.response || err.code === 'ERR_NETWORK' || htmlNotFound
    const isRead = (err.config?.method || 'get').toLowerCase() === 'get'

    // Always reject. Resolving with a stand-in payload would report success for
    // a write that never reached the server, and hand readers an object whose
    // shape they never expect — `data?.forEach` guards undefined, not {}.
    if (unreachable) {
      return Promise.reject(offlineError(err.config, isRead))
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
  const res = await api({ url: cleanPath, method, data })
  return res.data
}

export default api
