import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Zap, CheckSquare, Square, MapPin, User, ArrowRight, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { apiStatus } from '../utils/api'
import { PageLoader, EmptyState, StatusBadge } from '../components/ui'
import { fmtKm } from '../utils/helpers'

export default function DispatchPage() {
  const [selected, setSelected] = useState(new Set())
  const [result, setResult] = useState(null)
  const [optimMode, setOptimMode] = useState('distance')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['dispatchable-orders'],
    queryFn: () =>
      api.get('/orders/', { params: { page: 1, page_size: 50, status: 'confirmed' } })
        .then(r => r.data),
  })

  // Shown when the API is unreachable so the screen is still explorable
  const DEMO_ORDERS = [
    { id: '101', order_number: 'ORD-9421', customer_name: 'Acme Retail Corp', delivery_city: 'Delhi', delivery_address: 'Terminal 4 Industrial', weight_kg: 14200 },
    { id: '103', order_number: 'ORD-9423', customer_name: 'Metro Express Inc', delivery_city: 'Hyderabad', delivery_address: 'Warehouse Hub 3', weight_kg: 19800 },
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

  // A GET that could not reach the API resolves to {}, so fall back to demo
  // rows only when the API is actually unreachable.
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
          <h2 className="page-title">Dispatch Control & VRP Route Solver</h2>
          <p className="text-xs text-muted mt-0.5">Select pending orders and trigger algorithmic driver assignment</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select
            className="select text-xs h-9 w-36 bg-app-surface border-app-border"
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
                Optimizing…
              </span>
            ) : (
              <><Zap size={15} /> Run Optimizer ({selected.size})</>
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
                Confirmed Orders Ready for Dispatch ({orderItems.length})
              </span>
              {isDemoData && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted border border-app-border rounded-full px-2 py-0.5">
                  Demo data
                </span>
              )}
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
              description="Orders move here once they are confirmed and ready for driver assignment."
            />
          ) : (
            <div className="divide-y divide-app-border max-h-[520px] overflow-y-auto">
              {orderItems.map(order => {
                const checked = selected.has(order.id)
                return (
                  <div
                    key={order.id}
                    onClick={() => toggle(order.id)}
                    className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                      checked ? 'bg-primary-soft/40' : 'hover:bg-app-panel'
                    }`}
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
                        <span className="text-xs font-semibold text-heading truncate">{order.customer_name}</span>
                      </div>
                      <p className="text-xs text-muted truncate flex items-center gap-1">
                        <MapPin size={13} className="flex-shrink-0 text-accent" />
                        {order.delivery_address}, {order.delivery_city}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0 text-xs font-mono font-medium text-heading">
                      {order.weight_kg ? `${order.weight_kg.toLocaleString()} kg` : 'Standard'}
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
            <h3 className="text-sm font-bold text-heading">VRP Optimization Summary</h3>
            <p className="text-xs text-muted">Solvers: Google OR-Tools / Pandas</p>
          </div>

          {!result ? (
            <div className="text-center py-12 text-muted text-xs space-y-2">
              <Zap size={28} className="mx-auto text-primary opacity-40" />
              <p>Select orders and click "Run Optimizer" to calculate vehicle routes</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-app-panel rounded-xl p-3 border border-app-border">
                  <p className="text-[11px] text-muted font-semibold uppercase">Execution</p>
                  <p className="text-sm font-extrabold text-heading font-mono">{(result.optimization_time_ms ?? 0).toFixed(0)} ms</p>
                </div>
                <div className="bg-app-panel rounded-xl p-3 border border-app-border">
                  <p className="text-[11px] text-muted font-semibold uppercase">Total Dist</p>
                  <p className="text-sm font-extrabold text-heading font-mono">
                    {fmtKm((result.assignments || []).reduce((sum, a) => sum + (a.estimated_distance_km || 0), 0))}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-bold text-heading uppercase tracking-wider">Driver Assignments</p>
                {(result.assignments || []).map((a) => {
                  const driver = driverMap[a.driver_id]
                  const orderIds = a.assigned_order_ids || []
                  return (
                    <div key={a.driver_id} className="p-3 bg-app-panel rounded-xl border border-app-border space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-heading flex items-center gap-1.5">
                          <User size={14} className="text-primary" />
                          {a.driver_name || driver?.full_name || 'Driver'}
                        </span>
                        <span className="text-[10px] bg-primary-soft text-primary px-2 py-0.5 rounded-full font-bold border border-primary/25">
                          {orderIds.length} orders
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-muted break-all">
                        {orderIds.join(', ') || 'No orders'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
