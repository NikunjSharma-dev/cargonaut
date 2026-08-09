import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Truck, Plane, Filter, ShieldCheck, Wrench, CheckCircle2, AlertTriangle, Fuel, Gauge, Snowflake } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { PageLoader, EmptyState, Modal, FormField, SectionHeader, StatusBadge, TransportModeBadge } from '../components/ui'
import VehicleGraphic from '../components/VehicleGraphic'
import { fmtDate, fmtKm } from '../utils/helpers'
import { VEHICLE_TYPES_BY_MODE, FUEL_TYPES_BY_MODE, AIR_VEHICLE_TYPES, graphicVariant, modeForVehicleType } from '../utils/cargo'
import clsx from 'clsx'

function CreateVehicleModal({ open, onClose }) {
  const qc = useQueryClient()
  const [transportMode, setTransportMode] = useState('road')
  const [form, setForm] = useState({
    registration_number: '',
    make: '',
    model: '',
    year: 2026,
    vehicle_type: 'truck',
    fuel_type: 'diesel',
    payload_capacity_kg: 18000,
    volume_capacity_m3: 65,
    has_refrigeration: false,
    tail_number: 'VT-CGN',
    uld_positions: 37,
    range_km: 8150,
  })

  const create = useMutation({
    mutationFn: data => api.post('/vehicles/', data),
    onSuccess: (res) => {
      qc.invalidateQueries(['vehicles'])
      toast.success(`Asset ${res.data.registration_number} registered!`)
      onClose()
    },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to add vehicle'),
  })

  function set(k) {
    return e => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm(f => ({ ...f, [k]: val }))
    }
  }

  function handleModeChange(mode) {
    setTransportMode(mode)
    if (mode === 'air') {
      setForm(f => ({
        ...f,
        vehicle_type: 'freighter',
        fuel_type: 'jet_a1',
        registration_number: 'VT-CGN',
        tail_number: 'VT-CGN',
        payload_capacity_kg: 112000,
        volume_capacity_m3: 858,
      }))
    } else {
      setForm(f => ({
        ...f,
        vehicle_type: 'truck',
        fuel_type: 'diesel',
        registration_number: 'MH-12-FF-802',
        payload_capacity_kg: 18000,
      }))
    }
  }

  function submit(e) {
    e.preventDefault()
    const isAir = AIR_VEHICLE_TYPES.has(form.vehicle_type)
    const payload = {
      registration_number: form.registration_number,
      make: form.make || undefined,
      model: form.model || undefined,
      year: Number(form.year),
      vehicle_type: form.vehicle_type,
      fuel_type: form.fuel_type,
      payload_capacity_kg: Number(form.payload_capacity_kg),
      volume_capacity_m3: form.volume_capacity_m3 ? Number(form.volume_capacity_m3) : undefined,
      has_refrigeration: form.has_refrigeration,
      tail_number: isAir ? form.tail_number : undefined,
      uld_positions: isAir && form.uld_positions ? Number(form.uld_positions) : undefined,
      range_km: isAir && form.range_km ? Number(form.range_km) : undefined,
    }

    create.mutate(payload)
  }

  const isAir = AIR_VEHICLE_TYPES.has(form.vehicle_type)

  return (
    <Modal open={open} onClose={onClose} title="Register Fleet Asset (Road or Air Freighter)" width="max-w-xl">
      <form onSubmit={submit} className="space-y-4 text-xs">
        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-3 p-1.5 bg-app-panel border border-app-border rounded-xl">
          <button
            type="button"
            onClick={() => handleModeChange('road')}
            className={clsx(
              'flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold transition-all',
              transportMode === 'road'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs'
                : 'text-muted hover:text-heading'
            )}
          >
            <Truck size={16} /> Road Vehicle
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('air')}
            className={clsx(
              'flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-bold transition-all',
              transportMode === 'air'
                ? 'bg-purple-50 text-purple-700 border border-purple-300 shadow-xs'
                : 'text-muted hover:text-heading'
            )}
          >
            <Plane size={16} /> Air Cargo Aircraft
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label={isAir ? "Aircraft Registration / Tail Number" : "Registration Plate"} required>
            <input
              className="input uppercase font-mono font-bold"
              value={form.registration_number}
              onChange={set('registration_number')}
              placeholder={isAir ? "VT-CGN" : "MH-12-FF-802"}
              required
            />
          </FormField>
          <FormField label="Asset Category / Type">
            <select className="select capitalize font-semibold" value={form.vehicle_type} onChange={e => {
              set('vehicle_type')(e)
              const newMode = modeForVehicleType(e.target.value)
              setTransportMode(newMode)
            }}>
              {VEHICLE_TYPES_BY_MODE[transportMode].map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Make / Manufacturer">
            <input className="input" value={form.make} onChange={set('make')} placeholder={isAir ? "Boeing / ATR" : "Volvo / Tata"} />
          </FormField>
          <FormField label="Model">
            <input className="input" value={form.model} onChange={set('model')} placeholder={isAir ? "777F / 72-600F" : "FH16 / Signa"} />
          </FormField>
          <FormField label="Fuel Type">
            <select className="select capitalize" value={form.fuel_type} onChange={set('fuel_type')}>
              {FUEL_TYPES_BY_MODE[transportMode].map(f => (
                <option key={f} value={f}>{f.replace('_', ' ')}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-app-panel rounded-xl border border-app-border">
          <FormField label="Payload Capacity (kg)" required>
            <input className="input font-mono" type="number" value={form.payload_capacity_kg} onChange={set('payload_capacity_kg')} required />
          </FormField>
          <FormField label="Volume Capacity (m³)">
            <input className="input font-mono" type="number" value={form.volume_capacity_m3} onChange={set('volume_capacity_m3')} />
          </FormField>
        </div>

        {/* Air Specific Attributes */}
        {isAir && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-purple-50/50 border border-purple-200 rounded-xl">
            <FormField label="ULD Deck Slots (Unit Load Devices)">
              <input className="input font-mono" type="number" value={form.uld_positions} onChange={set('uld_positions')} placeholder="37" />
            </FormField>
            <FormField label="Maximum Flight Range (km)">
              <input className="input font-mono" type="number" value={form.range_km} onChange={set('range_km')} placeholder="8150" />
            </FormField>
          </div>
        )}

        {/* Road Specific Attributes */}
        {!isAir && (
          <div className="flex items-center gap-2 p-2.5 bg-app-panel border border-app-border rounded-xl">
            <input
              type="checkbox"
              id="reefer"
              checked={form.has_refrigeration}
              onChange={set('has_refrigeration')}
              className="w-4 h-4 rounded text-primary focus:ring-primary"
            />
            <label htmlFor="reefer" className="text-xs font-semibold text-heading flex items-center gap-1.5 cursor-pointer">
              <Snowflake size={14} className="text-blue-500" /> Temperature-Controlled / Refrigeration Equipped
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-app-border">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary text-xs" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Register Asset'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function FleetPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [modeFilter, setModeFilter] = useState('')

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles', modeFilter],
    queryFn: () => {
      const params = modeFilter ? `?transport_mode=${modeFilter}` : ''
      return api.get(`/vehicles/${params}`).then(r => r.data)
    },
  })

  const DEMO_VEHICLES = [
    {
      id: 'v1',
      registration_number: 'MH-12-FF-802',
      make: 'Volvo', model: 'FH16', year: 2026,
      vehicle_type: 'truck', transport_mode: 'road', fuel_type: 'diesel',
      payload_capacity_kg: 22000, volume_capacity_m3: 75,
      status: 'available', odometer_km: 184320, created_at: '2026-08-01T10:00:00Z',
    },
    {
      id: 'v5',
      registration_number: 'VT-CGN', tail_number: 'VT-CGN',
      make: 'Boeing', model: '777F', year: 2026,
      vehicle_type: 'freighter', transport_mode: 'air', fuel_type: 'jet_a1',
      payload_capacity_kg: 112000, volume_capacity_m3: 858, uld_positions: 37, range_km: 8150,
      status: 'available', odometer_km: 412000, created_at: '2026-08-02T14:00:00Z',
    },
    {
      id: 'v6',
      registration_number: 'VT-CGF', tail_number: 'VT-CGF',
      make: 'ATR', model: '72-600F', year: 2026,
      vehicle_type: 'turboprop', transport_mode: 'air', fuel_type: 'jet_a1',
      payload_capacity_kg: 8600, volume_capacity_m3: 75, uld_positions: 6, range_km: 1500,
      status: 'in_transit', odometer_km: 98400, created_at: '2026-08-03T16:30:00Z',
    },
  ]

  const vehiclesList = vehicles || DEMO_VEHICLES

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Fleet Assets & Aircraft Registry</h2>
          <p className="text-xs text-muted mt-0.5">Manage multi-modal road trucks, vans, widebody freighters & feeder turboprops</p>
        </div>

        <button className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Register Asset
        </button>
      </div>

      {/* Mode Filter Bar */}
      <div className="flex items-center gap-2 p-1.5 bg-app-surface border border-app-border rounded-2xl w-max">
        <button
          onClick={() => setModeFilter('')}
          className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold transition-all', !modeFilter ? 'bg-primary-soft text-primary font-bold border border-primary/25' : 'text-body hover:bg-app-panel')}
        >
          All Assets ({vehiclesList.length})
        </button>
        <button
          onClick={() => setModeFilter('road')}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all', modeFilter === 'road' ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200' : 'text-body hover:bg-app-panel')}
        >
          <Truck size={14} /> Road Fleet
        </button>
        <button
          onClick={() => setModeFilter('air')}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all', modeFilter === 'air' ? 'bg-purple-50 text-purple-700 font-bold border border-purple-200' : 'text-body hover:bg-app-panel')}
        >
          <Plane size={14} /> Air Freighters
        </button>
      </div>

      {!vehiclesList.length ? (
        <EmptyState
          icon={Truck}
          title="No assets registered"
          description="Register trucks, vans, wide-body freighters or regional feeder aircraft"
          action={
            <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Add Asset
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehiclesList.map(v => {
            const isAir = v.transport_mode === 'air'
            const variant = graphicVariant(v.vehicle_type)
            return (
              <div key={v.id} className="card p-4 hover:border-primary/30 transition-all shadow-card flex flex-col justify-between space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-heading">
                        {v.tail_number || v.registration_number}
                      </span>
                      <TransportModeBadge mode={v.transport_mode} />
                    </div>
                    <p className="text-xs text-muted font-medium mt-0.5">{v.make} {v.model} ({v.year || 2026})</p>
                  </div>
                  <StatusBadge status={v.status || 'available'} />
                </div>

                {/* SVG Vehicle/Aircraft Drawing */}
                <div className="p-3 bg-app-panel border border-app-border rounded-xl flex items-center justify-center">
                  <VehicleGraphic variant={variant} fillPercent={v.status === 'in_transit' ? 75 : 0} className="w-full h-20" />
                </div>

                <div className="space-y-1.5 text-xs border-t border-app-border pt-3">
                  <div className="flex justify-between items-center text-body">
                    <span className="text-muted font-medium">Payload Capacity:</span>
                    <span className="font-mono font-bold text-heading">{(v.payload_capacity_kg || 0).toLocaleString()} kg</span>
                  </div>
                  {isAir ? (
                    <div className="flex justify-between items-center text-purple-300 font-semibold bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/30">
                      <span>ULD Capacity: {v.uld_positions || 6} Slots</span>
                      <span>Range: {(v.range_km || 1500).toLocaleString()} km</span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center text-emerald-300 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                      <span>Max Volume: {v.volume_capacity_m3 || 85} m³</span>
                      <span>Range: {(v.range_km || 1200).toLocaleString()} km</span>
                    </div>
                  )}
                  {v.has_refrigeration && (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/30 w-max">
                      <Snowflake size={12} /> Temperature Controlled / Cold Chain
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateVehicleModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
