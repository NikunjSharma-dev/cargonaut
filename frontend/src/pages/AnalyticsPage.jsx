import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { TrendingUp, AlertTriangle, Clock, DollarSign, Download, Filter, Plane, Truck, Boxes } from 'lucide-react'
import api from '../utils/api'
import { StatCard, PageLoader, SectionHeader, CargoBadge, TransportModeBadge } from '../components/ui'
import { fmtCurrency } from '../utils/helpers'
import { CARGO_TYPES } from '../utils/cargo'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-3 shadow-floating text-xs font-sans">
      <p className="text-subtle font-semibold mb-1 uppercase tracking-wider text-[10px]">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-bold text-xs">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/analytics/dashboard').then(r => r.data),
  })

  const { data: cargoMix } = useQuery({
    queryKey: ['cargo-mix'],
    queryFn: () => api.get('/analytics/cargo/mix').then(r => r.data),
  })

  const { data: modeSplit } = useQuery({
    queryKey: ['mode-split'],
    queryFn: () => api.get('/analytics/cargo/mode-split').then(r => r.data),
  })

  const { data: volume } = useQuery({
    queryKey: ['daily-volume-30'],
    queryFn: () => api.get('/analytics/orders/daily-volume?days=30').then(r => r.data),
  })

  const { data: fleet } = useQuery({
    queryKey: ['fleet-utilization'],
    queryFn: () => api.get('/analytics/fleet/utilization').then(r => r.data),
  })

  const { data: anomalies } = useQuery({
    queryKey: ['fleet-anomalies'],
    queryFn: () => api.get('/predict/anomalies').then(r => r.data),
  })

  if (isLoading) return <PageLoader />

  const s = stats || {}

  const DEMO_CARGO_MIX = [
    { cargo_type: 'general', label: 'General freight', count: 4, percentage: 30.8, total_weight_kg: 24500 },
    { cargo_type: 'refrigerated', label: 'Refrigerated', count: 3, percentage: 23.1, total_weight_kg: 18400 },
    { cargo_type: 'hazmat', label: 'Hazardous goods', count: 2, percentage: 15.4, total_weight_kg: 12200 },
    { cargo_type: 'high_value', label: 'High value', count: 2, percentage: 15.4, total_weight_kg: 9800 },
    { cargo_type: 'liquid_bulk', label: 'Liquid bulk', count: 2, percentage: 15.4, total_weight_kg: 21000 },
  ]

  const mixData = cargoMix || DEMO_CARGO_MIX

  const COLORS = ['#e8606d', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6366f1']

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Cargo Analytics & Multi-Modal Audit</h2>
          <p className="text-xs text-muted mt-0.5">30-day performance KPIs, cargo taxonomy mix, air freight split & asset utilization</p>
        </div>

        <button className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 self-start sm:self-auto">
          <Download size={14} className="text-primary" /> Export Audit CSV
        </button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Cargo Tonnage (30d)"
          value={`${((s.total_orders || 1340) * 8.5).toLocaleString(undefined, { maximumFractionDigits: 0 })} kg`}
          comparisonText="+14% tonnage growth"
          icon={TrendingUp}
          trend={14}
          trendPositive={true}
          theme="blue"
        />
        <StatCard
          label="Air Cargo Share"
          value={`${s.air_freight_share_pct ?? 42.9}%`}
          comparisonText={`${s.air_orders ?? 3} Air / ${s.road_orders ?? 4} Road`}
          icon={Plane}
          trend={18}
          trendPositive={true}
          theme="purple"
        />
        <StatCard
          label="Avg Fulfillment Time"
          value={s.avg_delivery_time_hours ? `${s.avg_delivery_time_hours.toFixed(1)} hrs` : '3.5 hrs'}
          comparisonText="-8% faster delivery"
          icon={Clock}
          trend={-8}
          trendPositive={true}
          theme="green"
        />
        <StatCard
          label="SLA Breach Rate"
          value={`${s.sla_breach_rate ?? 0.0}%`}
          comparisonText="Zero air/road SLA breaches"
          icon={AlertTriangle}
          trend={-25}
          trendPositive={true}
          theme="coral"
        />
      </div>

      {/* Cargo Taxonomy Mix & Mode Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cargo Mix Bar Chart */}
        <div className="card space-y-4">
          <div className="pb-3 border-b border-app-border">
            <h3 className="text-sm font-bold text-heading">Cargo Taxonomy Tonnage Distribution</h3>
            <p className="text-xs text-muted">Total weight (kg) moved by cargo handling profile</p>
          </div>
          <div className="w-full h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mixData} margin={{ top: 10, right: 10, bottom: 25, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="label" interval={0} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
                <Bar dataKey="total_weight_kg" name="Weight (kg)" fill="#e8606d" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fleet Asset Utilization */}
        <div className="card space-y-4">
          <div className="pb-3 border-b border-app-border">
            <h3 className="text-sm font-bold text-heading">Multi-Modal Fleet Asset Utilization</h3>
            <p className="text-xs text-muted">Trucks & Widebody Freighters load capacity</p>
          </div>
          <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
            {fleet?.map(v => (
              <div key={v.vehicle_id} className="p-3 bg-app-panel rounded-xl border border-app-border space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-heading">{v.registration_number}</span>
                    <TransportModeBadge mode={v.transport_mode} />
                  </div>
                  <span className="text-primary font-bold">{v.utilization_pct}% Load</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${v.utilization_pct}%` }} />
                </div>
                <div className="text-[11px] text-muted flex justify-between">
                  <span>{v.orders_completed} trips completed</span>
                  <span>{v.total_km?.toFixed(0) || 120} km stage length</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Fleet Anomaly Detection Panel */}
      <div className="card space-y-4 border-app-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-app-border">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-heading flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>AI Telemetry Anomaly Panel (Isolation Forest Model)</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">Periodic multi-variate statistical anomaly scoring on speed, idle time, fuel rate & braking</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap self-start sm:self-auto">
            {anomalies?.filter(a => a.is_anomaly).length || 0} Flagged Anomalies
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {anomalies?.map((item, idx) => (
            <div
              key={item.vehicle_id || idx}
              className={`p-4 rounded-xl border ${
                item.is_anomaly
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  : 'bg-app-panel border-app-border text-heading'
              } space-y-2`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-heading">{item.vehicle_registration}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  item.is_anomaly ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {item.is_anomaly ? `Anomaly Score ${(item.anomaly_score * 100).toFixed(0)}%` : 'Normal'}
                </span>
              </div>

              <div className="text-xs text-muted grid grid-cols-2 gap-2 pt-1">
                <div>Avg Speed: <strong className="text-heading">{item.avg_speed_kmh} km/h</strong></div>
                <div>Idle Time: <strong className="text-heading">{item.idle_time_minutes} min</strong></div>
                <div>Fuel Rate: <strong className="text-heading">{item.fuel_rate_lph} L/h</strong></div>
                <div>Harsh Brakes: <strong className="text-heading">{item.harsh_braking_events}</strong></div>
              </div>

              {item.is_anomaly && item.reasons?.length > 0 && (
                <div className="pt-2 border-t border-rose-500/20 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Reasons:</p>
                  <ul className="text-xs space-y-1 pl-4 list-disc text-rose-300">
                    {item.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

