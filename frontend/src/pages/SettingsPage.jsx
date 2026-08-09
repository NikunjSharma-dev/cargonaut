import { useQuery } from '@tanstack/react-query'
import { Building2, Shield, User, Key, Server, Palette, Moon, Sun, Monitor, Check } from 'lucide-react'
import clsx from 'clsx'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'
import { useThemeStore, THEME_OPTIONS } from '../store/themeStore'

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor }

function ThemePicker() {
  const theme = useThemeStore(s => s.theme)
  const setTheme = useThemeStore(s => s.setTheme)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
      {THEME_OPTIONS.map(option => {
        const Icon = THEME_ICONS[option.value]
        const selected = theme === option.value
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={clsx(
              'relative text-left rounded-2xl border p-3.5 transition-all',
              selected
                ? 'border-primary bg-primary-soft shadow-card'
                : 'border-app-border bg-app-panel hover:border-primary/40'
            )}
          >
            {selected && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
            <Icon size={18} className={selected ? 'text-primary' : 'text-muted'} />
            <p className="text-[13px] font-bold text-heading mt-2">
              {option.label}
              {option.value === 'dark' && (
                <span className="ml-1.5 text-[10px] font-semibold text-primary uppercase tracking-wide">Default</span>
              )}
            </p>
            <p className="text-[11px] text-muted mt-0.5 leading-snug">{option.description}</p>
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card space-y-3 shadow-card border-app-border">
      <div className="flex items-center gap-2 pb-3 border-b border-app-border">
        <Icon size={16} className="text-primary" />
        <h3 className="text-sm font-bold text-heading">{title}</h3>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function SettingRow({ label, description, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 border-b border-app-border last:border-0 gap-1 sm:gap-4">
      <div>
        <p className="text-xs font-semibold text-heading">{label}</p>
        {description && <p className="text-[11px] text-muted">{description}</p>}
      </div>
      <div className="text-xs text-muted font-mono font-medium break-all">{value}</div>
    </div>
  )
}

export default function SettingsPage() {
  const user = useAuthStore(s => s.user)

  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: () => api.get('/tenants/me').then(r => r.data),
  })

  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in duration-200">
      <div>
        <h2 className="page-title">Workspace Settings & API</h2>
        <p className="text-xs text-muted mt-0.5">Manage organization profile, active subscriptions, and security keys</p>
      </div>

      <Section title="Appearance" icon={Palette}>
        <p className="text-[11px] text-muted">
          Choose the interface theme. Dark is the default and applies to every screen, including the live map.
        </p>
        <ThemePicker />
      </Section>

      <Section title="Organization Details" icon={Building2}>
        <SettingRow label="Tenant Name" value={tenant?.name || 'Cargonaut Logistics'} />
        <SettingRow label="Workspace Slug" value={tenant?.slug || 'cargonaut-ops'} />
        <SettingRow label="Subscription Tier" value={tenant?.plan?.toUpperCase() || 'ENTERPRISE SAAS'} />
        <SettingRow label="Tenant UUID" description="PostgreSQL Row-Level Security tenant key" value={tenant?.id || '8a9f24c0-11e4-4a22'} />
      </Section>

      <Section title="User Profile & Access" icon={User}>
        <SettingRow label="Full Name" value={user?.full_name || 'Fleet Operator'} />
        <SettingRow label="Email Address" value={user?.email || 'ops@cargonaut.io'} />
        <SettingRow label="Role Access Level" value={user?.role?.toUpperCase() || 'ADMIN OPERATOR'} />
      </Section>

      <Section title="Security & Compliance" icon={Shield}>
        <SettingRow label="Authentication Engine" value="OAuth2 Bearer Token (JWT RS256)" />
        <SettingRow label="Database Isolation" value="PostgreSQL Row-Level Security (RLS)" />
        <SettingRow label="Telemetry API" value="WebSocket GPS Stream / FastAPI 0.115" />
      </Section>
    </div>
  )
}
