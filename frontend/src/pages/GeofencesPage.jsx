import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Circle as CircleIcon, Hexagon, Trash2, X, Check, MapPin, LogIn, LogOut,
} from 'lucide-react'
import clsx from 'clsx'
import api from '../utils/api'
import GeofenceMap from '../components/GeofenceMap'
import { EmptyState, SectionHeader, Spinner, FormField } from '../components/ui'
import { ringCentroid } from '../utils/geofence'

const MIN_RADIUS_M = 50
const MAX_RADIUS_M = 20_000

function formatCoord(value) {
  return typeof value === 'number' ? value.toFixed(4) : '—'
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function GeofencesPage() {
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState(null)
  const [drawMode, setDrawMode] = useState(null)       // null | 'circle' | 'polygon'
  const [draftCentre, setDraftCentre] = useState(null)
  const [draftRadiusM, setDraftRadiusM] = useState(500)
  const [draftVertices, setDraftVertices] = useState([])
  const [draftName, setDraftName] = useState('')
  const [alertOnEnter, setAlertOnEnter] = useState(true)
  const [alertOnExit, setAlertOnExit] = useState(true)

  const {
    data: fences, isLoading: fencesLoading, isError: fencesError,
  } = useQuery({
    queryKey: ['geofences'],
    queryFn: () => api.get('/geofences/').then(r => r.data),
    retry: false,
  })

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['geofence-events'],
    queryFn: () => api.get('/geofences/events', { params: { limit: 25 } }).then(r => r.data),
    refetchInterval: 20_000,
    retry: false,
  })

  function resetDraft() {
    setDrawMode(null)
    setDraftCentre(null)
    setDraftVertices([])
    setDraftRadiusM(500)
    setDraftName('')
    setAlertOnEnter(true)
    setAlertOnExit(true)
  }

  const createFence = useMutation({
    mutationFn: payload => api.post('/geofences/', payload).then(r => r.data),
    onSuccess: fence => {
      queryClient.invalidateQueries({ queryKey: ['geofences'] })
      toast.success(`Geofence "${fence.name}" created`)
      resetDraft()
      setSelectedId(fence.id)
    },
    onError: err => {
      toast.error(err.response?.data?.detail || 'Could not create the geofence')
    },
  })

  const deleteFence = useMutation({
    mutationFn: id => api.delete(`/geofences/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['geofences'] })
      if (selectedId === id) setSelectedId(null)
      toast.success('Geofence deleted')
    },
    onError: err => toast.error(err.response?.data?.detail || 'Could not delete the geofence'),
  })

  function handleMapClick(lngLat) {
    if (drawMode === 'circle') setDraftCentre(lngLat)
    else if (drawMode === 'polygon') setDraftVertices(v => [...v, lngLat])
  }

  const draftReady = drawMode === 'circle'
    ? Boolean(draftCentre) && draftName.trim().length > 0
    : draftVertices.length >= 3 && draftName.trim().length > 0

  function saveDraft() {
    if (!draftReady) return
    const shared = {
      name: draftName.trim(),
      alert_on_enter: alertOnEnter,
      alert_on_exit: alertOnExit,
    }
    createFence.mutate(
      drawMode === 'circle'
        ? {
            ...shared,
            kind: 'circle',
            centre_latitude: draftCentre[1],
            centre_longitude: draftCentre[0],
            radius_m: draftRadiusM,
          }
        : { ...shared, kind: 'polygon', boundary: draftVertices },
    )
  }

  const selected = useMemo(
    () => fences?.find(f => f.id === selectedId) || null,
    [fences, selectedId],
  )

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Geofences"
        subtitle="Zones that raise an alert when a vehicle enters or leaves."
        actions={
          drawMode ? (
            <button type="button" onClick={resetDraft} className="btn-secondary text-[13px]">
              <X size={14} /> Cancel
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { resetDraft(); setDrawMode('circle') }}
                className="btn-secondary text-[13px]"
              >
                <CircleIcon size={14} /> Draw circle
              </button>
              <button
                type="button"
                onClick={() => { resetDraft(); setDrawMode('polygon') }}
                className="btn-secondary text-[13px]"
              >
                <Hexagon size={14} /> Draw polygon
              </button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {drawMode && (
            <div className="bg-primary-soft border border-app-border rounded-xl px-4 py-3 space-y-3">
              <p className="text-[13px] text-heading font-semibold">
                {drawMode === 'circle'
                  ? draftCentre
                    ? 'Centre placed — set the radius, name it, then save.'
                    : 'Click the map to place the centre of the zone.'
                  : `Click each corner of the zone (${draftVertices.length} placed, 3 minimum).`}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Zone name" required>
                  <input
                    className="input"
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    placeholder="e.g. Mumbai Depot"
                  />
                </FormField>

                {drawMode === 'circle' && (
                  <FormField label={`Radius — ${draftRadiusM.toLocaleString()} m`}>
                    <input
                      type="range"
                      min={MIN_RADIUS_M}
                      max={MAX_RADIUS_M}
                      step={50}
                      value={draftRadiusM}
                      onChange={e => setDraftRadiusM(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </FormField>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-[12px] text-heading">
                  <input
                    type="checkbox"
                    checked={alertOnEnter}
                    onChange={e => setAlertOnEnter(e.target.checked)}
                    className="accent-primary"
                  />
                  Alert on enter
                </label>
                <label className="flex items-center gap-2 text-[12px] text-heading">
                  <input
                    type="checkbox"
                    checked={alertOnExit}
                    onChange={e => setAlertOnExit(e.target.checked)}
                    className="accent-primary"
                  />
                  Alert on exit
                </label>

                {drawMode === 'polygon' && draftVertices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraftVertices(v => v.slice(0, -1))}
                    className="text-[12px] text-muted underline underline-offset-2"
                  >
                    Undo last point
                  </button>
                )}

                <button
                  type="button"
                  disabled={!draftReady || createFence.isPending}
                  onClick={saveDraft}
                  className="btn-primary text-[13px] ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {createFence.isPending ? <Spinner size={14} /> : <Check size={14} />}
                  Save geofence
                </button>
              </div>
            </div>
          )}

          <div className="h-[520px] rounded-2xl overflow-hidden border border-app-border">
            {fencesLoading ? (
              <div className="w-full h-full bg-app-panel animate-pulse" aria-label="Loading map" />
            ) : (
              <GeofenceMap
                fences={fences || []}
                selectedId={selectedId}
                drawMode={drawMode}
                draftCentre={draftCentre}
                draftRadiusM={draftRadiusM}
                draftVertices={draftVertices}
                onMapClick={handleMapClick}
                className="w-full h-full"
              />
            )}
          </div>
        </div>

        {/* ── Side panel ──────────────────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-[15px] font-bold text-heading font-display">
              Zones {fences?.length ? `(${fences.length})` : ''}
            </h3>

            {fencesLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-app-panel animate-pulse" />
                ))}
              </div>
            ) : fencesError ? (
              <EmptyState
                icon={MapPin}
                title="Could not load geofences"
                description="The API is unreachable. Zones already saved are unaffected."
              />
            ) : !fences?.length ? (
              <EmptyState
                icon={MapPin}
                title="No geofences yet"
                description="Draw a circle or a polygon on the map to raise alerts when vehicles enter or leave a zone."
              />
            ) : (
              <ul className="space-y-2">
                {fences.map(fence => {
                  const centre = fence.centre_longitude != null
                    ? [fence.centre_longitude, fence.centre_latitude]
                    : ringCentroid(fence.boundary)
                  return (
                    <li key={fence.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(fence.id === selectedId ? null : fence.id)}
                        className={clsx(
                          'w-full text-left px-3 py-2.5 rounded-xl border transition-colors',
                          fence.id === selectedId
                            ? 'border-primary bg-primary-soft'
                            : 'border-app-border bg-app-surface hover:bg-primary-soft',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {fence.kind === 'circle'
                            ? <CircleIcon size={14} className="text-primary flex-shrink-0" />
                            : <Hexagon size={14} className="text-primary flex-shrink-0" />}
                          <span className="text-[13px] font-semibold text-heading truncate">
                            {fence.name}
                          </span>
                          {!fence.is_active && (
                            <span className="text-[10px] text-muted uppercase tracking-wider">
                              inactive
                            </span>
                          )}
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Delete ${fence.name}`}
                            onClick={e => {
                              e.stopPropagation()
                              deleteFence.mutate(fence.id)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                deleteFence.mutate(fence.id)
                              }
                            }}
                            className="ml-auto text-muted hover:text-primary transition-colors"
                          >
                            <Trash2 size={14} />
                          </span>
                        </div>
                        <p className="text-[11px] text-muted font-mono mt-0.5">
                          {fence.kind === 'circle'
                            ? `${fence.radius_m?.toLocaleString()} m radius`
                            : `${Math.max(fence.boundary.length - 1, 0)} points`}
                          {centre && ` · ${formatCoord(centre[1])}, ${formatCoord(centre[0])}`}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {selected && (
            <section className="bg-app-panel border border-app-border rounded-xl px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                Alerting
              </p>
              <p className="text-[12px] text-heading mt-1">
                {selected.alert_on_enter && selected.alert_on_exit
                  ? 'On entry and exit'
                  : selected.alert_on_enter
                    ? 'On entry only'
                    : selected.alert_on_exit
                      ? 'On exit only'
                      : 'Silent — crossings are recorded but never alert'}
              </p>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-[15px] font-bold text-heading font-display">Recent crossings</h3>
            {eventsLoading ? (
              <div className="space-y-2">
                {[0, 1].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-app-panel animate-pulse" />
                ))}
              </div>
            ) : !events?.length ? (
              <EmptyState
                icon={LogIn}
                title="No crossings yet"
                description="Enter and exit events appear here as vehicles move through your zones."
              />
            ) : (
              <ul className="space-y-1.5">
                {events.map(event => (
                  <li
                    key={event.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-app-surface border border-app-border"
                  >
                    {event.event_type === 'enter'
                      ? <LogIn size={14} className="text-emerald-500 flex-shrink-0" />
                      : <LogOut size={14} className="text-amber-500 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-heading truncate">
                        <span className="font-mono font-semibold">
                          {event.vehicle_registration || 'Unknown vehicle'}
                        </span>
                        {event.event_type === 'enter' ? ' entered ' : ' left '}
                        <span className="font-semibold">{event.geofence_name}</span>
                      </p>
                      <p className="text-[10px] text-muted tabular-nums">
                        {relativeTime(event.occurred_at)}
                        {event.acknowledged_at && ' · acknowledged'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
