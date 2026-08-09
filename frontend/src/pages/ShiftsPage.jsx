import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Plus,
  Clock, Truck, Trash2, AlertTriangle, Moon,
} from 'lucide-react'
import {
  addWeeks, eachDayOfInterval, endOfDay, endOfWeek, format, isSameDay,
  isToday, setHours, startOfDay, startOfWeek,
} from 'date-fns'
import clsx from 'clsx'
import api from '../utils/api'
import { EmptyState, FormField, Modal, SectionHeader, Spinner, StatusBadge } from '../components/ui'

// Rosters are read Monday-first; the API takes the same boundaries as query params.
const WEEK_OPTS = { weekStartsOn: 1 }

const SHIFT_STATUSES = ['scheduled', 'active', 'completed', 'cancelled']

// A new shift on a clicked day opens as a standard day run rather than midnight.
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 18

/** `datetime-local` speaks wall-clock time with no zone; the API speaks UTC ISO. */
function toLocalInput(iso) {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : ''
}

function toApiIso(localValue) {
  return new Date(localValue).toISOString()
}

function ShiftFormModal({ shift, defaultDay, drivers, vehicles, onClose }) {
  const queryClient = useQueryClient()
  const editing = Boolean(shift)

  const [driverId, setDriverId] = useState(shift?.driver_id || '')
  const [vehicleId, setVehicleId] = useState(shift?.vehicle_id || '')
  const [startsAt, setStartsAt] = useState(
    shift
      ? toLocalInput(shift.starts_at)
      : format(setHours(startOfDay(defaultDay), DEFAULT_START_HOUR), "yyyy-MM-dd'T'HH:mm"),
  )
  const [endsAt, setEndsAt] = useState(
    shift
      ? toLocalInput(shift.ends_at)
      : format(setHours(startOfDay(defaultDay), DEFAULT_END_HOUR), "yyyy-MM-dd'T'HH:mm"),
  )
  const [notes, setNotes] = useState(shift?.notes || '')
  const [status, setStatus] = useState(shift?.status || 'scheduled')
  const [rangeError, setRangeError] = useState(null)
  // The overlap rejection is the whole point of the feature, so it gets its own
  // slot in the form rather than a toast the dispatcher can miss.
  const [conflict, setConflict] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleWriteError(err) {
    if (err.response?.status === 409) {
      setConflict(err.response.data?.detail || 'That slot overlaps an existing shift.')
      return
    }
    toast.error(err.response?.data?.detail || 'Could not save the shift')
  }

  const saveShift = useMutation({
    mutationFn: payload => (
      editing
        ? api.patch(`/shifts/${shift.id}`, payload).then(r => r.data)
        : api.post('/shifts/', payload).then(r => r.data)
    ),
    onSuccess: saved => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      toast.success(`Shift for ${saved.driver_name} ${editing ? 'updated' : 'scheduled'}`)
      onClose()
    },
    onError: handleWriteError,
  })

  const deleteShift = useMutation({
    mutationFn: () => api.delete(`/shifts/${shift.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      toast.success('Shift deleted')
      onClose()
    },
    onError: err => toast.error(err.response?.data?.detail || 'Could not delete the shift'),
  })

  function handleSubmit(e) {
    e.preventDefault()
    setConflict(null)

    if (new Date(endsAt) <= new Date(startsAt)) {
      setRangeError('The shift must end after it starts.')
      return
    }
    setRangeError(null)

    const payload = {
      driver_id: driverId,
      vehicle_id: vehicleId || null,
      starts_at: toApiIso(startsAt),
      ends_at: toApiIso(endsAt),
      notes: notes.trim() || null,
    }
    if (editing) {
      payload.status = status
      // On PATCH a null vehicle_id means "leave it alone"; unassigning needs
      // its own flag, or clearing the select would silently keep the vehicle.
      if (!vehicleId) payload.clear_vehicle = true
    }

    saveShift.mutate(payload)
  }

  const busy = saveShift.isPending || deleteShift.isPending

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit shift' : 'Assign a shift'}
      width="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {conflict && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-primary-soft border border-primary/40">
            <AlertTriangle size={16} className="text-primary flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-heading">Scheduling conflict</p>
              <p className="text-[12px] text-body mt-0.5 break-words">{conflict}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Driver" required>
            <select
              className="select"
              value={driverId}
              onChange={e => setDriverId(e.target.value)}
              required
            >
              <option value="">Select a driver…</option>
              {(drivers || []).map(d => (
                <option key={d.id} value={d.id}>
                  {d.full_name}{d.is_active === false ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Vehicle">
            <select
              className="select"
              value={vehicleId}
              onChange={e => setVehicleId(e.target.value)}
            >
              <option value="">No vehicle</option>
              {(vehicles || []).map(v => (
                <option key={v.id} value={v.id}>
                  {v.registration_number}{v.vehicle_type ? ` — ${v.vehicle_type}` : ''}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Starts" required>
            <input
              className="input"
              type="datetime-local"
              value={startsAt}
              onChange={e => { setStartsAt(e.target.value); setRangeError(null) }}
              required
            />
          </FormField>
          <FormField label="Ends" required error={rangeError}>
            <input
              className="input"
              type="datetime-local"
              value={endsAt}
              onChange={e => { setEndsAt(e.target.value); setRangeError(null) }}
              required
            />
          </FormField>
        </div>

        {editing && (
          <FormField label="Status">
            <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
              {SHIFT_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label="Notes">
          <input
            className="input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Night run to Pune depot"
          />
        </FormField>

        {confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-app-border">
            <p className="text-[12px] text-heading font-semibold flex-1 min-w-[180px]">
              Delete this shift permanently?
            </p>
            <button
              type="button"
              className="btn-neutral text-xs"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleteShift.isPending}
            >
              Keep it
            </button>
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => deleteShift.mutate()}
              disabled={deleteShift.isPending}
            >
              {deleteShift.isPending ? <Spinner size={14} /> : <Trash2 size={14} />}
              Yes, delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-3 border-t border-app-border">
            {editing && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="btn-ghost text-xs hover:text-primary"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-neutral text-xs ml-auto">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs" disabled={busy}>
              {saveShift.isPending && <Spinner size={14} />}
              {editing ? 'Save changes' : 'Assign shift'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}

function ShiftCard({ shift, day, onClick }) {
  const start = new Date(shift.starts_at)
  const end = new Date(shift.ends_at)
  const overnight = !isSameDay(start, end)

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-2.5 py-2 rounded-xl border border-app-border bg-app-surface hover:bg-primary-soft hover:border-primary/40 transition-colors"
    >
      <p className="text-[12px] font-semibold text-heading truncate">{shift.driver_name}</p>

      <p className="text-[11px] text-muted font-mono tabular-nums mt-0.5 flex items-center gap-1">
        <Clock size={11} className="flex-shrink-0" />
        {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
        {overnight && (
          <Moon
            size={11}
            className="text-primary flex-shrink-0"
            aria-label={isSameDay(start, day) ? 'Runs past midnight' : 'Started the previous day'}
          />
        )}
      </p>

      <p className="text-[11px] text-muted font-mono truncate flex items-center gap-1 mt-0.5">
        <Truck size={11} className="flex-shrink-0" />
        {shift.vehicle_registration || 'No vehicle'}
      </p>

      <div className="mt-1.5">
        <StatusBadge status={shift.status} />
      </div>
    </button>
  )
}

export default function ShiftsPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), WEEK_OPTS))
  const [formState, setFormState] = useState(null)   // null | { shift } | { defaultDay }

  const weekEnd = useMemo(() => endOfWeek(weekStart, WEEK_OPTS), [weekStart])
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  )

  const fromIso = weekStart.toISOString()
  const toIso = weekEnd.toISOString()

  const { data: shifts, isLoading, isError } = useQuery({
    queryKey: ['shifts', fromIso, toIso],
    queryFn: () => api.get('/shifts/', { params: { from: fromIso, to: toIso } }).then(r => r.data),
    retry: false,
  })

  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get('/drivers/').then(r => r.data),
    retry: false,
  })

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get('/vehicles/').then(r => r.data),
    retry: false,
  })

  // A shift lands in every day it overlaps, so an overnight run shows on both.
  const shiftsByDay = useMemo(() => days.map(day => {
    const dayStart = startOfDay(day)
    const dayEnd = endOfDay(day)
    // Half-open on the end so a shift finishing at 00:00 does not bleed into the next day
    return (shifts || [])
      .filter(s => new Date(s.starts_at) <= dayEnd && new Date(s.ends_at) > dayStart)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  }), [days, shifts])

  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), WEEK_OPTS))
  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`
  // Assigning from the header lands on today when today is in view
  const defaultNewDay = isCurrentWeek ? startOfDay(new Date()) : weekStart

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Driver Shifts"
        subtitle="Who is on the road, when, and in which vehicle."
        actions={
          <button
            type="button"
            onClick={() => setFormState({ defaultDay: defaultNewDay })}
            className="btn-primary text-[13px]"
          >
            <Plus size={14} /> Assign shift
          </button>
        }
      />

      {/* ── Week navigator ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 bg-app-surface border border-app-border rounded-2xl px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekStart(w => addWeeks(w, -1))}
            className="p-1.5 rounded-lg text-muted hover:text-heading hover:bg-app-hover transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg text-muted hover:text-heading hover:bg-app-hover transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="min-w-0">
          <p className="text-[14px] font-bold text-heading font-display leading-tight">{weekLabel}</p>
          <p className="text-[11px] text-muted mt-0.5">
            {isLoading ? 'Loading…' : `${shifts?.length || 0} shift${shifts?.length === 1 ? '' : 's'} this week`}
          </p>
        </div>

        <button
          type="button"
          disabled={isCurrentWeek}
          onClick={() => setWeekStart(startOfWeek(new Date(), WEEK_OPTS))}
          className="btn-secondary text-[13px] ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CalendarDays size={14} /> This week
        </button>
      </div>

      {/* ── Schedule ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
          {days.map(day => (
            <div key={day.toISOString()} className="space-y-2">
              <div className="h-4 w-24 rounded-md bg-app-panel animate-pulse" />
              <div className="h-24 rounded-xl bg-app-panel animate-pulse" />
              <div className="h-24 rounded-xl bg-app-panel animate-pulse" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={CalendarClock}
          title="Could not load the roster"
          description="The API is unreachable. Shifts already saved are unaffected — try again in a moment."
        />
      ) : !shifts?.length ? (
        <EmptyState
          icon={CalendarClock}
          title="No shifts this week"
          description={`Nothing is scheduled between ${weekLabel}. Assign a driver to start building the roster.`}
          action={
            <button
              type="button"
              onClick={() => setFormState({ defaultDay: defaultNewDay })}
              className="btn-primary text-[13px]"
            >
              <Plus size={14} /> Assign shift
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
          {days.map((day, i) => (
            <section
              key={day.toISOString()}
              className={clsx(
                'rounded-2xl border p-2.5 space-y-2 min-w-0',
                isToday(day) ? 'border-primary bg-primary-soft' : 'border-app-border bg-app-panel',
              )}
            >
              <header className="flex items-baseline justify-between gap-2 px-0.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-heading font-display">
                    {format(day, 'EEE')}
                  </p>
                  <p className="text-[11px] text-muted tabular-nums">{format(day, 'd MMM')}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Assign a shift on ${format(day, 'EEEE d MMMM')}`}
                  onClick={() => setFormState({ defaultDay: day })}
                  className="p-1 rounded-lg text-muted hover:text-primary hover:bg-app-hover transition-colors"
                >
                  <Plus size={14} />
                </button>
              </header>

              {shiftsByDay[i].length === 0 ? (
                <p className="text-[11px] text-subtle px-0.5 py-2">No shifts</p>
              ) : (
                <ul className="space-y-2">
                  {shiftsByDay[i].map(shift => (
                    <li key={shift.id}>
                      <ShiftCard
                        shift={shift}
                        day={day}
                        onClick={() => setFormState({ shift })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Remounting per target keeps the form fields seeded from the right shift */}
      {formState && (
        <ShiftFormModal
          key={formState.shift?.id || `new-${formState.defaultDay?.toISOString()}`}
          shift={formState.shift}
          defaultDay={formState.defaultDay}
          drivers={drivers}
          vehicles={vehicles}
          onClose={() => setFormState(null)}
        />
      )}
    </div>
  )
}
