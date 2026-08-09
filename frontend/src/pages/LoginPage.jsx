import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Truck, Eye, EyeOff, ArrowRight, ShieldCheck, CheckCircle2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, register, guestLogin } = useAuthStore()
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  async function handleGuestAccess() {
    setLoading(true)
    try {
      await guestLogin()
      toast.success('Signed in as Guest Operator (Public Demo Mode)')
      navigate('/dashboard')
    } catch (_) {
      toast.error('Guest access failed')
    } finally {
      setLoading(false)
    }
  }

  const [form, setForm] = useState({
    email: '',
    password: '',
    admin_name: '',
    tenant_name: '',
    tenant_slug: '',
  })

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }))
  }

  function autoSlug(name) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
        toast.success('Welcome back!')
      } else {
        await register({
          admin_email: form.email,
          admin_password: form.password,
          admin_name: form.admin_name,
          tenant_name: form.tenant_name,
          tenant_slug: form.tenant_slug || autoSlug(form.tenant_name),
        })
        toast.success('Workspace created!')
      }
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex w-[460px] flex-col bg-app-surface border-r border-app-border p-10 justify-between shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-sm">
              <Truck size={22} className="stroke-[2.5]" />
            </div>
            <span className="font-display text-heading font-extrabold text-xl tracking-tight">
              Cargonaut
            </span>
          </div>

          <div className="space-y-6">
            <h2 className="text-3xl font-extrabold text-heading leading-tight font-display">
              Enterprise Fleet Operations & Logistics Suite
            </h2>
            <p className="text-muted text-xs leading-relaxed">
              Real-time telemetry, automated dispatching, VRP route optimization, and operational analytics for high-volume logistics.
            </p>

            <div className="space-y-4 pt-4 border-t border-app-border">
              {[
                { title: 'VRP Route Optimization Engine', desc: 'Auto-sequence 500+ waypoints with SLA parameters' },
                { title: 'Live Telemetry & Geofencing', desc: 'Real-time WebSocket GPS updates & dock arrival triggers' },
                { title: 'Carrier & Resource Auditing', desc: 'Multi-tenant fleet capacity monitoring & cost reports' },
              ].map(f => (
                <div key={f.title} className="flex gap-3 items-start">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 size={13} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-heading">{f.title}</p>
                    <p className="text-[11px] text-muted">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted">
          Cargonaut Ops Platform • Enterprise Edition
        </p>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px] bg-app-surface border border-app-border p-8 rounded-3xl shadow-floating space-y-6 animate-in fade-in duration-150">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white">
              <Truck size={18} />
            </div>
            <span className="font-display text-heading font-bold text-lg">Cargonaut</span>
          </div>

          <div>
            <h1 className="text-xl font-bold text-heading font-display">
              {mode === 'login' ? 'Operator Sign In' : 'Create Workspace'}
            </h1>
            <p className="text-xs text-muted mt-1">
              {mode === 'login'
                ? 'Enter your credentials to access dispatch'
                : 'Set up your Cargonaut organization'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="text-xs font-medium text-body block mb-1">Your Full Name</label>
                  <input className="input text-xs" placeholder="Vikram Singh" value={form.admin_name} onChange={set('admin_name')} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-body block mb-1">Organization Name</label>
                  <input
                    className="input text-xs"
                    placeholder="Apex Logistics Ltd"
                    value={form.tenant_name}
                    onChange={e => {
                      setForm(f => ({
                        ...f,
                        tenant_name: e.target.value,
                        tenant_slug: autoSlug(e.target.value),
                      }))
                    }}
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-medium text-body block mb-1">Work Email</label>
              <input
                className="input text-xs"
                type="email"
                placeholder="ops@cargonaut.io"
                value={form.email}
                onChange={set('email')}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-body block mb-1">Password</label>
              <div className="relative">
                <input
                  className="input pr-10 text-xs"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-body"
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-xs font-bold rounded-xl justify-center shadow-xs mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {mode === 'login' ? 'Sign In to Workspace' : 'Create Organization Workspace'}
                  <ArrowRight size={15} />
                </span>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-app-border space-y-3">
            <button
              type="button"
              onClick={handleGuestAccess}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <Sparkles size={16} className="text-amber-300 animate-pulse" />
              Explore Demo (One-Click Guest Access)
            </button>

            <p className="text-xs text-muted text-center">
              {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
              <button
                type="button"
                className="text-primary font-bold hover:underline ml-1"
                onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? 'Create workspace' : 'Sign in'}
              </button>
            </p>
          </div>

          {mode === 'login' && (
            <div className="p-3 rounded-xl bg-app-panel border border-app-border text-xs">
              <p className="text-[11px] text-muted font-bold mb-0.5 uppercase tracking-wider">Demo Credentials</p>
              <p className="font-mono text-body text-xs">admin@demo.com / demo1234</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
