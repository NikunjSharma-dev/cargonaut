import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../utils/api'

// Placeholder fallback for static demos when API is offline
const DEMO_TOKEN = 'demo-token-cargonaut-2026'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      tenantId: null,
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
          if (err.response) throw err

          const demoData = {
            access_token: DEMO_TOKEN,
            user_id: 'demo-admin-1',
            email: email || 'admin@demo.com',
            full_name: 'Fleet Operator',
            role: 'admin',
            tenant_id: 'cargonaut-demo',
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

      guestLogin: async () => {
        try {
          const { data } = await api.post('/auth/guest')
          set({
            token: data.access_token,
            user: {
              id: data.user_id,
              email: data.email,
              full_name: data.full_name,
              role: data.role,
            },
            tenantId: data.tenant_id,
            isDemo: true,
          })
          api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
          return data
        } catch (err) {
          const demoData = {
            access_token: DEMO_TOKEN,
            user_id: 'demo-guest-1',
            email: 'guest@cargonaut.io',
            full_name: 'Guest Operator',
            role: 'viewer',
            tenant_id: 'cargonaut-demo',
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
            isDemo: false,
          })
          api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
          return data
        } catch (err) {
          if (err.response) throw err
          const demoData = {
            access_token: DEMO_TOKEN,
            user_id: 'demo-admin-1',
            email: payload.admin_email || 'admin@demo.com',
            full_name: payload.admin_name || 'Fleet Admin',
            role: 'admin',
            tenant_id: 'cargonaut-demo',
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

      hydrate: async () => {
        const { token, guestLogin } = get()
        if (!token || token === DEMO_TOKEN) {
          try {
            await guestLogin()
          } catch (_) {}
        } else {
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
