import { format, formatDistanceToNow, isValid } from 'date-fns'

export function fmtDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return isValid(date) ? format(date, 'MMM d, yyyy') : '—'
}

export function fmtDateTime(d) {
  if (!d) return '—'
  const date = new Date(d)
  return isValid(date) ? format(date, 'MMM d, HH:mm') : '—'
}

export function fmtRelative(d) {
  if (!d) return '—'
  const date = new Date(d)
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : '—'
}

export function fmtCurrency(amount, currency = 'USD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

export function fmtNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

export function fmtKm(km) {
  if (km == null) return '—'
  return `${Number(km).toFixed(1)} km`
}

export const STATUS_BADGE = {
  draft:      'badge-draft',
  confirmed:  'badge-confirmed',
  dispatched: 'badge-dispatched',
  in_transit: 'badge-in_transit',
  arrived:    'badge-arrived',
  delivered:  'badge-delivered',
  failed:     'badge-failed',
  cancelled:  'badge-cancelled',
}

export const STATUS_DOT = {
  draft:      'bg-slate-500',
  confirmed:  'bg-blue-400',
  dispatched: 'bg-violet-400',
  in_transit: 'bg-amber-400',
  arrived:    'bg-cyan-400',
  delivered:  'bg-emerald-400',
  failed:     'bg-red-400',
  cancelled:  'bg-slate-600',
}

export const PRIORITY_LABEL = { 1: 'Normal', 2: 'High', 3: 'Urgent' }
export const PRIORITY_COLOR = {
  1: 'text-slate-400',
  2: 'text-amber-400',
  3: 'text-red-400',
}

export const VEHICLE_STATUS_COLOR = {
  available:   'bg-emerald-900/50 text-emerald-300',
  in_transit:  'bg-amber-900/50 text-amber-300',
  maintenance: 'bg-red-900/50 text-red-300',
  offline:     'bg-slate-800 text-slate-400',
}

export function truncate(str, n = 40) {
  if (!str) return '—'
  return str.length > n ? `${str.slice(0, n)}…` : str
}

export function initials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function avatarColor(name = '') {
  const colors = [
    'from-brand-600 to-brand-800',
    'from-violet-600 to-violet-800',
    'from-emerald-600 to-emerald-800',
    'from-amber-600 to-amber-800',
    'from-cyan-600 to-cyan-800',
    'from-pink-600 to-pink-800',
  ]
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}
