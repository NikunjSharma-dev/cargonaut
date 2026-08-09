import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Search, Filter, Plus, ArrowUpDown, ChevronDown,
  MoreVertical, MapPin, Eye, Edit3, Trash2, Send, Download,
  CheckCircle2, AlertCircle, Sparkles
} from 'lucide-react'
import api from '../utils/api'
import { StatusBadge, PriorityBadge, PageLoader, Modal, EmptyState } from '../components/ui'
import { fmtCurrency, fmtDateTime } from '../utils/helpers'
import clsx from 'clsx'

export default function OrdersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [actionMenuOpen, setActionMenuOpen] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter, search, sortField, sortDir],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)
      return api.get(`/orders/?${params.toString()}`).then(r => r.data)
    },
  })

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const ordersList = data?.items || [
    {
      id: '101',
      order_number: 'ORD-9421',
      customer_name: 'Acme Retail Corp',
      pickup_city: 'Mumbai',
      delivery_city: 'Delhi Gateway Hub',
      delivery_address: 'Terminal 4 Industrial Belt',
      status: 'in_transit',
      priority: 2,
      cargo_weight_kg: 14200,
      price: 48500,
      created_at: '2026-08-09T04:20:00Z',
    },
    {
      id: '102',
      order_number: 'ORD-9422',
      customer_name: 'Global Trade Ltd',
      pickup_city: 'Bangalore',
      delivery_city: 'Chennai Port Depot',
      delivery_address: 'Dockyard Station #12',
      status: 'delivered',
      priority: 1,
      cargo_weight_kg: 8500,
      price: 26000,
      created_at: '2026-08-08T18:30:00Z',
    },
    {
      id: '103',
      order_number: 'ORD-9423',
      customer_name: 'Metro Express Inc',
      pickup_city: 'Pune',
      delivery_city: 'Hyderabad Tech Zone',
      delivery_address: 'Warehouse Hub 3',
      status: 'dispatched',
      priority: 3,
      cargo_weight_kg: 19800,
      price: 62000,
      created_at: '2026-08-09T02:15:00Z',
    },
    {
      id: '104',
      order_number: 'ORD-9424',
      customer_name: 'Zenith Logistics',
      pickup_city: 'Ahmedabad',
      delivery_city: 'Jaipur Logistics Hub',
      delivery_address: 'Express Freight Terminal',
      status: 'waiting',
      priority: 1,
      cargo_weight_kg: 5400,
      price: 18500,
      created_at: '2026-08-09T01:10:00Z',
    },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Orders & Freight Requests</h2>
          <p className="text-xs text-muted mt-0.5">Manage customer shipments, SLAs, and routing dispatches</p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs self-start sm:self-auto"
        >
          <Plus size={16} /> Create Order
        </button>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-app-surface border border-app-border rounded-2xl p-4 shadow-xs">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { key: '', label: 'All Orders' },
            { key: 'in_transit', label: 'In Transit' },
            { key: 'dispatched', label: 'Dispatched' },
            { key: 'delivered', label: 'Delivered' },
            { key: 'waiting', label: 'Waiting' },
            { key: 'failed', label: 'Exceptions' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                statusFilter === tab.key
                  ? 'bg-primary-soft text-primary font-bold border border-primary/25'
                  : 'text-body hover:bg-app-panel'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Search Input */}
        <div className="relative w-full md:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 h-9 text-xs bg-app-panel border-app-border focus:bg-app-surface"
            placeholder="Search order #, customer, city..."
          />
        </div>
      </div>

      {/* Main Data Table Container (Reference Specifications) */}
      <div className="card p-0 overflow-hidden shadow-card border-app-border">
        {isLoading ? (
          <PageLoader />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th
                    onClick={() => handleSort('order_number')}
                    className="table-header cursor-pointer hover:bg-app-hover transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Order #</span>
                      <ArrowUpDown size={12} className="text-subtle" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('customer_name')}
                    className="table-header cursor-pointer hover:bg-app-hover transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Customer</span>
                      <ArrowUpDown size={12} className="text-subtle" />
                    </div>
                  </th>
                  <th className="table-header">
                    Destination Hub
                  </th>
                  <th className="table-header">Priority</th>
                  <th className="table-header">Weight & Value</th>
                  <th className="table-header">Status</th>
                  <th
                    onClick={() => handleSort('created_at')}
                    className="table-header cursor-pointer hover:bg-app-hover transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Created Date</span>
                      <ArrowUpDown size={12} className="text-subtle" />
                    </div>
                  </th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {ordersList.map(order => (
                  <tr key={order.id} className="table-row hover:bg-app-panel/80 transition-colors">
                    {/* Order ID */}
                    <td className="table-cell font-mono text-xs font-bold text-primary">
                      {order.order_number}
                    </td>

                    {/* Customer */}
                    <td className="table-cell font-medium text-heading text-xs">
                      {order.customer_name}
                    </td>

                    {/* Destination (Location Icon + Place Name) */}
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-body font-medium">
                        <MapPin size={14} className="text-accent flex-shrink-0" />
                        <span>{order.delivery_city}</span>
                      </div>
                      <p className="text-[10px] text-muted pl-5 truncate max-w-[160px]">
                        {order.delivery_address}
                      </p>
                    </td>

                    {/* Priority */}
                    <td className="table-cell">
                      <PriorityBadge priority={order.priority} />
                    </td>

                    {/* Weight & Value */}
                    <td className="table-cell text-xs">
                      <p className="font-semibold text-heading">{fmtCurrency(order.price)}</p>
                      <p className="text-[11px] text-muted">{order.cargo_weight_kg ? `${order.cargo_weight_kg.toLocaleString()} kg` : 'Standard Cargo'}</p>
                    </td>

                    {/* Status Pill Badge (Semantic Status Colors) */}
                    <td className="table-cell">
                      <StatusBadge status={order.status} />
                    </td>

                    {/* Created Date */}
                    <td className="table-cell text-xs text-muted text-right font-mono">
                      {fmtDateTime(order.created_at)}
                    </td>

                    {/* Row Level Overflow Menu (⋮) */}
                    <td className="table-cell text-right">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => setActionMenuOpen(actionMenuOpen === order.id ? null : order.id)}
                          className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-app-hover transition-colors"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Action Popover Menu */}
                        {actionMenuOpen === order.id && (
                          <div className="absolute right-0 mt-1 w-44 bg-app-surface border border-app-border rounded-xl shadow-floating z-30 p-1 text-xs text-body space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              onClick={() => { setSelectedOrder(order); setActionMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-app-hover font-medium text-left"
                            >
                              <Eye size={14} className="text-primary" /> View Details
                            </button>
                            <button
                              onClick={() => setActionMenuOpen(null)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-app-hover font-medium text-left"
                            >
                              <Download size={14} className="text-muted" /> Print Waybill
                            </button>
                            <button
                              onClick={() => setActionMenuOpen(null)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-app-hover font-medium text-left"
                            >
                              <Send size={14} className="text-emerald-600" /> Assign Carrier
                            </button>
                            <div className="border-t border-app-border my-1" />
                            <button
                              onClick={() => setActionMenuOpen(null)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 text-danger font-medium text-left"
                            >
                              <Trash2 size={14} /> Cancel Order
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      <Modal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={`Order Details — ${selectedOrder?.order_number}`}
      >
        {selectedOrder && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-app-panel border border-app-border rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted uppercase font-bold">Status</p>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted uppercase font-bold">Value</p>
                <p className="text-base font-extrabold text-heading">{fmtCurrency(selectedOrder.price)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-heading text-xs">Shipping Information</h4>
              <div className="grid grid-cols-2 gap-2 text-body">
                <div><span className="text-muted">Customer:</span> {selectedOrder.customer_name}</div>
                <div><span className="text-muted">Origin:</span> {selectedOrder.pickup_city}</div>
                <div><span className="text-muted">Destination:</span> {selectedOrder.delivery_city}</div>
                <div><span className="text-muted">Cargo Weight:</span> {selectedOrder.cargo_weight_kg} kg</div>
              </div>
            </div>

            <div className="pt-3 border-t border-app-border flex justify-end gap-2">
              <button
                onClick={() => setSelectedOrder(null)}
                className="btn-secondary text-xs"
              >
                Close
              </button>
              <button className="btn-primary text-xs">
                Dispatch Order
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
