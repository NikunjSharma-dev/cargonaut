import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Zap, CheckSquare, Square, MapPin, User, ArrowRight, ShieldCheck, Plane, Truck, AlertTriangle, Scale } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { apiStatus } from '../utils/api'
import { PageLoader, EmptyState, StatusBadge, CargoBadge, TransportModeBadge } from '../components/ui'
import { fmtKm } from '../utils/helpers'
import { cargoMeta, incompatibilityReason } from '../utils/cargo'
import clsx from 'clsx'

export default function DispatchPage() {
  const [selected, setSelected] = useState(new Set())
  const [result, setResult] = useState(null)
  const [optimMode, setOptimMode] = useState('distance')
  const [modeFilter, setModeFilter] = useState('')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['dispatchable-orders', modeFilter],
    queryFn: () => {
      const params = { page: 1, page_size: 50, status: 'confirmed' }
      if (modeFilter) params.transport_mode = modeFilter
      return api.get('/orders/', { params }).then(r => r.data)
    },
  })

  const DEMO_ORDERS = [
    {
      id: '101', order_number: 'ORD-9421', customer_name: 'Acme Retail Corp',
      delivery_city: 'Delhi', delivery_address: 'Terminal 4 Industrial',
      weight_kg: 14200, transport_mode: 'road', cargo_type: 'general'
    },
    {
      id: '105', order_number: 'ORD-9425', customer_name: 'Helios Pharma',
      delivery_city: 'Delhi', delivery_address: 'Cargo Terminal 2, IGI',
      weight_kg: 2400, volume_m3: 19.5, chargeable_weight_kg: 3256.5,
      transport_mode: 'air', cargo_type: 'refrigerated', air_waybill_number: '731-40028115', flight_number: 'CG412'
    },
    {
      id: '107', order_number: 'ORD-9427', customer_name: 'Vector Industrial',
      delivery_city: 'Bengaluru', delivery_address: 'Cargo Village Gate 4',
      weight_kg: 1950, volume_m3: 14.0, chargeable_weight_kg: 2338,
      transport_mode: 'air', cargo_type: 'hazmat', air_waybill_number: '731-40028117', flight_number: 'CG377', hazmat_un_code: 'UN1263'
    },
  ]

  const { data: drivers } = useQuery({
    queryKey: ['available-drivers'],
    queryFn: () => api.get('/drivers/').then(r => r.data),
  })

  const optimize = useMutation({
    mutationFn: payload => api.post('/dispatch/optimize', payload),
    onSuccess: r => {
      setResult(r.data)
      toast.success(`Optimized ${r.data.total_orders} orders in ${r.data.optimization_time_ms.toFixed(0)}ms`)
    },
    onError: err => toast.error(err.response?.data?.detail || 'Optimization failed'),
  })

  const isDemoData = !orders?.items && apiStatus.offline
  const orderItems = orders?.items ?? (isDemoData ? DEMO_ORDERS : [])

  function toggleAll() {
    if (selected.size === orderItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orderItems.map(o => o.id)))
    }
  }

  function toggle(id) {
    setSelected(s => {
      const ns = new Set(s)
      ns.has(id) ? ns.delete(id) : ns.add(id)
      return ns
    })
  }

  function runOptimize() {
    if (selected.size === 0) return toast.error('Select at least one order')
    optimize.mutate({
      order_ids: Array.from(selected),
      optimization_mode: optimMode,
      transport_mode: modeFilter || undefined,
      max_orders_per_driver: 20,
      respect_capacity: true,
    })
  }

  const driverMap = {}
  drivers?.forEach(d => { driverMap[d.id] = d })

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Multi-Modal Dispatch & Route Solver</h2>
          <p className="text-xs text-muted mt-0.5">Mode-aware VRP solver for road trucking & freighter air cargo dispatch</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Mode Selector */}
          <div className="flex items-center p-1 bg-app-panel rounded-xl border border-app-border">
            <button
              onClick={() => setModeFilter('')}
              className={clsx('px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', !modeFilter ? 'bg-app-surface text-primary shadow-2xs font-bold' : 'text-muted hover:text-heading')}
            >
              All Modes
            </button>
            <button
              onClick={() => setModeFilter('road')}
              className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', modeFilter === 'road' ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200' : 'text-muted hover:text-heading')}
            >
              <Truck size={12} /> Road
            </button>
            <button
              onClick={() => setModeFilter('air')}
              className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', modeFilter === 'air' ? 'bg-purple-50 text-purple-700 font-bold border border-purple-200' : 'text-muted hover:text-heading')}
            >
              <Plane size={12} /> Air Cargo
            </button>
          </div>

          <select
            className="select text-xs h-9 w-32 bg-app-surface border-app-border"
            value={optimMode}
            onChange={e => setOptimMode(e.target.value)}
          >
            <option value="distance">Min Distance</option>
            <option value="time">Min Time</option>
            <option value="cost">Min Cost</option>
          </select>

          <button
            className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs flex items-center gap-1.5"
            onClick={runOptimize}
            disabled={optimize.isPending || selected.size === 0}
          >
            {optimize.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Solving VRP…
              </span>
            ) : (
              <><Zap size={15} /> Run Dispatch Solver ({selected.size})</>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Selection Panel */}
        <div className="lg:col-span-2 card p-0 overflow-hidden shadow-card border-app-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-app-border bg-app-panel/50">
            <div className="flex items-center gap-3">
              <button onClick={toggleAll} className="text-subtle hover:text-primary transition-colors">
                {orderItems.length > 0 && selected.size === orderItems.length
                  ? <CheckSquare size={18} className="text-primary" />
                  : <Square size={18} />
                }
              </button>
              <span className="text-xs font-bold text-heading">
                Confirmed Freight Orders ({orderItems.length})
              </span>
            </div>
            {selected.size > 0 && (
              <span className="text-xs font-bold text-primary bg-primary-soft px-2.5 py-0.5 rounded-full border border-primary/25">
                {selected.size} selected
              </span>
            )}
          </div>

          {isLoading ? (
            <PageLoader />
          ) : orderItems.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No confirmed orders"
              description="Confirmed road or air cargo orders appear here ready for dispatch optimization."
            />
          ) : (
            <div className="divide-y divide-app-border max-h-[520px] overflow-y-auto">
              {orderItems.map(order => {
                const checked = selected.has(order.id)
                return (
                  <div
                    key={order.id}
                    onClick={() => toggle(order.id)}
                    className={clsx(
                      'flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors',
                      checked ? 'bg-primary-soft/40' : 'hover:bg-app-panel'
                    )}
                  >
                    <button className="text-subtle flex-shrink-0">
                      {checked
                        ? <CheckSquare size={18} className="text-primary" />
                        : <Square size={18} />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs font-bold text-primary">{order.order_number}</span>
                        <TransportModeBadge mode={order.transport_mode || 'road'} />
                        <CargoBadge type={order.cargo_type || 'general'} />
                        <span className="text-xs font-semibold text-heading truncate">{order.customer_name}</span>
                      </div>
                      <p className="text-xs text-muted truncate flex items-center gap-1">
                        <MapPin size={13} className="flex-shrink-0 text-accent" />
                        {order.delivery_address}, {order.delivery_city}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0 text-xs font-mono font-medium text-heading">
                      <p>{(order.chargeable_weight_kg || order.weight_kg || 0).toLocaleString()} kg</p>
                      {order.air_waybill_number && (
                        <p className="text-[10px] text-purple-700 font-bold">AWB {order.air_waybill_number}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="card space-y-4 shadow-card border-app-border">
          <div className="pb-3 border-b border-app-border">
            <h3 className="text-sm font-bold text-heading">Dispatch Plan Summary</h3>
            <p className="text-xs text-muted">Solvers: Google OR-Tools VRP</p>
          </div>

          {!result ? (
            <div className="text-center py-12 text-muted text-xs space-y-2">
              <Zap size={28} className="mx-auto text-primary opacity-40" />
              <p>Select orders and click "Run Dispatch Solver" to optimize carrier routes and air leg planning</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-app-panel rounded-xl p-3 border border-app-border">
                  <p className="text-[10px] text-muted font-semibold uppercase">Execution Time</p>
                  <p className="text-sm font-extrabold text-heading font-mono">{(result.optimization_time_ms ?? 0).toFixed(0)} ms</p>
                </div>
                <div className="bg-app-panel rounded-xl p-3 border border-app-border">
                  <p className="text-[10px] text-muted font-semibold uppercase">Total Distance</p>
                  <p className="text-sm font-extrabold text-heading font-mono">
                    {fmtKm((result.assignments || []).reduce((sum, a) => sum + (a.estimated_distance_km || 0), 0))}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-bold text-heading uppercase tracking-wider">Assigned Carriers & Flight Crew</p>
                {(result.assignments || []).map((a) => {
                  const driver = driverMap[a.driver_id]
                  const orderIds = a.assigned_order_ids || []
                  const isAir = a.transport_mode === 'air'
                  return (
                    <div key={a.driver_id} className="p-3 bg-app-panel rounded-xl border border-app-border space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-heading flex items-center gap-1.5">
                          <User size={14} className="text-primary" />
                          {a.driver_name || driver?.full_name || 'Carrier'}
                        </span>
                        <TransportModeBadge mode={a.transport_mode || 'road'} />
                      </div>
                      <div className="text-[11px] font-mono text-muted break-all">
                        {orderIds.length} orders assigned: {orderIds.join(', ') || 'None'}
                      </div>
                    </div>
                  )
                })}

                {result.unassigned && result.unassigned.length > 0 && (
                  <div className="pt-2 border-t border-app-border space-y-2">
                    <p className="text-[11px] font-bold text-danger uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle size={14} /> Unassigned Orders ({result.unassigned.length})
                    </p>
                    {result.unassigned.map(u => (
                      <div key={u.order_id} className="p-2 bg-red-50 text-danger border border-red-200 rounded-lg text-[11px]">
                        <span className="font-mono font-bold">{u.order_number}:</span> {u.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
