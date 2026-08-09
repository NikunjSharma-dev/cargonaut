import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../utils/api'

// Placeholder session so the static demo (GitHub Pages, no backend) is
// explorable. The API will not accept this token — see isDemo.
const DEMO_TOKEN = 'demo-token-cargonaut-2026'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: DEMO_TOKEN,
      user: {
        id: 'demo-admin-1',
        email: 'ops@cargonaut.io',
        full_name: 'Nik Sharma',
        role: 'admin_operator',
      },
      tenantId: 'tenant-demo-802',
      isDemo: true,

      login: async (email, password) => {
        try {
          const { data } = await api.post('/auth/login', { email, password })
          set({
            token: data.access_token,
            user: {
              id: data.user_id,
              email: data.email,
              full_name: data.full_name,
              role: data.role,
            },
            tenantId: data.tenant_id,
            isDemo: false,
          })
          api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
          return data
        } catch (err) {
          // Only stand in for the API when it is unreachable. A rejected
          // credential must surface, or the user ends up "signed in" holding a
          // token the API will refuse for every subsequent request.
          if (err.response) throw err

          const demoData = {
            access_token: DEMO_TOKEN,
            user_id: 'demo-admin-1',
            email: email || 'ops@cargonaut.io',
            full_name: 'Fleet Operator',
            role: 'admin',
            tenant_id: 'tenant-demo-802',
          }
          set({
            token: demoData.access_token,
            user: { id: demoData.user_id, email: demoData.email, full_name: demoData.full_name, role: demoData.role },
            tenantId: demoData.tenant_id,
            isDemo: true,
          })
          return demoData
        }
      },

      register: async (payload) => {
        try {
          const { data } = await api.post('/auth/register', payload)
          set({
            token: data.access_token,
            user: {
              id: data.user_id,
              email: data.email,
              full_name: data.full_name,
              role: data.role,
            },
            tenantId: data.tenant_id,
          })
          return data
        } catch (err) {
          if (err.response) throw err
          const demoData = {
            access_token: DEMO_TOKEN,
            user_id: 'demo-admin-1',
            email: payload.admin_email || 'ops@cargonaut.io',
            full_name: payload.admin_name || 'Fleet Admin',
            role: 'admin',
            tenant_id: 'tenant-demo-802',
          }
          set({
            token: demoData.access_token,
            user: { id: demoData.user_id, email: demoData.email, full_name: demoData.full_name, role: demoData.role },
            tenantId: demoData.tenant_id,
            isDemo: true,
          })
          return demoData
        }
      },

      logout: () => {
        set({ token: null, user: null, tenantId: null, isDemo: false })
        delete api.defaults.headers.common['Authorization']
      },

      hydrate: () => {
        const { token } = get()
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        }
      },
    }),
    {
      name: 'cargonaut-auth',
      partialize: (s) => ({ token: s.token, user: s.user, tenantId: s.tenantId, isDemo: s.isDemo }),
    }
  )
)
