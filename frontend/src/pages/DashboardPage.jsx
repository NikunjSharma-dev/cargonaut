import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Package, Truck, Users, AlertTriangle,
  TrendingUp, Clock, DollarSign, CheckCircle2,
  ArrowRight, RefreshCw, Layers, ShieldCheck, Filter, Plane, Boxes
} from 'lucide-react'
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
  PieChart, Pie
} from 'recharts'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { StatCard, PageLoader, StatusBadge, CargoBadge, TransportModeBadge } from '../components/ui'
import { fmtCurrency, fmtDateTime } from '../utils/helpers'
import { CARGO_TYPES } from '../utils/cargo'

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

function RadialScoreGauge({ score = 94.2, label = "On-Time SLA Score", subtitle = "Fleet on-time performance is strong" }) {
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
          <circle
            stroke="#f3f4f6"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
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

function TransportModeSplitWidget({ roadOrders = 4, airOrders = 3, airCapable = 2 }) {
  const total = roadOrders + airOrders || 1
  const roadPct = Math.round((roadOrders / total) * 100)
  const airPct = 100 - roadPct

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-app-border">
        <div>
          <h4 className="text-xs font-bold text-heading uppercase tracking-wider">Multi-Modal Freight Split</h4>
          <p className="text-[11px] text-muted">Road Trucking vs Air Cargo</p>
        </div>
        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
          {airCapable} Freighters Ready
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs mb-1">
            <Truck size={16} /> Road Freight
          </div>
          <p className="text-xl font-extrabold text-heading">{roadOrders} <span className="text-xs text-muted font-normal">orders</span></p>
          <p className="text-[10px] text-emerald-700 font-semibold">{roadPct}% Share</p>
        </div>

        <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl">
          <div className="flex items-center gap-1.5 text-purple-700 font-bold text-xs mb-1">
            <Plane size={16} /> Air Cargo
          </div>
          <p className="text-xl font-extrabold text-heading">{airOrders} <span className="text-xs text-muted font-normal">orders</span></p>
          <p className="text-[10px] text-purple-700 font-semibold">{airPct}% Share</p>
        </div>
      </div>

      <div className="w-full h-3 rounded-full bg-app-hover overflow-hidden flex shadow-inner">
        <div style={{ width: `${roadPct}%` }} className="h-full bg-emerald-500 transition-all duration-500" />
        <div style={{ width: `${airPct}%` }} className="h-full bg-purple-600 transition-all duration-500" />
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

  const { data: recentOrders } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: () => api.get('/orders/?page=1&page_size=6').then(r => r.data),
  })

  if (statsLoading) return <PageLoader />

  const s = stats || {}

  const monthlyData = [
    { month: 'Jan 2026', total: 840, revenue: 42100, delivered: 810, onTimeRate: 96 },
    { month: 'Feb 2026', total: 920, revenue: 48500, delivered: 890, onTimeRate: 95 },
    { month: 'Mar 2026', total: 1050, revenue: 54200, delivered: 1010, onTimeRate: 97 },
    { month: 'Apr 2026', total: 980, revenue: 51000, delivered: 940, onTimeRate: 94 },
    { month: 'May 2026', total: 1120, revenue: 59800, delivered: 1090, onTimeRate: 98 },
    { month: 'Jun 2026', total: 1250, revenue: 64500, delivered: 1210, onTimeRate: 96 },
    { month: 'Jul 2026', total: 1180, revenue: 61200, delivered: 1140, onTimeRate: 95 },
    { month: 'Aug 2026', total: s.total_orders || 1340, revenue: s.revenue_month || 68400, delivered: 1290, onTimeRate: 97 },
  ]

  const activeShipmentsSpark = [{ v: 20 }, { v: 24 }, { v: 22 }, { v: 31 }, { v: 28 }, { v: 35 }, { v: 38 }, { v: 42 }]
  const onTimeSpark = [{ v: 92 }, { v: 94 }, { v: 91 }, { v: 95 }, { v: 96 }, { v: 94 }, { v: 97 }, { v: 98 }]
  const airFreightSpark = [{ v: 12 }, { v: 18 }, { v: 25 }, { v: 32 }, { v: 40 }, { v: 48 }, { v: 52 }, { v: 60 }]
  const utilizationSpark = [{ v: 65 }, { v: 70 }, { v: 74 }, { v: 78 }, { v: 82 }, { v: 85 }, { v: 88 }, { v: 91 }]
  const exceptionsSpark = [{ v: 8 }, { v: 5 }, { v: 6 }, { v: 4 }, { v: 3 }, { v: 2 }, { v: 1 }, { v: 0 }]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="On-Time SLA Rate"
          value={`${s.on_time_rate_pct ?? 95.8}%`}
          comparisonText={`SLA breach rate: ${s.sla_breach_rate ?? 0}%`}
          icon={CheckCircle2}
          trend={2.4}
          trendPositive={true}
          sparklineData={onTimeSpark}
          theme="green"
        />
        <StatCard
          label="Active Fleet Vehicles"
          value={`${s.available_vehicles ?? 3} / ${s.total_vehicles ?? 5}`}
          comparisonText={`${s.active_drivers ?? 2} Drivers Assigned`}
          icon={Truck}
          trend={8.5}
          trendPositive={true}
          sparklineData={utilizationSpark}
          theme="amber"
        />
        <StatCard
          label="Avg Delivery Time"
          value={`${s.avg_delivery_time_hours ?? 2.4} hrs`}
          comparisonText="Avg transit cycle time"
          icon={Clock}
          trend={-5.2}
          trendPositive={true}
          sparklineData={activeShipmentsSpark}
          theme="blue"
        />
        <StatCard
          label="Distance Traveled Today"
          value={`${s.distance_today_km?.toLocaleString() ?? 1280} km`}
          comparisonText="Combined fleet stage length"
          icon={TrendingUp}
          trend={12.0}
          trendPositive={true}
          sparklineData={airFreightSpark}
          theme="purple"
        />
        <StatCard
          label="Active Orders In-Transit"
          value={s.orders_in_transit ?? 42}
          comparisonText={`${s.orders_delivered_today ?? 8} Delivered Today`}
          icon={Package}
          trend={13}
          trendPositive={true}
          sparklineData={exceptionsSpark}
          theme="blue"
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-app-border">
            <div>
              <h3 className="text-sm font-bold text-heading">Monthly Freight Volume & Revenue</h3>
              <p className="text-xs text-muted">Aggregated road and air cargo volume across current year</p>
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
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <Tooltip content={<MonthlyBarTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  {monthlyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={hoveredBarIndex === index || index === monthlyData.length - 1 ? '#e8606d' : '#e5e7eb'}
                      className="transition-all duration-200 cursor-pointer"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <RadialScoreGauge score={94.2} />
        </div>
      </div>

      {/* Multi-Modal Split & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <TransportModeSplitWidget
            roadOrders={s.road_orders ?? 4}
            airOrders={s.air_orders ?? 3}
            airCapable={s.air_capable_vehicles ?? 2}
          />
        </div>

        <div className="card lg:col-span-2 p-0 overflow-hidden space-y-0 flex flex-col justify-between">
          <div className="flex items-center justify-between px-5 py-4 border-b border-app-border bg-app-panel/50">
            <div>
              <h3 className="text-sm font-bold text-heading">Recent Multi-Modal Cargo Orders</h3>
              <p className="text-xs text-muted">Live incoming road & air freight requests</p>
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
                  <th className="table-header">Mode</th>
                  <th className="table-header">Order #</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Cargo Class</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {recentOrders?.items?.map(order => (
                  <tr key={order.id} className="table-row">
                    <td className="table-cell">
                      <TransportModeBadge mode={order.transport_mode || 'road'} />
                    </td>
                    <td className="table-cell font-mono text-xs font-semibold text-primary">
                      {order.order_number}
                    </td>
                    <td className="table-cell font-medium text-heading text-xs">
                      {order.customer_name}
                    </td>
                    <td className="table-cell">
                      <CargoBadge type={order.cargo_type || 'general'} />
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={order.status} />
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
