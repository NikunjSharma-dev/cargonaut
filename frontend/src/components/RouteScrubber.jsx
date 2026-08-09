import { useEffect, useRef } from 'react'
import { Play, Pause, SkipBack } from 'lucide-react'

/**
 * Timeline control for route replay.
 *
 * Stateless with respect to position — the parent owns `cursor`, so the map and
 * this control can never disagree about where in the trail we are.
 */

const SPEEDS = [1, 2, 4, 8]

/** Ticks per second at 1×. Slow enough to read, fast enough not to bore. */
const BASE_TICKS_PER_SEC = 4

function formatStamp(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
}

export default function RouteScrubber({
  points = [],
  cursor = 0,
  onCursor,
  playing = false,
  onPlaying,
  speed = 1,
  onSpeed,
}) {
  const last = points.length - 1
  const atEnd = cursor >= last
  const timerRef = useRef(null)

  // Advance the cursor while playing. Interval is derived from speed, so
  // changing speed mid-playback re-arms the timer rather than compounding.
  useEffect(() => {
    if (!playing || points.length < 2) return undefined
    const interval = 1000 / (BASE_TICKS_PER_SEC * speed)
    // The updater stays pure — stopping at the end is handled by the effect
    // below, so React may safely re-invoke this in StrictMode.
    timerRef.current = setInterval(() => {
      onCursor(prev => Math.min(prev + 1, points.length - 1))
    }, interval)
    return () => clearInterval(timerRef.current)
  }, [playing, speed, points.length, onCursor])

  // Playback stops itself once the head reaches the last fix
  useEffect(() => {
    if (playing && points.length >= 2 && cursor >= points.length - 1) onPlaying(false)
  }, [playing, cursor, points.length, onPlaying])

  const disabled = points.length < 2

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-app-panel border border-app-border rounded-xl">
      <button
        type="button"
        aria-label={playing ? 'Pause replay' : 'Play replay'}
        disabled={disabled}
        onClick={() => {
          // Replaying from the end should restart, not sit still
          if (atEnd) onCursor(0)
          onPlaying(!playing)
        }}
        className="w-9 h-9 flex-shrink-0 rounded-xl bg-primary text-white flex items-center justify-center shadow-card transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>

      <button
        type="button"
        aria-label="Restart replay"
        disabled={disabled}
        onClick={() => { onPlaying(false); onCursor(0) }}
        className="w-9 h-9 flex-shrink-0 rounded-xl bg-app-surface border border-app-border text-primary flex items-center justify-center transition-colors hover:bg-primary-soft disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <SkipBack size={15} />
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(last, 0)}
        value={Math.min(cursor, Math.max(last, 0))}
        disabled={disabled}
        aria-label="Route replay position"
        onChange={e => { onPlaying(false); onCursor(Number(e.target.value)) }}
        className="flex-1 min-w-[140px] accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
      />

      <div className="flex items-center gap-1" role="group" aria-label="Replay speed">
        {SPEEDS.map(s => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            disabled={disabled}
            onClick={() => onSpeed(s)}
            className={`px-2 py-1 text-[11px] font-semibold font-mono rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              speed === s
                ? 'bg-primary text-white border-primary'
                : 'bg-app-surface text-muted border-app-border hover:bg-primary-soft'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="text-right min-w-[168px]">
        <p className="text-[12px] font-mono font-semibold text-heading tabular-nums">
          {formatStamp(points[cursor]?.timestamp)}
        </p>
        <p className="text-[10px] text-muted tabular-nums">
          {points.length ? `${Math.min(cursor + 1, points.length)} / ${points.length} pings` : 'No pings'}
          {points[cursor]?.speed_kmh != null && ` · ${Math.round(points[cursor].speed_kmh)} km/h`}
        </p>
      </div>
    </div>
  )
}
