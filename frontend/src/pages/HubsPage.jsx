import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Warehouse, MapPin, Building2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { PageLoader, EmptyState, Modal, FormField } from '../components/ui'

function CreateHubModal({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', hub_type: 'warehouse', address: '',
    city: '', state: '', country: 'India',
    latitude: '19.0760', longitude: '72.8777', geofence_radius_meters: 500,
  })

  const create = useMutation({
    mutationFn: data => api.post('/hubs/', data),
    onSuccess: () => { qc.invalidateQueries(['hubs']); toast.success('Warehouse hub created!'); onClose() },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to create hub'),
  })

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function submit(e) {
    e.preventDefault()
    create.mutate({
      ...form,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      geofence_radius_meters: Number(form.geofence_radius_meters),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Warehouse / Depot Hub">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <FormField label="Hub Location Name" required>
          <input className="input" value={form.name} onChange={set('name')} placeholder="North Hub Depot" required />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Facility Type">
            <select className="select capitalize" value={form.hub_type} onChange={set('hub_type')}>
              {['warehouse', 'distribution_center', 'pickup_point', 'cross_dock'].map(t => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </FormField>
          <FormField label="City" required>
            <input className="input" value={form.city} onChange={set('city')} placeholder="Mumbai" required />
          </FormField>
        </div>
        <FormField label="Full Depot Address" required>
          <input className="input" value={form.address} onChange={set('address')} placeholder="Industrial Zone Gate #3" required />
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

  const { data: hubs, isLoading } = useQuery({
    queryKey: ['hubs'],
    queryFn: () => api.get('/hubs/').then(r => r.data),
  })

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Warehouse & Depot Hubs</h2>
          <p className="text-xs text-muted mt-0.5">Manage {hubs?.length ?? 6} active logistics nodes & geofences</p>
        </div>

        <button className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Create Hub
        </button>
      </div>

      {!hubs?.length ? (
        <EmptyState
          icon={Warehouse}
          title="No warehouse hubs registered"
          description="Create your first distribution center or depot to set up arrival geofencing"
          action={
            <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create Hub
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {hubs.map(hub => (
            <div key={hub.id} className="card hover:border-primary/30 transition-all shadow-card flex flex-col justify-between">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary font-bold flex items-center justify-center border border-primary/25 shadow-2xs">
                    <Warehouse size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-heading font-display">{hub.name}</h4>
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
          ))}
        </div>
      )}

      <CreateHubModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
