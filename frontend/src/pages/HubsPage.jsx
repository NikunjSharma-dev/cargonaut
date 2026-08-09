import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Warehouse, MapPin, Building2, ShieldCheck, Plane, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { PageLoader, EmptyState, Modal, FormField } from '../components/ui'
import clsx from 'clsx'

function CreateHubModal({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    hub_type: 'warehouse',
    address: '',
    city: '',
    state: '',
    country: 'India',
    latitude: '19.0760',
    longitude: '72.8777',
    geofence_radius_meters: 500,
    iata_code: 'BOM',
    handles_air_cargo: false,
  })

  const create = useMutation({
    mutationFn: data => api.post('/hubs/', data),
    onSuccess: (res) => {
      qc.invalidateQueries(['hubs'])
      toast.success(`Hub ${res.data.name} created!`)
      onClose()
    },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to create hub'),
  })

  function set(k) {
    return e => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm(f => ({ ...f, [k]: val }))
    }
  }

  function handleTypeChange(e) {
    const type = e.target.value
    const isAirTerminal = type === 'air_cargo_terminal'
    setForm(f => ({
      ...f,
      hub_type: type,
      handles_air_cargo: isAirTerminal ? true : f.handles_air_cargo,
      iata_code: isAirTerminal ? 'BOM' : '',
    }))
  }

  function submit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      geofence_radius_meters: Number(form.geofence_radius_meters),
      iata_code: form.hub_type === 'air_cargo_terminal' || form.iata_code ? form.iata_code.toUpperCase() : undefined,
    }
    create.mutate(payload)
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Logistics Hub / Air Terminal">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <FormField label="Hub Facility Name" required>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Mumbai Air Cargo Terminal / North Depot" required />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Facility Type">
            <select className="select capitalize font-semibold" value={form.hub_type} onChange={handleTypeChange}>
              {['warehouse', 'distribution_center', 'pickup_point', 'cross_dock', 'air_cargo_terminal'].map(t => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </FormField>
          <FormField label="City" required>
            <input className="input" value={form.city} onChange={set('city')} placeholder="Mumbai" required />
          </FormField>
        </div>

        {form.hub_type === 'air_cargo_terminal' && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
            <FormField label="IATA Airport Code (3-letter)" required>
              <input
                className="input uppercase font-mono font-bold"
                value={form.iata_code}
                onChange={set('iata_code')}
                placeholder="BOM / DEL / BLR"
                maxLength={3}
                required
              />
            </FormField>
            <div className="flex flex-col justify-center">
              <p className="text-[11px] font-bold text-purple-800 flex items-center gap-1">
                <Plane size={14} /> Air Cargo Capable
              </p>
              <p className="text-[10px] text-muted">Handles freighter load build-up & ULD pallets</p>
            </div>
          </div>
        )}

        <FormField label="Full Terminal Address" required>
          <input className="input" value={form.address} onChange={set('address')} placeholder="Sahar Cargo Complex, CSMIA Airport" required />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Latitude" required>
            <input className="input font-mono" type="number" step="any" value={form.latitude} onChange={set('latitude')} required />
          </FormField>
          <FormField label="Longitude" required>
            <input className="input font-mono" type="number" step="any" value={form.longitude} onChange={set('longitude')} required />
          </FormField>
          <FormField label="Geofence Radius (m)">
            <input className="input" type="number" value={form.geofence_radius_meters} onChange={set('geofence_radius_meters')} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-app-border">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary text-xs" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create Hub'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function HubsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [airOnlyFilter, setAirOnlyFilter] = useState(false)

  const { data: hubs, isLoading } = useQuery({
    queryKey: ['hubs', airOnlyFilter],
    queryFn: () => {
      const query = airOnlyFilter ? '?handles_air_cargo=true' : ''
      return api.get(`/hubs/${query}`).then(r => r.data)
    },
  })

  const DEMO_HUBS = [
    {
      id: 'h1', name: 'North Hub Depot', hub_type: 'warehouse',
      address: 'Industrial Zone Gate #3', city: 'Mumbai', latitude: 19.0760, longitude: 72.8777,
      geofence_radius_meters: 500, handles_air_cargo: false,
    },
    {
      id: 'h4', name: 'Mumbai Air Cargo Terminal', hub_type: 'air_cargo_terminal',
      address: 'Sahar Cargo Complex, CSMIA', city: 'Mumbai', latitude: 19.0896, longitude: 72.8656,
      geofence_radius_meters: 800, iata_code: 'BOM', handles_air_cargo: true,
    },
    {
      id: 'h5', name: 'Delhi Air Freight Station', hub_type: 'air_cargo_terminal',
      address: 'Cargo Terminal 2, IGI Airport', city: 'Delhi', latitude: 28.5562, longitude: 77.1000,
      geofence_radius_meters: 800, iata_code: 'DEL', handles_air_cargo: true,
    },
  ]

  const hubsList = hubs || DEMO_HUBS

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Depot Nodes & Air Cargo Terminals</h2>
          <p className="text-xs text-muted mt-0.5">Manage {hubsList.length} active logistics nodes, IATA airport stations & geofences</p>
        </div>

        <button className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Create Hub
        </button>
      </div>

      {/* Filter Options */}
      <div className="flex items-center gap-2 p-1.5 bg-app-surface border border-app-border rounded-2xl w-max">
        <button
          onClick={() => setAirOnlyFilter(false)}
          className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all', !airOnlyFilter ? 'bg-primary-soft text-primary font-bold border border-primary/25' : 'text-body hover:bg-app-panel')}
        >
          All Facilities
        </button>
        <button
          onClick={() => setAirOnlyFilter(true)}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all', airOnlyFilter ? 'bg-purple-50 text-purple-700 font-bold border border-purple-200' : 'text-body hover:bg-app-panel')}
        >
          <Plane size={14} /> Air Cargo Terminals Only
        </button>
      </div>

      {!hubsList.length ? (
        <EmptyState
          icon={Warehouse}
          title="No warehouse hubs registered"
          description="Create your first distribution center or airport terminal"
          action={
            <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create Hub
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {hubsList.map(hub => {
            const isAirTerminal = hub.hub_type === 'air_cargo_terminal' || hub.handles_air_cargo
            return (
              <div key={hub.id} className="card hover:border-primary/30 transition-all shadow-card flex flex-col justify-between space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-10 h-10 rounded-xl font-bold flex items-center justify-center border shadow-2xs',
                      isAirTerminal ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-primary-soft text-primary border-primary/25'
                    )}>
                      {isAirTerminal ? <Plane size={20} /> : <Warehouse size={20} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-heading font-display flex items-center gap-1.5">
                        {hub.name}
                        {hub.iata_code && (
                          <span className="text-xs font-mono font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded border border-purple-300">
                            {hub.iata_code}
                          </span>
                        )}
                      </h4>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted bg-app-hover px-2 py-0.5 rounded-full border border-app-border">
                        {hub.hub_type?.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-body pt-3 border-t border-app-border">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-accent flex-shrink-0 mt-0.5" />
                    <span className="font-medium">{hub.address}, {hub.city}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 text-[11px]">
                    <span className="text-muted font-mono">{hub.latitude?.toFixed(4)}, {hub.longitude?.toFixed(4)}</span>
                    <span className="bg-primary-soft text-primary font-bold px-2 py-0.5 rounded-full border border-primary/25">
                      {hub.geofence_radius_meters}m geofence
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateHubModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
