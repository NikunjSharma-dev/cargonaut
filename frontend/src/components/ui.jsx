import { useId } from 'react'
import clsx from 'clsx'
import { X, AlertCircle, Loader2, TrendingUp, TrendingDown, Minus, Truck, Plane } from 'lucide-react'
import { STATUS_BADGE, VEHICLE_STATUS_COLOR } from '../utils/helpers.js'
import { cargoMeta } from '../utils/cargo.js'


// ─── Sparkline ─────────────────────────────────────────────────────────────────
// Plain inline SVG on purpose: recharts' ResponsiveContainer mis-measures inside
// a box this small and paints a surface that escapes the card.

const SPARK_W = 80
const SPARK_H = 36

function Sparkline({ data, color }) {
  const gradientId = `spark-${useId().replace(/:/g, '')}`
  const values = data.map(d => d.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((v, i) => ({
    x: values.length === 1 ? SPARK_W / 2 : (i / (values.length - 1)) * (SPARK_W - 4) + 2,
    y: SPARK_H - 4 - ((v - min) / range) * (SPARK_H - 10),
  }))

  // Smooth the line with a horizontal-midpoint bezier between each pair
  const line = points.reduce((d, p, i) => {
    if (i === 0) return `M ${p.x},${p.y}`
    const prev = points[i - 1]
    const cx = (prev.x + p.x) / 2
    return `${d} C ${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`
  }, '')

  const area = `${line} L ${points[points.length - 1].x},${SPARK_H} L ${points[0].x},${SPARK_H} Z`

  return (
    <svg
      width="100%"
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block overflow-hidden"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ─── StatCard / KPI Card (Reference B Style with Sparklines) ────────────────────

export function StatCard({
  label,
  value,
  comparisonText,
  icon: Icon,
  trend,
  trendPositive = true,
  sparklineData,
  theme = 'blue',
  className
}) {
  const themeMap = {
    blue:   { iconBg: 'bg-primary-soft text-primary border-primary/20', sparkColor: '#e8606d' },
    coral:  { iconBg: 'bg-red-50 text-accent border-red-100', sparkColor: '#f0555f' },
    green:  { iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100', sparkColor: '#22c55e' },
    amber:  { iconBg: 'bg-amber-50 text-amber-600 border-amber-100', sparkColor: '#f5a524' },
    purple: { iconBg: 'bg-purple-50 text-purple-600 border-purple-100', sparkColor: '#8b5cf6' },
  }

  const currentTheme = themeMap[theme] || themeMap.blue

  // Default fallback sparkline data if not provided
  const dummySparkline = sparklineData || [
    { v: 30 }, { v: 45 }, { v: 38 }, { v: 52 }, { v: 48 }, { v: 65 }, { v: 58 }, { v: 74 }
  ]

  const isUp = trend > 0
  const isDown = trend < 0

  return (
    <div className={clsx('card hover:border-primary/30 transition-all flex flex-col justify-between', className)}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">{label}</p>
          <h3 className="text-2xl font-bold text-heading tracking-tight font-display">{value}</h3>
        </div>
        {Icon && (
          <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-2xs', currentTheme.iconBg)}>
            <Icon size={20} className="stroke-[2.2]" />
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-app-border space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
          {trend !== undefined && (
            <span className={clsx(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-semibold text-[11px] flex-shrink-0',
              trendPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            )}>
              {isUp ? <TrendingUp size={12} /> : isDown ? <TrendingDown size={12} /> : <Minus size={12} />}
              {trend > 0 ? `+${trend}%` : `${trend}%`}
            </span>
          )}
          <span className="text-[11px] text-muted truncate">
            {comparisonText || 'vs last month'}
          </span>
        </div>

        {/* Sparkline strip */}
        <div className="h-9 w-full overflow-hidden">
          <Sparkline data={dummySparkline} color={currentTheme.sparkColor} />
        </div>
      </div>
    </div>
  )
}

// ─── Status Badges ─────────────────────────────────────────────────────────────

export function StatusBadge({ status }) {
  const normalized = status?.toLowerCase() || 'draft'
  const map = {
    on_route: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    waiting: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    in_transit: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dispatched: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    confirmed: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    failed: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    cancelled: 'bg-app-hover text-body border-app-border',
    draft: 'bg-app-hover text-body border-app-border',
    // Shift roster states
    scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    completed: 'bg-app-hover text-body border-app-border',
  }

  const dotMap = {
    on_route: 'bg-emerald-400',
    delivered: 'bg-emerald-400',
    waiting: 'bg-amber-400',
    in_transit: 'bg-amber-400',
    dispatched: 'bg-blue-400',
    confirmed: 'bg-blue-400',
    failed: 'bg-rose-500',
    cancelled: 'bg-slate-400',
    draft: 'bg-slate-400',
    scheduled: 'bg-blue-400',
    active: 'bg-emerald-400',
    completed: 'bg-slate-400',
  }

  const cls = map[normalized] || 'bg-app-hover text-body border-app-border'
  const dotCls = dotMap[normalized] || 'bg-slate-400'

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-2xs whitespace-nowrap', cls)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotCls)} />
      <span>{status?.replace('_', ' ')}</span>
    </span>
  )
}

export function VehicleStatusBadge({ status }) {
  return <StatusBadge status={status} />
}

// ─── Loader & Spinner ─────────────────────────────────────────────────────────

export function Spinner({ size = 20, className }) {
  const numSize = typeof size === 'number' ? size : size === 'sm' ? 16 : size === 'lg' ? 32 : 20
  return (
    <Loader2
      size={numSize}
      className={clsx('animate-spin text-primary flex-shrink-0', className)}
    />
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64 w-full">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={32} />
        <p className="text-xs font-medium text-muted">Loading ops data...</p>
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-app-surface border border-app-border rounded-2xl shadow-xs">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-app-panel border border-app-border flex items-center justify-center mb-4 text-primary">
          <Icon size={24} />
        </div>
      )}
      <h4 className="text-sm font-bold text-heading mb-1">{title}</h4>
      {description && <p className="text-xs text-muted max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  )
}

// ─── Modal Component ──────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />
      <div className={clsx('relative bg-app-surface border border-app-border rounded-2xl shadow-floating w-full z-10 animate-in fade-in zoom-in-95 duration-150', width)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-app-border">
          <h3 className="text-sm font-bold text-heading">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-app-hover transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Priority Pill ────────────────────────────────────────────────────────────

export function PriorityBadge({ priority }) {
  const map = {
    1: { label: 'Standard SLA', cls: 'bg-app-hover text-body border-app-border' },
    2: { label: 'High Priority', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    3: { label: 'Express Urgent', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  }
  const { label, cls } = map[priority] || map[1]
  return (
    <span className={clsx('inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold border', cls)}>
      {label}
    </span>
  )
}

// ─── Cargo & Transport Mode Badges ──────────────────────────────────────────

export function CargoBadge({ type, size = 'sm' }) {
  const meta = cargoMeta(type)
  const Icon = meta.icon
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap',
      meta.tone === 'cargo-cold' && 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      meta.tone === 'cargo-fragile' && 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      meta.tone === 'cargo-hazard' && 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      meta.tone === 'cargo-bulk' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      meta.tone === 'cargo-value' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      meta.tone === 'cargo-neutral' && 'bg-app-hover text-body border-app-border'
    )}>
      <Icon size={size === 'sm' ? 12 : 14} className="flex-shrink-0" />
      <span>{meta.label}</span>
    </span>
  )
}

export function TransportModeBadge({ mode }) {
  const isAir = mode === 'air'
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider whitespace-nowrap',
      isAir
        ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    )}>
      {isAir ? <Plane size={13} className="flex-shrink-0" /> : <Truck size={13} className="flex-shrink-0" />}
      <span>{isAir ? 'Air Freight' : 'Road Transport'}</span>
    </span>
  )
}

// ─── FormField Component ──────────────────────────────────────────────────────

export function FormField({ label, error, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-body">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-danger flex items-center gap-1 mt-0.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h2 className="page-title">{title}</h2>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}



