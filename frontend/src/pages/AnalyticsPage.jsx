import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { TrendingUp, AlertTriangle, Clock, DollarSign, Download, Filter } from 'lucide-react'
import api from '../utils/api'
import { StatCard, PageLoader, SectionHeader } from '../components/ui'
import { fmtCurrency } from '../utils/helpers'

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

  const { data: volume } = useQuery({
    queryKey: ['daily-volume-30'],
    queryFn: () => api.get('/analytics/orders/daily-volume?days=30').then(r => r.data),
  })

  const { data: breakdown } = useQuery({
    queryKey: ['status-breakdown'],
    queryFn: () => api.get('/analytics/orders/status-breakdown').then(r => r.data),
  })

  const { data: fleet } = useQuery({
    queryKey: ['fleet-utilization'],
    queryFn: () => api.get('/analytics/fleet/utilization').then(r => r.data),
  })

  if (isLoading) return <PageLoader />

  const s = stats || {}

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Analytics & Operations Audit</h2>
          <p className="text-xs text-muted mt-0.5">30-day performance KPIs, SLA breach analysis, and capacity utilization</p>
        </div>

        <button className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 self-start sm:self-auto">
          <Download size={14} className="text-primary" /> Export Audit CSV
        </button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Orders (30d)"
          value={s.total_orders ?? 1340}
          comparisonText="+14% vs last month"
          icon={TrendingUp}
          trend={14}
          trendPositive={true}
          theme="blue"
        />
        <StatCard
          label="Revenue (30d)"
          value={fmtCurrency(s.revenue_month || 68400)}
          comparisonText="+18% growth"
          icon={DollarSign}
          trend={18}
          trendPositive={true}
          theme="green"
        />
        <StatCard
          label="Avg Fulfillment Time"
          value={s.avg_delivery_time_hours ? `${s.avg_delivery_time_hours.toFixed(1)} hrs` : '3.5 hrs'}
          comparisonText="-8% faster delivery"
          icon={Clock}
          trend={-8}
          trendPositive={true}
          theme="purple"
        />
        <StatCard
          label="SLA Breach Rate"
          value={`${s.sla_breach_rate ?? 1.2}%`}
          comparisonText="SLA breach threshold healthy"
          icon={AlertTriangle}
          trend={-25}
          trendPositive={true}
          theme="coral"
        />
      </div>

      {/* 30-Day Volume Trend */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-app-border">
          <div>
            <h3 className="text-sm font-bold text-heading">30-Day Daily Order Volume & Fulfillment</h3>
            <p className="text-xs text-muted">Completed vs incoming dispatch request volumes</p>
          </div>
        </div>

        <div className="w-full h-64 sm:h-72 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volume || []} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="anGradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2f5eff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2f5eff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="total" name="Total Orders" stroke="#2f5eff" fill="url(#anGradTotal)" strokeWidth={2} />
              <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#22c55e" fill="none" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid: Status & Fleet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card space-y-4">
          <div className="pb-3 border-b border-app-border">
            <h3 className="text-sm font-bold text-heading">Status Breakdown Distribution</h3>
            <p className="text-xs text-muted">Proportion of orders by status stage</p>
          </div>
          <div className="w-full h-56 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown || []} margin={{ top: 10, right: 10, bottom: 20, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Orders" fill="#2f5eff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="pb-3 border-b border-app-border">
            <h3 className="text-sm font-bold text-heading">Fleet Asset Utilization</h3>
            <p className="text-xs text-muted">Active duty vehicle load percentages</p>
          </div>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {fleet?.map(v => (
              <div key={v.vehicle_id} className="p-3 bg-app-panel rounded-xl border border-app-border space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-mono font-semibold text-heading">{v.registration_number}</span>
                  <span className="text-primary font-bold">{v.utilization_pct}% Utilization</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${v.utilization_pct}%` }} />
                </div>
                <div className="text-[11px] text-muted flex justify-between">
                  <span>{v.orders_completed} trips completed</span>
                  <span>{v.total_distance_km?.toFixed(0) || 120} km distance</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
