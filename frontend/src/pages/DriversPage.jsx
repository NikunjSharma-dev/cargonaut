import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, Phone, Mail, ShieldCheck, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../utils/api'
import { PageLoader, EmptyState, Modal, FormField } from '../components/ui'
import { initials } from '../utils/helpers'
import clsx from 'clsx'

function CreateDriverModal({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '',
    license_number: '', license_expiry: '', license_class: 'HMV',
    shift_start: '08:00', shift_end: '18:00',
  })

  const create = useMutation({
    mutationFn: data => api.post('/drivers/', data),
    onSuccess: () => { qc.invalidateQueries(['drivers']); toast.success('Driver onboarded!'); onClose() },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to onboard driver'),
  })

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  function submit(e) {
    e.preventDefault()
    create.mutate({
      ...form,
      license_expiry: new Date(form.license_expiry).toISOString(),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Onboard New Driver">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Full Name" required>
            <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="Vikram Singh" required />
          </FormField>
          <FormField label="Phone Number" required>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+91 98230 11204" required />
          </FormField>
        </div>
        <FormField label="Email Address">
          <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="vikram@cargonaut.io" />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Driving License Number" required>
            <input className="input font-mono uppercase font-semibold" value={form.license_number} onChange={set('license_number')} placeholder="DL-1420110098" required />
          </FormField>
          <FormField label="License Expiry" required>
            <input className="input" type="date" value={form.license_expiry} onChange={set('license_expiry')} required />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-app-border">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary text-xs" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Onboard Driver'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function DriversPage() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: drivers, isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get('/drivers/').then(r => r.data),
  })

  const toggleAvailable = useMutation({
    mutationFn: ({ id, is_available }) => api.patch(`/drivers/${id}`, { is_available }),
    onSuccess: () => qc.invalidateQueries(['drivers']),
  })

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Drivers Roster & Duty Roster</h2>
          <p className="text-xs text-muted mt-0.5">Manage {drivers?.length ?? 18} commercial drivers & license verifications</p>
        </div>

        <button className="btn-primary text-xs py-2 px-4 rounded-xl shadow-xs self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Onboard Driver
        </button>
      </div>

      {!drivers?.length ? (
        <EmptyState
          icon={Users}
          title="No drivers registered"
          description="Onboard your first commercial driver to assign vehicle dispatches"
          action={
            <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Onboard Driver
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {drivers.map(driver => (
            <div key={driver.id} className="card hover:border-primary/30 transition-all flex flex-col justify-between shadow-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary font-bold text-xs flex items-center justify-center border border-primary/25 shadow-2xs">
                    {initials(driver.full_name || 'D')}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-heading font-display">{driver.full_name}</h4>
                    <p className="text-xs text-muted font-medium">
                      {driver.license_class || 'HMV Heavy'} • <span className="font-mono">{driver.license_number || 'DL-94821'}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleAvailable.mutate({ id: driver.id, is_available: !driver.is_available })}
                  className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer',
                    driver.is_available
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  )}
                  title="Click to toggle availability"
                >
                  {driver.is_available ? 'ON DUTY' : 'OFF DUTY'}
                </button>
              </div>

              <div className="pt-3 border-t border-app-border space-y-1.5 text-xs text-body">
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-primary" />
                  <span className="font-mono text-heading">{driver.phone}</span>
                </div>
                {driver.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="text-muted" />
                    <span className="truncate text-muted">{driver.email}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateDriverModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
