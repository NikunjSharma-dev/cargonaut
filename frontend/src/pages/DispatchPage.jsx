import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Zap, CheckSquare, Square, MapPin, User, ArrowRight, ShieldCheck, Plane, Truck, AlertTriangle, Scale, Route, Sparkles, Bot } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { apiStatus } from '../utils/api'
import { PageLoader, EmptyState, StatusBadge, CargoBadge, TransportModeBadge, Modal, FormField, Spinner } from '../components/ui'
import DispatchAssistantModal from '../components/DispatchAssistantModal'
import { fmtKm } from '../utils/helpers'
import { cargoMeta, incompatibilityReason } from '../utils/cargo'
import clsx from 'clsx'

export default function DispatchPage() {
  const [selected, setSelected] = useState(new Set())
  const [result, setResult] = useState(null)
  const [routeOptResult, setRouteOptResult] = useState(null)
  const [optimMode, setOptimMode] = useState('distance')
  const [modeFilter, setModeFilter] = useState('')
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)

  const { data: orders, isLoading } = useQuery({
    queryKey: ['dispatchable-orders', modeFilter],
    queryFn: () => {
      const params = { page: 1, page_size: 50, status: 'confirmed' }
      if (modeFilter) params.transport_mode = modeFilter
      return api.get('/orders/', { params }).then(r => r.data)
    },
  })

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

  const DEFAULT_STOPS = [
    { id: 's1', label: 'Hub A (Central Depot)', latitude: 19.0760, longitude: 72.8777 },
    { id: 's2', label: 'Stop B (Bandra West)', latitude: 19.0596, longitude: 72.8295 },
    { id: 's3', label: 'Stop C (Thane West)', latitude: 19.2183, longitude: 72.9781 },
    { id: 's4', label: 'Stop D (Andheri East)', latitude: 19.1197, longitude: 72.8464 },
    { id: 's5', label: 'Stop E (Navi Mumbai)', latitude: 19.0330, longitude: 73.0297 },
  ]

  const optimizeRoute = useMutation({
    mutationFn: stops => api.post('/dispatch/optimize/route', { stops }).then(r => r.data),
    onSuccess: data => {
      setRouteOptResult(data)
      toast.success(`2-Opt Optimization complete! Saved ${data.distance_saved_km} km (${data.percentage_saved}%)`)
    },
    onError: () => toast.error('Route optimization failed'),
  })

  const displayOrders = orders?.items || []

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === displayOrders.length) setSelected(new Set())
    else setSelected(new Set(displayOrders.map(o => o.id)))
  }

  function handleOptimize() {
    if (selected.size === 0) {
      toast.error('Select at least one order to optimize')
      return
    }
    optimize.mutate({
      order_ids: Array.from(selected),
      optimization_mode: optimMode,
    })
  }

  const driverMap = (drivers || []).reduce((acc, d) => ({ ...acc, [d.id]: d }), {})

  if (isLoading) return <PageLoader message="Loading dispatch control center..." />

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold text-heading font-display tracking-tight">
            Dispatch & Route Optimization
          </h1>
          <p className="text-sm text-muted">
            CVRP multi-stop optimization & 2-Opt local search solver.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={modeFilter}
            onChange={e => setModeFilter(e.target.value)}
            className="select text-sm py-1.5"
          >
            <option value="">All Modes (Road + Air)</option>
            <option value="road">Road Freight Only</option>
            <option value="air">Air Cargo Only</option>
          </select>

          <button
            onClick={() => setIsAssistantOpen(true)}
            className="btn-secondary inline-flex items-center gap-2 border-primary/30 text-primary hover:bg-primary-soft"
          >
            <Bot size={16} /> AI Dispatch Assistant
          </button>

          <button
            onClick={handleOptimize}
            disabled={optimize.isPending}
            className="btn-primary inline-flex items-center gap-2"
          >
            {optimize.isPending ? <Spinner size="sm" /> : <Zap size={16} />}
            Run Dispatch Solver ({selected.size})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Dispatchable Orders */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4 space-y-4 border-app-border">
            <div className="flex items-center justify-between pb-3 border-b border-app-border">
              <div className="flex items-center gap-3">
                <button onClick={toggleAll} className="text-subtle hover:text-heading">
                  {selected.size > 0 && selected.size === displayOrders.length ? (
                    <CheckSquare size={18} className="text-primary" />
                  ) : (
                    <Square size={18} />
                  )}
                </button>
                <h2 className="text-base font-bold text-heading">
                  Confirmed Orders ({displayOrders.length})
                </h2>
              </div>
              <span className="text-xs font-semibold text-primary bg-primary-soft border border-primary/20 px-2.5 py-1 rounded-full">
                {selected.size} Selected
              </span>
            </div>

            {displayOrders.length === 0 ? (
              <EmptyState
                icon={Zap}
                title="No confirmed orders ready for dispatch"
                description="Create or confirm orders to run VRP optimization."
              />
            ) : (
              <div className="divide-y divide-app-border max-h-[500px] overflow-y-auto pr-1">
                {displayOrders.map(order => {
                  const isChecked = selected.has(order.id)
                  return (
                    <div
                      key={order.id}
                      onClick={() => toggleSelect(order.id)}
                      className={clsx(
                        'py-3 px-2 rounded-lg cursor-pointer transition-colors flex items-center gap-3',
                        isChecked ? 'bg-primary-soft/40' : 'hover:bg-app-surface/60'
                      )}
                    >
                      <button type="button" className="text-subtle">
                        {isChecked ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs font-bold text-primary">{order.order_number}</span>
                          <TransportModeBadge mode={order.transport_mode || 'road'} />
                          <CargoBadge type={order.cargo_type || 'general'} />
                          <span className="text-xs font-semibold text-heading truncate">{order.customer_name}</span>
                        </div>
                        <p className="text-xs text-muted truncate flex items-center gap-1">
                          <MapPin size={13} className="flex-shrink-0 text-primary" />
                          {order.delivery_address}, {order.delivery_city}
                        </p>
                      </div>

                      <div className="text-right flex-shrink-0 text-xs font-mono font-medium text-heading">
                        <p>{(order.chargeable_weight_kg || order.weight_kg || 0).toLocaleString()} kg</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 2-OPT Route Sequence Optimizer Comparison Section */}
          <div className="card p-5 space-y-4 border-app-border bg-app-panel">
            <div className="flex items-center justify-between pb-3 border-b border-app-border">
              <div className="flex items-center gap-2">
                <Route className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-heading">
                  Multi-Stop Route Optimizer (2-Opt Local Search)
                </h2>
              </div>
              <button
                onClick={() => optimizeRoute.mutate(DEFAULT_STOPS)}
                disabled={optimizeRoute.isPending}
                className="btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                {optimizeRoute.isPending ? <Spinner size="sm" /> : <Sparkles size={14} className="text-amber-400" />}
                Run 2-Opt Test ({DEFAULT_STOPS.length} stops)
              </button>
            </div>

            {!routeOptResult ? (
              <p className="text-xs text-muted">
                Click "Run 2-Opt Test" to optimize a multi-stop route sequence and compare original vs un-crossed 2-Opt distances.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-app-surface rounded-xl border border-app-border">
                    <p className="text-[10px] font-semibold text-muted uppercase">Original Dist.</p>
                    <p className="text-sm font-extrabold text-heading font-mono">{routeOptResult.original_distance_km} km</p>
                  </div>
                  <div className="p-3 bg-app-surface rounded-xl border border-app-border">
                    <p className="text-[10px] font-semibold text-muted uppercase">2-Opt Dist.</p>
                    <p className="text-sm font-extrabold text-emerald-400 font-mono">{routeOptResult.optimized_distance_km} km</p>
                  </div>
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <p className="text-[10px] font-semibold text-emerald-400 uppercase">Saved</p>
                    <p className="text-sm font-extrabold text-emerald-400 font-mono">
                      -{routeOptResult.distance_saved_km} km ({routeOptResult.percentage_saved}%)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-app-surface rounded-xl border border-app-border space-y-2">
                    <p className="font-bold text-heading uppercase text-[10px]">Original Sequence</p>
                    <ol className="space-y-1 text-muted font-mono">
                      {routeOptResult.original_sequence.map((idx, step) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-app-panel text-heading text-[10px] flex items-center justify-center font-bold">{step + 1}</span>
                          <span>{DEFAULT_STOPS[idx].label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="p-3 bg-app-surface rounded-xl border border-app-border space-y-2">
                    <p className="font-bold text-emerald-400 uppercase text-[10px] flex items-center gap-1">
                      <Sparkles size={12} /> 2-Opt Optimized Sequence
                    </p>
                    <ol className="space-y-1 text-heading font-mono">
                      {routeOptResult.optimized_sequence.map((idx, step) => (
                        <li key={idx} className="flex items-center gap-2 font-semibold">
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-bold">{step + 1}</span>
                          <span>{DEFAULT_STOPS[idx].label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Dispatch Solver Summary */}
        <div className="space-y-4">
          <div className="card p-4 space-y-4 border-app-border">
            <div className="pb-3 border-b border-app-border">
              <h3 className="text-sm font-bold text-heading">VRP Solver Results</h3>
              <p className="text-xs text-muted">Multi-tenant fleet capacity matching</p>
            </div>

            {!result ? (
              <div className="text-center py-12 text-muted text-xs space-y-2">
                <Zap size={28} className="mx-auto text-primary opacity-40" />
                <p>Select orders and click "Run Dispatch Solver" to optimize carrier routes.</p>
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
                  <p className="text-[11px] font-bold text-heading uppercase tracking-wider">Assigned Carriers</p>
                  {(result.assignments || []).map((a) => {
                    const driver = driverMap[a.driver_id]
                    const orderIds = a.assigned_order_ids || []
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
                      <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle size={14} /> Unassigned Orders ({result.unassigned.length})
                      </p>
                      {result.unassigned.map(u => (
                        <div key={u.order_id} className="p-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-[11px]">
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

      {isAssistantOpen && (
        <DispatchAssistantModal onClose={() => setIsAssistantOpen(false)} />
      )}
    </div>
  )
}
