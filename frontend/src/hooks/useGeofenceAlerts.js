import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../utils/api'

/**
 * Raises a toast for every new unacknowledged geofence crossing.
 *
 * Mounted once in the app shell so alerts follow the dispatcher across pages.
 * Polls rather than reading the tracking WebSocket: the socket only reaches
 * whoever has the tracking screen open, and a missed frame is a missed alert.
 *
 * Events are recorded as transitions, so the feed is naturally small.
 */

const POLL_MS = 15_000

/** Never toast an event older than this on first load — no wall of stale alerts. */
const MAX_AGE_ON_MOUNT_MS = 5 * 60_000

export default function useGeofenceAlerts({ enabled = true } = {}) {
  // Events already surfaced, so a slow acknowledge cannot double-toast
  const seenRef = useRef(new Set())
  const mountedAtRef = useRef(Date.now())

  const { data } = useQuery({
    queryKey: ['geofence-alerts'],
    queryFn: () => api
      .get('/geofences/events', { params: { unacknowledged_only: true, limit: 25 } })
      .then(r => r.data),
    refetchInterval: POLL_MS,
    enabled,
    retry: false,
  })

  useEffect(() => {
    if (!Array.isArray(data)) return

    // The feed is newest-first; replay oldest-first so toasts stack in order
    for (const event of [...data].reverse()) {
      if (seenRef.current.has(event.id)) continue
      seenRef.current.add(event.id)

      // On a fresh page load, only announce genuinely recent crossings
      const age = mountedAtRef.current - new Date(event.occurred_at).getTime()
      if (age > MAX_AGE_ON_MOUNT_MS) continue

      const entering = event.event_type === 'enter'
      const who = event.vehicle_registration || 'A vehicle'
      toast(
        `${who} ${entering ? 'entered' : 'left'} ${event.geofence_name}`,
        {
          id: event.id,
          icon: entering ? '📍' : '🚪',
          duration: 6000,
        },
      )
    }
  }, [data])
}
