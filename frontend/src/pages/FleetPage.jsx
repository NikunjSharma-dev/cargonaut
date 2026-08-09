import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Truck, Filter, ShieldCheck, Wrench, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { PageLoader, EmptyState, Modal, FormField, SectionHeader, StatusBadge } from '../components/ui'
import { fmtDate, fmtKm } from '../utils/helpers'

function CreateVehicleModal({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    registration_number: '', make: '', model: '', year: 2026,
    vehicle_type: 'truck', fuel_type: 'diesel', payload_capacity_kg: 18000,
  })

  const create = useMutation({
    mutationFn: data => api.post('/vehicles/', data),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); toast.success('Vehicle added to fleet!'); onClose() },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to add vehicle'),
  })

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function submit(e) {
    e.preventDefault()
    create.mutate({
      ...form,
      year: Number(form.year),
      payload_capacity_kg: Number(form.payload_capacity_kg),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Register Fleet Asset Vehicle">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <FormField label="Registration Plate Number" required>
          <input className="input uppercase font-mono font-bold" value={form.registration_number} onChange={set('registration_number')} placeholder="MH-12-FF-802" required />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Make / Manufacturer">
            <input className="input" value={form.make} onChange={set('make')} placeholder="Volvo / Tata" />
          </FormField>
          <FormField label="Model">
            <input className="input" value={form.model} onChange={set('model')} placeholder="FH16 / Signa" />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Body Type">
            <select className="select capitalize" value={form.vehicle_type} onChange={set('vehicle_type')}>
              {['truck', 'van', 'bike', 'car', 'motorcycle'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Fuel Type">
            <select className="select capitalize" value={form.fuel_type} onChange={set('fuel_type')}>
              {['diesel', 'electric', 'petrol', 'cng', 'hybrid'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Capacity (kg)" required>
            <input className="input" type="number" value={form.payload_capacity_kg} onChange={set('payload_capacity_kg')} required />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-app-border">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary text-xs" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Register Vehicle'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function FleetPage() {
  const [showCreate, setShowCreate] = useState(false)

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get('/vehicles/').then(r => r.data),
  })

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Fleet Vehicles & Assets</h2>
          <p className="text-xs text-muted mt-0.5">Manage {vehicles?.length ?? 28} registered transport units & health</p>
        </div>

        <button className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Register Vehicle
        </button>
      </div>

      {!vehicles?.length ? (
        <EmptyState
          icon={Truck}
          title="No vehicles in fleet registry"
          description="Register transport trucks, vans, or trailers to track capacity"
          action={
            <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Add Vehicle
            </button>
          }
        />
      ) : (
        <div className="card p-0 overflow-hidden border-app-border shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left border-collapse">
              <thead>
                <tr>
                  {['Registration', 'Make & Model', 'Body Type', 'Fuel', 'Payload Capacity', 'Odometer', 'Status', 'Registered Date'].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {vehicles.map(v => (
                  <tr key={v.id} className="table-row hover:bg-app-panel/80 transition-colors">
                    <td className="table-cell font-mono text-xs font-bold text-primary">{v.registration_number}</td>
                    <td className="table-cell">
                      <p className="text-heading text-xs font-semibold">{v.make} {v.model}</p>
                      <p className="text-muted text-[10px]">{v.year || '2026 Model'}</p>
                    </td>
                    <td className="table-cell capitalize text-xs text-body">{v.vehicle_type}</td>
                    <td className="table-cell capitalize text-xs text-body">{v.fuel_type}</td>
                    <td className="table-cell text-xs font-medium text-heading">{v.payload_capacity_kg?.toLocaleString()} kg</td>
                    <td className="table-cell text-xs font-mono text-muted">{fmtKm(v.odometer_km)}</td>
                    <td className="table-cell">
                      <StatusBadge status={v.status || 'on_route'} />
                    </td>
                    <td className="table-cell text-xs text-muted font-mono">{fmtDate(v.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateVehicleModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
