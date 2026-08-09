import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', description: 'Default. Low-light control room palette.' },
  { value: 'light', label: 'Light', description: 'Bright palette for daytime dispatch desks.' },
  { value: 'system', label: 'System', description: 'Follow the operating system setting.' },
]

const STORAGE_KEY = 'cargonaut-theme'

function prefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 'system' resolves against the OS; everything else maps to itself. */
export function resolveTheme(theme) {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme
}

export function applyTheme(theme) {
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
  return resolved
}

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'dark', // dark is the product default

      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },

      toggle: () => {
        const next = resolveTheme(get().theme) === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => applyTheme(state?.theme ?? 'dark'),
    }
  )
)

// Keep 'system' live when the OS flips while the app is open
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') applyTheme('system')
  })
}
