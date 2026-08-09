import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Wrench, Fuel, DollarSign, Gauge, Plus, Filter, Trash2, Calendar
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../utils/api'
import { EmptyState, FormField, Modal, SectionHeader, Spinner } from '../components/ui'

const MAINTENANCE_TYPES = [
  { value: 'fuel', label: 'Fuel', icon: Fuel, color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  { value: 'oil_change', label: 'Oil Change', icon: Wrench, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  { value: 'tire_rotation', label: 'Tire Rotation', icon: Wrench, color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { value: 'repair', label: 'Repair', icon: Wrench, color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  { value: 'inspection', label: 'Inspection', icon: Wrench, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: 'scheduled_service', label: 'Scheduled Service', icon: Wrench, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
]

function getTypeBadge(typeValue) {
  const item = MAINTENANCE_TYPES.find(t => t.value === typeValue)
  if (!item) return <span className="text-muted">{typeValue}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${item.color}`}>
      {item.label}
    </span>
  )
}

function AddLogModal({ vehicles, onClose }) {
  const queryClient = useQueryClient()
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '')
  const [type, setType] = useState('fuel')
  const [cost, setCost] = useState('')
  const [odometer, setOdometer] = useState('')
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [notes, setNotes] = useState('')

  const createLog = useMutation({
    mutationFn: payload => api.post('/maintenance/', payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] })
      toast.success('Maintenance log added successfully')
      onClose()
    },
    onError: err => {
      toast.error(err.response?.data?.detail || 'Failed to add log')
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!vehicleId) {
      toast.error('Please select a vehicle')
      return
    }
    if (!cost || isNaN(Number(cost)) || Number(cost) < 0) {
      toast.error('Please enter a valid cost')
      return
    }
    if (!odometer || isNaN(Number(odometer)) || Number(odometer) < 0) {
      toast.error('Please enter a valid odometer reading')
      return
    }

    createLog.mutate({
      vehicle_id: vehicleId,
      type,
      cost: Number(cost),
      odometer: Number(odometer),
      date: new Date(date).toISOString(),
      notes: notes.trim() || null,
    })
  }

  return (
    <Modal title="Add Maintenance & Fuel Log" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Vehicle">
          <select
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value)}
            className="select w-full"
            required
          >
            <option value="" disabled>Select vehicle...</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.registration_number} ({v.make || ''} {v.model || v.vehicle_type})
              </option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Log Type">
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="select w-full"
            >
              {MAINTENANCE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Cost ($)">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="150.00"
              value={cost}
              onChange={e => setCost(e.target.value)}
              className="input w-full"
              required
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Odometer Reading (km)">
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="45000"
              value={odometer}
              onChange={e => setOdometer(e.target.value)}
              className="input w-full"
              required
            />
          </FormField>

          <FormField label="Date & Time">
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input w-full"
              required
            />
          </FormField>
        </div>

        <FormField label="Notes / Work Performed">
          <textarea
            rows={3}
            placeholder="Details about parts replaced, fuel quantity, vendor..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="input w-full py-2 resize-none"
          />
        </FormField>

        <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={createLog.isPending} className="btn-primary">
            {createLog.isPending ? <Spinner size="sm" /> : 'Save Log'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function MaintenancePage() {
  const queryClient = useQueryClient()
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  // Fetch vehicles for filter & form
  const vehiclesQuery = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get('/vehicles/').then(r => r.data?.items || r.data || []),
  })

  // Fetch logs with filters
  const logsQuery = useQuery({
    queryKey: ['maintenance-logs', selectedVehicleId, selectedType],
    queryFn: () => {
      const params = {}
      if (selectedVehicleId) params.vehicle_id = selectedVehicleId
      if (selectedType) params.type = selectedType
      return api.get('/maintenance/', { params }).then(r => r.data)
    },
  })

  const deleteLog = useMutation({
    mutationFn: logId => api.delete(`/maintenance/${logId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] })
      toast.success('Log entry deleted')
    },
    onError: () => toast.error('Failed to delete log'),
  })

  const vehicles = vehiclesQuery.data || []
  const logs = logsQuery.data || []

  // KPI Calculations
  const stats = useMemo(() => {
    let totalCost = 0
    let fuelCost = 0
    let maintCost = 0
    logs.forEach(l => {
      totalCost += l.cost || 0
      if (l.type === 'fuel') fuelCost += l.cost || 0
      else maintCost += l.cost || 0
    })
    return {
      totalCost,
      fuelCost,
      maintCost,
      count: logs.length,
    }
  }, [logs])

  return (
    <div className="p-6 space-y-6">
      <SectionHeader
        title="Fuel & Maintenance Logs"
        subtitle="Track vehicle service history, repair costs, and fuel consumption."
        action={
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Log
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-app-panel border border-app-border">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Expense</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-heading">${stats.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>

        <div className="p-4 rounded-xl bg-app-panel border border-app-border">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Fuel Spend</span>
            <Fuel className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-heading">${stats.fuelCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>

        <div className="p-4 rounded-xl bg-app-panel border border-app-border">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Maintenance Spend</span>
            <Wrench className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-heading">${stats.maintCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>

        <div className="p-4 rounded-xl bg-app-panel border border-app-border">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Logged Events</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-heading">{stats.count}</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-app-panel border border-app-border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-muted text-sm font-medium">
            <Filter className="w-4 h-4" /> Filters:
          </div>
          <select
            value={selectedVehicleId}
            onChange={e => setSelectedVehicleId(e.target.value)}
            className="select text-sm py-1.5"
          >
            <option value="">All Vehicles</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.registration_number}
              </option>
            ))}
          </select>

          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="select text-sm py-1.5"
          >
            <option value="">All Types</option>
            {MAINTENANCE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {(selectedVehicleId || selectedType) && (
            <button
              onClick={() => { setSelectedVehicleId(''); setSelectedType('') }}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table / Empty State */}
      {logsQuery.isLoading ? (
        <div className="p-12 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No maintenance logs found"
          description="Record fuel purchases, routine oil changes, or repairs to track vehicle operating costs."
          action={
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add First Log
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-app-border bg-app-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-app-surface text-muted uppercase text-xs border-b border-app-border">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date & Time</th>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Log Type</th>
                  <th className="px-4 py-3 font-semibold">Odometer</th>
                  <th className="px-4 py-3 font-semibold">Cost</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-app-surface/50 transition-colors">
                    <td className="px-4 py-3 text-heading whitespace-nowrap">
                      {format(new Date(log.date), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-3 font-medium text-heading whitespace-nowrap">
                      {log.vehicle_registration || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getTypeBadge(log.type)}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="w-3.5 h-3.5 text-muted" />
                        {log.odometer?.toLocaleString()} km
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-heading whitespace-nowrap">
                      ${log.cost?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs truncate">
                      {log.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          if (confirm('Delete this maintenance log entry?')) {
                            deleteLog.mutate(log.id)
                          }
                        }}
                        className="p-1 text-muted hover:text-rose-400 transition-colors"
                        title="Delete log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <AddLogModal
          vehicles={vehicles}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}
    </div>
  )
}
