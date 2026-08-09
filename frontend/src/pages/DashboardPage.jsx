import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Package, Truck, Users, AlertTriangle,
  TrendingUp, Clock, DollarSign, CheckCircle2,
  ArrowRight, RefreshCw, Layers, ShieldCheck, Filter
} from 'lucide-react'
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
  PieChart, Pie
} from 'recharts'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { StatCard, PageLoader, StatusBadge } from '../components/ui'
import { fmtCurrency, fmtDateTime } from '../utils/helpers'

// Custom tooltip for Monthly Bar Chart matching Reference B ($32,849 on Aug 2024 pattern)
function MonthlyBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  return (
    <div className="bg-app-surface border border-app-border rounded-xl p-3 shadow-floating text-xs font-sans animate-in fade-in zoom-in-95 duration-150">
      <p className="text-subtle font-semibold mb-1 uppercase tracking-wider text-[10px]">{data.month || label}</p>
      <p className="text-primary font-bold text-sm">
        {data.revenue ? fmtCurrency(data.revenue) : `${data.total || data.value || 0} Shipments`}
      </p>
      <p className="text-[11px] text-muted mt-0.5">
        {data.delivered ? `${data.delivered} Delivered (${data.onTimeRate || 96}% On-Time)` : 'Target SLA Achieved'}
      </p>
    </div>
  )
}

// Radial Score Gauge Component (Reference B pattern)
function RadialScoreGauge({ score = 88.4, label = "On-Time SLA Score", subtitle = "Your fleet on-time performance is strong" }) {
  const radius = 64
  const stroke = 12
  const normalizedRadius = radius - stroke * 0.5
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (score / 100) * circumference

  return (
    <div className="card flex flex-col justify-between h-full">
      <div className="flex items-center justify-between pb-3 border-b border-app-border">
        <div>
          <h4 className="text-xs font-bold text-heading uppercase tracking-wider">Fleet Operational Score</h4>
          <p className="text-[11px] text-muted">Real-time aggregate metric</p>
        </div>
        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          HEALTHY
        </span>
      </div>

      <div className="py-6 flex flex-col items-center justify-center relative">
        <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            stroke="#f3f4f6"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Progress circle */}
          <circle
            stroke="var(--primary)"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold text-heading font-display">{score}%</span>
          <span className="text-[10px] font-semibold text-muted tracking-tight">SLA COMPLIANCE</span>
        </div>
      </div>

      <div className="pt-3 border-t border-app-border text-center space-y-1">
        <p className="text-xs font-medium text-heading">{subtitle}</p>
        <p className="text-[10px] text-muted flex items-center justify-center gap-1">
          <RefreshCw size={10} className="text-primary animate-spin" /> Refreshed 2 mins ago
        </p>
      </div>
    </div>
  )
}

