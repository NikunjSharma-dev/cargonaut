import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Search, Filter, Plus, ArrowUpDown, ChevronDown,
  MoreVertical, MapPin, Eye, Edit3, Trash2, Send, Download,
  CheckCircle2, AlertCircle, Sparkles, Plane, Truck, Boxes,
  FileText, ShieldAlert, Scale, Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { StatusBadge, PriorityBadge, PageLoader, Modal, EmptyState, CargoBadge, TransportModeBadge, FormField } from '../components/ui'
import { fmtCurrency, fmtDateTime } from '../utils/helpers'
import {
  CARGO_LIST, CARGO_TYPES, TRANSPORT_MODES, cargoMeta, modeMeta,
  chargeableWeightKg, isVolumetric, incompatibilityReason, cargoTypesForMode
} from '../utils/cargo'
import clsx from 'clsx'

function CreateOrderModal({ open, onClose }) {
  const qc = useQueryClient()
  const [transportMode, setTransportMode] = useState('road')
  const [cargoType, setCargoType] = useState('general')
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    delivery_city: '',
    delivery_address: '',
    weight_kg: '1500',
    volume_m3: '8.5',
    pieces: '10',
    priority: 1,
    declared_value: '25000',
    delivery_fee: '1200',
    flight_number: 'CG412',
    hazmat_un_code: '',
    description: '',
  })

  const { data: hubs } = useQuery({
    queryKey: ['hubs'],
    queryFn: () => api.get('/hubs/').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/orders/', payload),
    onSuccess: (res) => {
      qc.invalidateQueries(['orders'])
      toast.success(`Order ${res.data.order_number} created successfully!`)
      onClose()
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Failed to create order')
    },
  })

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const computedChargeable = chargeableWeightKg(
    form.weight_kg ? Number(form.weight_kg) : null,
    form.volume_m3 ? Number(form.volume_m3) : null,
    transportMode
  )

  const volDiscount = isVolumetric(
    form.weight_kg ? Number(form.weight_kg) : null,
    form.volume_m3 ? Number(form.volume_m3) : null,
    transportMode
  )

  const incompatibility = incompatibilityReason(cargoType, transportMode)

  function handleSubmit(e) {
    e.preventDefault()
    if (incompatibility) {
      toast.error(incompatibility)
      return
    }

    const payload = {
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || undefined,
      customer_email: form.customer_email || undefined,
      delivery_city: form.delivery_city,
      delivery_address: form.delivery_address,
      transport_mode: transportMode,
      cargo_type: cargoType,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
      volume_m3: form.volume_m3 ? Number(form.volume_m3) : undefined,
      pieces: form.pieces ? Number(form.pieces) : undefined,
      priority: Number(form.priority),
      declared_value: form.declared_value ? Number(form.declared_value) : undefined,
      delivery_fee: form.delivery_fee ? Number(form.delivery_fee) : undefined,
      description: form.description || undefined,
      flight_number: transportMode === 'air' ? form.flight_number : undefined,
      hazmat_un_code: cargoType === 'hazmat' ? form.hazmat_un_code : undefined,
    }

    createMutation.mutate(payload)
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Cargo Shipment Order" width="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Mode & Cargo Selector Tabs */}
        <div className="grid grid-cols-2 gap-3 p-1.5 bg-app-panel border border-app-border rounded-xl">
          <button
            type="button"
            onClick={() => {
              setTransportMode('road')
              if (!cargoTypesForMode('road').some(c => c.key === cargoType)) {
                setCargoType('general')
              }
            }}
            className={clsx(
              'flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold transition-all',
              transportMode === 'road'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs'
                : 'text-muted hover:text-heading'
            )}
          >
            <Truck size={16} /> Road Freight
          </button>
          <button
            type="button"
            onClick={() => {
              setTransportMode('air')
              if (!cargoTypesForMode('air').some(c => c.key === cargoType)) {
                setCargoType('general')
              }
            }}
            className={clsx(
              'flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold transition-all',
              transportMode === 'air'
                ? 'bg-purple-50 text-purple-700 border border-purple-300 shadow-xs'
                : 'text-muted hover:text-heading'
            )}
          >
            <Plane size={16} /> Air Cargo (Freighter)
          </button>
        </div>

        {/* Cargo Type Grid */}
        <FormField label="Select Cargo Handling Type" required>
          <div className="grid grid-cols-3 gap-2">
            {CARGO_LIST.map((c) => {
              const Icon = c.icon
              const disabled = transportMode === 'air' && !c.airAllowed
              const isSelected = cargoType === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCargoType(c.key)}
                  className={clsx(
                    'flex items-center gap-2 p-2 rounded-xl border text-left transition-all',
                    disabled && 'opacity-40 cursor-not-allowed bg-app-panel border-app-border',
                    !disabled && isSelected && 'border-primary bg-primary-soft text-primary font-bold shadow-xs',
                    !disabled && !isSelected && 'border-app-border hover:bg-app-hover text-body font-medium'
                  )}
                >
                  <Icon size={16} className={isSelected ? 'text-primary' : 'text-subtle'} />
                  <div className="truncate">
                    <p className="text-xs truncate">{c.label}</p>
                    {disabled && <p className="text-[9px] text-danger">Road Only</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </FormField>

        {incompatibility && (
          <div className="p-2.5 bg-red-50 text-danger border border-red-200 rounded-xl text-xs flex items-center gap-2">
            <ShieldAlert size={16} className="flex-shrink-0" />
            <span>{incompatibility}</span>
          </div>
        )}

        {/* Customer & Address Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Customer Name" required>
            <input className="input" value={form.customer_name} onChange={set('customer_name')} placeholder="Acme Logistics Corp" required />
          </FormField>
          <FormField label="Delivery City" required>
            <input className="input" value={form.delivery_city} onChange={set('delivery_city')} placeholder="Delhi / Mumbai / Bangalore" required />
          </FormField>
        </div>

        <FormField label="Full Delivery Address" required>
          <input className="input" value={form.delivery_address} onChange={set('delivery_address')} placeholder="Terminal 4, Sahar Cargo Complex" required />
        </FormField>

        {/* Weight, Volume, Chargeable calculation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-app-panel rounded-xl border border-app-border">
          <FormField label="Actual Weight (kg)" required>
            <input className="input font-mono" type="number" step="any" value={form.weight_kg} onChange={set('weight_kg')} required />
          </FormField>
          <FormField label="Volume (m³)">
            <input className="input font-mono" type="number" step="any" value={form.volume_m3} onChange={set('volume_m3')} placeholder="e.g. 12.5" />
          </FormField>
          <div className="flex flex-col justify-center">
            <p className="text-[11px] font-semibold text-muted uppercase">Billable Weight</p>
            <p className="text-sm font-extrabold text-heading font-mono mt-0.5">
              {computedChargeable ? `${computedChargeable.toLocaleString()} kg` : '—'}
            </p>
            {volDiscount && (
              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 w-max mt-1">
                IATA 1:{modeMeta(transportMode).volumetricFactor} Volumetric Tariff
              </span>
            )}
          </div>
        </div>

        {/* Mode Specific Inputs (Air Flight # / Hazmat UN) */}
        {transportMode === 'air' && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/50 border border-purple-200 rounded-xl">
            <FormField label="Flight Number">
              <input className="input uppercase font-mono" value={form.flight_number} onChange={set('flight_number')} placeholder="CG412" />
            </FormField>
            <div className="flex flex-col justify-center">
              <p className="text-[11px] font-semibold text-purple-700">Air Waybill (AWB)</p>
              <p className="text-xs font-mono font-bold text-heading mt-0.5">Generated on Booking (731-XXXXX)</p>
            </div>
          </div>
        )}

        {cargoType === 'hazmat' && (
          <FormField label="HAZMAT UN Code (Required for Hazardous Freight)" required>
            <input className="input font-mono uppercase" value={form.hazmat_un_code} onChange={set('hazmat_un_code')} placeholder="e.g. UN1263 (Paints/Flammable)" required />
          </FormField>
        )}

        {/* Priority & Fee */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Priority Level">
            <select className="select font-semibold" value={form.priority} onChange={set('priority')}>
              <option value={1}>Standard SLA (Priority 1)</option>
              <option value={2}>High Priority (Priority 2)</option>
              <option value={3}>Express Urgent (Priority 3)</option>
            </select>
          </FormField>
          <FormField label="Declared Value ($)">
            <input className="input font-mono" type="number" value={form.declared_value} onChange={set('declared_value')} />
          </FormField>
          <FormField label="Freight Fee ($)">
            <input className="input font-mono" type="number" value={form.delivery_fee} onChange={set('delivery_fee')} />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-app-border">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary text-xs" disabled={createMutation.isPending || !!incompatibility}>
            {createMutation.isPending ? 'Processing...' : 'Confirm & Create Order'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function OrdersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [cargoFilter, setCargoFilter] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [actionMenuOpen, setActionMenuOpen] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter, modeFilter, cargoFilter, search, sortField, sortDir],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (modeFilter) params.set('transport_mode', modeFilter)
      if (cargoFilter) params.set('cargo_type', cargoFilter)
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

  const DEMO_ORDERS = [
    {
      id: '101',
      order_number: 'ORD-9421',
      customer_name: 'Acme Retail Corp',
      delivery_city: 'Delhi Gateway Hub',
      delivery_address: 'Terminal 4 Industrial Belt',
      transport_mode: 'road',
      cargo_type: 'general',
      status: 'in_transit',
      priority: 2,
      weight_kg: 14200,
      chargeable_weight_kg: 14200,
      delivery_fee: 4850,
      created_at: '2026-08-09T04:20:00Z',
    },
    {
      id: '105',
      order_number: 'ORD-9425',
      customer_name: 'Helios Pharma',
      delivery_city: 'Delhi',
      delivery_address: 'Cargo Terminal 2, IGI Airport',
      transport_mode: 'air',
      cargo_type: 'refrigerated',
      air_waybill_number: '731-40028115',
      flight_number: 'CG412',
      status: 'confirmed',
      priority: 3,
      weight_kg: 2400,
      volume_m3: 19.5,
      chargeable_weight_kg: 3256.5,
      delivery_fee: 14200,
      created_at: '2026-08-09T06:10:00Z',
    },
    {
      id: '106',
      order_number: 'ORD-9426',
      customer_name: 'Aurum Bullion Services',
      delivery_city: 'Mumbai',
      delivery_address: 'Sahar Cargo Complex, CSMIA',
      transport_mode: 'air',
      cargo_type: 'high_value',
      air_waybill_number: '731-40028116',
      flight_number: 'CG208',
      status: 'in_transit',
      priority: 3,
      weight_kg: 780,
      volume_m3: 1.2,
      chargeable_weight_kg: 780,
      delivery_fee: 28400,
      created_at: '2026-08-08T22:15:00Z',
    },
    {
      id: '107',
      order_number: 'ORD-9427',
      customer_name: 'Vector Industrial',
      delivery_city: 'Bengaluru',
      delivery_address: 'Cargo Village Gate 4, BLR',
      transport_mode: 'air',
      cargo_type: 'hazmat',
      air_waybill_number: '731-40028117',
      flight_number: 'CG377',
      hazmat_un_code: 'UN1263',
      status: 'confirmed',
      priority: 2,
      weight_kg: 1950,
      volume_m3: 14.0,
      chargeable_weight_kg: 2338,
      delivery_fee: 18900,
      created_at: '2026-08-09T01:30:00Z',
    },
  ]

  const ordersList = data?.items || DEMO_ORDERS

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Orders & Cargo Freight Requests</h2>
          <p className="text-xs text-muted mt-0.5">Manage multi-modal road & air freight orders, AWBs, and cargo taxonomy</p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs self-start sm:self-auto"
        >
          <Plus size={16} /> Create Order
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-app-surface border border-app-border rounded-2xl p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Selector Buttons */}
          <div className="flex items-center p-1 bg-app-panel rounded-xl border border-app-border">
            <button
              onClick={() => setModeFilter('')}
              className={clsx('px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', !modeFilter ? 'bg-app-surface text-primary shadow-2xs font-bold' : 'text-muted hover:text-body')}
            >
              All Modes
            </button>
            <button
              onClick={() => setModeFilter('road')}
              className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', modeFilter === 'road' ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200' : 'text-muted hover:text-body')}
            >
              <Truck size={12} /> Road
            </button>
            <button
              onClick={() => setModeFilter('air')}
              className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', modeFilter === 'air' ? 'bg-purple-50 text-purple-700 font-bold border border-purple-200' : 'text-muted hover:text-body')}
            >
              <Plane size={12} /> Air Cargo
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[
              { key: '', label: 'All Status' },
              { key: 'confirmed', label: 'Confirmed' },
              { key: 'in_transit', label: 'In Transit' },
              { key: 'delivered', label: 'Delivered' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={clsx(
                  'px-2.5 py-1 rounded-xl text-xs font-semibold transition-all',
                  statusFilter === tab.key
                    ? 'bg-primary-soft text-primary font-bold border border-primary/25'
                    : 'text-body hover:bg-app-panel'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Cargo Type Filter */}
          <select
            value={cargoFilter}
            onChange={e => setCargoFilter(e.target.value)}
            className="select text-xs h-8 w-36 bg-app-panel border-app-border"
          >
            <option value="">All Cargo Types</option>
            {CARGO_LIST.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 h-9 text-xs bg-app-panel border-app-border focus:bg-app-surface"
            placeholder="Search order #, AWB, customer, city..."
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="card p-0 overflow-hidden shadow-card border-app-border">
        {isLoading ? (
          <PageLoader />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="table-header">Mode</th>
                  <th onClick={() => handleSort('order_number')} className="table-header cursor-pointer hover:bg-app-hover">Order # / AWB</th>
                  <th onClick={() => handleSort('customer_name')} className="table-header cursor-pointer hover:bg-app-hover">Customer</th>
                  <th className="table-header">Cargo Type</th>
                  <th className="table-header">Destination</th>
                  <th className="table-header">Priority</th>
                  <th className="table-header">Billable Weight</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {ordersList.map(order => (
                  <tr key={order.id} className="table-row hover:bg-app-panel/80 transition-colors">
                    <td className="table-cell">
                      <TransportModeBadge mode={order.transport_mode || 'road'} />
                    </td>

                    <td className="table-cell font-mono text-xs">
                      <p className="font-bold text-primary">{order.order_number}</p>
                      {order.air_waybill_number && (
                        <p className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 inline-block mt-0.5">
                          AWB {order.air_waybill_number}
                        </p>
                      )}
                    </td>

                    <td className="table-cell font-medium text-heading text-xs">
                      {order.customer_name}
                      {order.flight_number && (
                        <span className="text-[10px] text-muted block font-mono">Flt {order.flight_number}</span>
                      )}
                    </td>

                    <td className="table-cell">
                      <CargoBadge type={order.cargo_type || 'general'} />
                      {order.hazmat_un_code && (
                        <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 px-1 rounded block mt-0.5 w-max font-mono">
                          {order.hazmat_un_code}
                        </span>
                      )}
                    </td>

                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-body font-medium">
                        <MapPin size={14} className="text-accent flex-shrink-0" />
                        <span>{order.delivery_city}</span>
                      </div>
                      <p className="text-[10px] text-muted pl-5 truncate max-w-[150px]">
                        {order.delivery_address}
                      </p>
                    </td>

                    <td className="table-cell">
                      <PriorityBadge priority={order.priority} />
                    </td>

                    <td className="table-cell text-xs">
                      <p className="font-semibold text-heading">
                        {(order.chargeable_weight_kg || order.weight_kg || 0).toLocaleString()} kg
                      </p>
                      <p className="text-[10px] text-muted">
                        {fmtCurrency(order.delivery_fee || order.price || 0)}
                      </p>
                    </td>

                    <td className="table-cell">
                      <StatusBadge status={order.status} />
                    </td>

                    <td className="table-cell text-right">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => setActionMenuOpen(actionMenuOpen === order.id ? null : order.id)}
                          className="p-1.5 rounded-lg text-subtle hover:text-body hover:bg-app-hover transition-colors"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {actionMenuOpen === order.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-app-surface border border-app-border rounded-xl shadow-floating z-30 p-1 text-xs text-body space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              onClick={() => { setSelectedOrder(order); setActionMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-app-hover font-medium text-left"
                            >
                              <Eye size={14} className="text-primary" /> View Cargo Manifest
                            </button>
                            {order.air_waybill_number && (
                              <button
                                onClick={() => { toast.success(`Printing IATA AWB ${order.air_waybill_number}`); setActionMenuOpen(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-app-hover font-medium text-left text-purple-700"
                              >
                                <FileText size={14} /> Print Air Waybill
                              </button>
                            )}
                            <button
                              onClick={() => setActionMenuOpen(null)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-app-hover font-medium text-left"
                            >
                              <Send size={14} className="text-emerald-600" /> Assign Carrier
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

      {/* Order Manifest Modal */}
      <Modal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={`Cargo Manifest — ${selectedOrder?.order_number}`}
      >
        {selectedOrder && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-app-panel border border-app-border rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted uppercase font-bold">Transport Mode</p>
                <TransportModeBadge mode={selectedOrder.transport_mode || 'road'} />
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted uppercase font-bold">Freight Fee</p>
                <p className="text-base font-extrabold text-heading">{fmtCurrency(selectedOrder.delivery_fee || selectedOrder.price || 0)}</p>
              </div>
            </div>

            <div className="space-y-2 border-t border-b border-app-border py-3">
              <h4 className="font-bold text-heading text-xs">Cargo & Paperwork Specifications</h4>
              <div className="grid grid-cols-2 gap-2 text-body">
                <div><span className="text-muted">Customer:</span> {selectedOrder.customer_name}</div>
                <div><span className="text-muted">Cargo Type:</span> <CargoBadge type={selectedOrder.cargo_type || 'general'} /></div>
                <div><span className="text-muted">Destination:</span> {selectedOrder.delivery_city}</div>
                <div><span className="text-muted">Billable Weight:</span> {(selectedOrder.chargeable_weight_kg || selectedOrder.weight_kg || 0).toLocaleString()} kg</div>
                {selectedOrder.air_waybill_number && (
                  <div className="col-span-2 p-2 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 font-mono font-bold flex justify-between">
                    <span>Air Waybill (AWB): {selectedOrder.air_waybill_number}</span>
                    {selectedOrder.flight_number && <span>Flight #{selectedOrder.flight_number}</span>}
                  </div>
                )}
                {selectedOrder.hazmat_un_code && (
                  <div className="col-span-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-800 font-mono font-bold">
                    HAZMAT Declaration: {selectedOrder.hazmat_un_code}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setSelectedOrder(null)} className="btn-secondary text-xs">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <CreateOrderModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </div>
  )
}