// Composition Breakdown Bar Component (Reference B pattern)
function CompositionBreakdownBar() {
  const categories = [
    { name: 'Heavy Freight (24T)', pct: 45, count: 12, color: 'bg-primary', hex: '#2f5eff' },
    { name: 'Medium Vans (10T)', pct: 35, count: 9, color: 'bg-accent', hex: '#f0555f' },
    { name: 'Express Bikes (3.5T)', pct: 20, count: 7, color: 'bg-emerald-500', hex: '#22c55e' },
  ]

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-heading uppercase tracking-wider">Fleet Composition Split</h4>
          <p className="text-[11px] text-muted">28 Active Vehicles in Fleet</p>
        </div>
        <span className="text-xs text-primary font-semibold hover:underline cursor-pointer">
          Details
        </span>
      </div>

      {/* Segmented Legend + Counts Above */}
      <div className="grid grid-cols-3 gap-2">
        {categories.map((c) => (
          <div key={c.name} className="p-2 rounded-xl bg-app-panel border border-app-border text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.hex }} />
              <span className="text-[11px] font-medium text-muted truncate">{c.name}</span>
            </div>
            <p className="text-sm font-bold text-heading">{c.pct}% <span className="text-[10px] font-normal text-muted">({c.count} v)</span></p>
          </div>
        ))}
      </div>

      {/* Horizontal Segmented Bar */}
      <div className="w-full h-3 rounded-full bg-app-hover overflow-hidden flex shadow-inner">
        {categories.map((c) => (
          <div
            key={c.name}
            style={{ width: `${c.pct}%`, backgroundColor: c.hex }}
            className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            title={`${c.name}: ${c.pct}%`}
          />
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/analytics/dashboard').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: volume } = useQuery({
    queryKey: ['daily-volume'],
    queryFn: () => api.get('/analytics/orders/daily-volume?days=14').then(r => r.data),
  })

  const { data: recentOrders } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: () => api.get('/orders/?page=1&page_size=5').then(r => r.data),
  })

  const { data: fleet } = useQuery({
    queryKey: ['fleet-utilization'],
    queryFn: () => api.get('/analytics/fleet/utilization').then(r => r.data),
  })

  if (statsLoading) return <PageLoader />

  const s = stats || {}

  // Reference B Monthly Bar Data (fallback/supplemented for full year look)
  const monthlyData = [
    { month: 'Jan 2026', total: 840, revenue: 42100, delivered: 810, onTimeRate: 96 },
    { month: 'Feb 2026', total: 920, revenue: 48500, delivered: 890, onTimeRate: 95 },
    { month: 'Mar 2026', total: 1050, revenue: 54200, delivered: 1010, onTimeRate: 97 },
    { month: 'Apr 2026', total: 980, revenue: 51000, delivered: 940, onTimeRate: 94 },
    { month: 'May 2026', total: 1120, revenue: 59800, delivered: 1090, onTimeRate: 98 },
    { month: 'Jun 2026', total: 1250, revenue: 64500, delivered: 1210, onTimeRate: 96 },
    { month: 'Jul 2026', total: 1180, revenue: 61200, delivered: 1140, onTimeRate: 95 },
    { month: 'Aug 2026', total: s.orders_today ? (s.total_orders || 1340) : 1340, revenue: s.revenue_month || 68400, delivered: 1290, onTimeRate: 97 },
  ]

  // KPI Sparklines
  const activeShipmentsSpark = [{ v: 20 }, { v: 24 }, { v: 22 }, { v: 31 }, { v: 28 }, { v: 35 }, { v: 38 }, { v: 42 }]
  const onTimeSpark = [{ v: 92 }, { v: 94 }, { v: 91 }, { v: 95 }, { v: 96 }, { v: 94 }, { v: 97 }, { v: 98 }]
  const deliveryTimeSpark = [{ v: 4.8 }, { v: 4.5 }, { v: 4.2 }, { v: 4.6 }, { v: 4.1 }, { v: 3.9 }, { v: 3.8 }, { v: 3.5 }]
  const utilizationSpark = [{ v: 65 }, { v: 70 }, { v: 74 }, { v: 78 }, { v: 82 }, { v: 85 }, { v: 88 }, { v: 91 }]
  const exceptionsSpark = [{ v: 8 }, { v: 5 }, { v: 6 }, { v: 4 }, { v: 3 }, { v: 2 }, { v: 1 }, { v: 0 }]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* KPI Cards Row (5 Cards Reference B style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="Active Shipments"
          value={s.orders_in_transit ?? 42}
          comparisonText="+13% vs last month"
          icon={Package}
          trend={13}
          trendPositive={true}
          sparklineData={activeShipmentsSpark}
          theme="blue"
        />
        <StatCard
          label="On-Time Delivery Rate"
          value="97.8%"
          comparisonText="+2.4% vs last month"
          icon={CheckCircle2}
          trend={2.4}
          trendPositive={true}
          sparklineData={onTimeSpark}
          theme="green"
        />
        <StatCard
          label="Avg Delivery Time"
          value={s.avg_delivery_time_hours ? `${s.avg_delivery_time_hours.toFixed(1)}h` : '3.5h'}
          comparisonText="-12% time reduction"
          icon={Clock}
          trend={-12}
          trendPositive={true}
          sparklineData={deliveryTimeSpark}
          theme="purple"
        />
        <StatCard
          label="Fleet Utilization"
          value="91.2%"
          comparisonText="+8.5% capacity used"
          icon={Truck}
          trend={8.5}
          trendPositive={true}
          sparklineData={utilizationSpark}
          theme="amber"
        />
        <StatCard
          label="Open Exceptions / Alerts"
          value={s.sla_breach_count ?? 1}
          comparisonText="-40% breach reduction"
          icon={AlertTriangle}
          trend={-40}
          trendPositive={true}
          sparklineData={exceptionsSpark}
          theme="coral"
        />
      </div>

      {/* Main Charts Row (Monthly Bar Chart + Radial Score Gauge) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Volume Bar Chart (Reference B) */}
        <div className="card lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-app-border">
            <div>
              <h3 className="text-sm font-bold text-heading">Monthly Logistics Volume & Revenue</h3>
              <p className="text-xs text-muted">Completed shipments trend across current year</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-body bg-app-hover px-2.5 py-1 rounded-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Volume (Shipments)
              </span>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                onMouseMove={(state) => {
                  if (state.activeTooltipIndex !== undefined) {
                    setHoveredBarIndex(state.activeTooltipIndex)
                  }
                }}
                onMouseLeave={() => setHoveredBarIndex(null)}
              >
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<MonthlyBarTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  {monthlyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={hoveredBarIndex === index || index === monthlyData.length - 1 ? '#2f5eff' : '#e5e7eb'}
                      className="transition-all duration-200 cursor-pointer"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radial Score Gauge */}
        <div className="lg:col-span-1">
          <RadialScoreGauge
            score={94.2}
            label="On-Time SLA Score"
            subtitle="Your fleet on-time performance is strong"
          />
        </div>
      </div>

      {/* Composition Split & Recent Orders Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composition Breakdown Bar */}
        <div className="lg:col-span-1">
          <CompositionBreakdownBar />
        </div>

        {/* Orders Data Table Preview (Reference B style status pills) */}
        <div className="card lg:col-span-2 p-0 overflow-hidden space-y-0 flex flex-col justify-between">
          <div className="flex items-center justify-between px-5 py-4 border-b border-app-border bg-app-panel/50">
            <div>
              <h3 className="text-sm font-bold text-heading">Recent Orders & Dispatch Requests</h3>
              <p className="text-xs text-muted">Live incoming request feed</p>
            </div>
            <Link
              to="/orders"
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 text-primary border-primary/25 hover:bg-primary-soft"
            >
              View All Orders <ArrowRight size={14} />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="table-header">Order ID</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Destination</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {recentOrders?.items?.map(order => (
                  <tr key={order.id} className="table-row">
                    <td className="table-cell font-mono text-xs font-semibold text-primary">
                      {order.order_number}
                    </td>
                    <td className="table-cell font-medium text-heading text-xs">
                      {order.customer_name}
                    </td>
                    <td className="table-cell text-xs text-muted">
                      {order.delivery_city || 'Regional Hub'}
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="table-cell text-xs text-muted text-right font-mono">
                      {fmtDateTime(order.created_at)}
                    </td>
                  </tr>
                )) || (
                  <tr className="table-row">
                    <td colSpan={5} className="table-cell text-center text-muted py-6">
                      No recent orders found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
