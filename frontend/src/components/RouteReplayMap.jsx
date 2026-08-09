import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPinOff } from 'lucide-react'
import { useResolvedTheme } from '../store/themeStore'

/**
 * Mapbox GL breadcrumb map for vehicle route replay.
 *
 * Draws the full trail faded, the portion already replayed in the mode accent,
 * and a marker at `cursor`. The parent owns `cursor` so the scrubber, the
 * travelled line and the marker are always driven by the same index — they
 * cannot drift apart.
 */

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

const SRC_TRAIL = 'replay-trail'
const SRC_TRAVELLED = 'replay-travelled'
const SRC_ENDS = 'replay-ends'
const LYR_TRAIL = 'replay-trail-line'
const LYR_TRAVELLED = 'replay-travelled-line'
const LYR_ENDS = 'replay-ends-circle'

const ACCENT = { road: '#e8606d', air: '#3b82f6' }

const STYLE_FOR = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
}

const emptyLine = { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }

function lineFeature(coordinates) {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates } }
}

function endpointFeatures(coords) {
  if (coords.length === 0) return { type: 'FeatureCollection', features: [] }
  const ends = coords.length === 1 ? [coords[0]] : [coords[0], coords[coords.length - 1]]
  return {
    type: 'FeatureCollection',
    features: ends.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c } })),
  }
}

function markerElement() {
  const el = document.createElement('div')
  el.className = 'replay-marker'
  el.style.cssText = 'width:20px;height:20px;border-radius:50%;border:4px solid #fff;'
    + 'box-shadow:0 2px 8px rgba(24,26,33,.35);'
  return el
}

export default function RouteReplayMap({ points = [], cursor = 0, isAir = false, className }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const styleKeyRef = useRef(null)
  const [styleTick, setStyleTick] = useState(0)

  const resolved = useResolvedTheme()
  const accent = isAir ? ACCENT.air : ACCENT.road

  // Mapbox wants [lon, lat]; the API returns lat/lon named fields. Derived once
  // per trail so a playback tick never re-maps the whole array.
  const coords = useMemo(
    () => points.map(p => [p.longitude, p.latitude]),
    [points],
  )

  // ── Create the map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return undefined

    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_FOR[resolved],
      center: [72.8777, 19.076],
      zoom: 10,
      // Mapbox requires visible attribution; compact keeps it out of the way
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left')
    map.scrollZoom.disable()
    styleKeyRef.current = resolved

    // Fires on first load and again after every setStyle, which wipes layers.
    map.on('style.load', () => setStyleTick(t => t + 1))

    mapRef.current = map
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
    // Theme and data are handled by their own effects; this must run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Follow the app theme ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    // The map is built with the current theme's style, so only a later flip
    // needs setStyle — calling it on mount would discard the initial load.
    if (!map || styleKeyRef.current === resolved) return
    styleKeyRef.current = resolved
    map.setStyle(STYLE_FOR[resolved])
  }, [resolved])

  // ── Create sources and layers (once per style load) ────────────────────────
  // Gated on styleTick, which only advances from the `style.load` handler —
  // at that point addSource/addLayer are safe. Deliberately NOT gated on
  // isStyleLoaded(): that reports false until every basemap tile has finished
  // downloading, so it is false at style.load and this effect would never run
  // again, leaving the map an empty basemap.
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleTick === 0) return

    if (!map.getSource(SRC_TRAIL)) {
      map.addSource(SRC_TRAIL, { type: 'geojson', data: emptyLine })
      map.addSource(SRC_TRAVELLED, { type: 'geojson', data: emptyLine })
      map.addSource(SRC_ENDS, { type: 'geojson', data: endpointFeatures([]) })
    }
    if (!map.getLayer(LYR_TRAIL)) {
      map.addLayer({
        id: LYR_TRAIL,
        type: 'line',
        source: SRC_TRAIL,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 3, 'line-opacity': 0.28 },
      })
      map.addLayer({
        id: LYR_TRAVELLED,
        type: 'line',
        source: SRC_TRAVELLED,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 4, 'line-opacity': 0.95 },
      })
      map.addLayer({
        id: LYR_ENDS,
        type: 'circle',
        source: SRC_ENDS,
        paint: { 'circle-radius': 5, 'circle-stroke-width': 2.5 },
      })
    }
  }, [styleTick])

  // ── Keep paint in step with mode and theme ─────────────────────────────────
  // Separate from creation: selecting a different vehicle changes `accent` and
  // `isAir` without remounting, so colours set at creation time would stick.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(LYR_TRAIL)) return

    map.setPaintProperty(LYR_TRAIL, 'line-color', accent)
    map.setPaintProperty(LYR_TRAVELLED, 'line-color', accent)
    map.setPaintProperty(LYR_ENDS, 'circle-stroke-color', accent)
    map.setPaintProperty(
      LYR_ENDS, 'circle-color', resolved === 'dark' ? '#11131a' : '#ffffff',
    )
    // An air leg is a planned track, not a road — dashed reads as such
    map.setPaintProperty(LYR_TRAIL, 'line-dasharray', isAir ? [2, 2] : [1])

    if (markerRef.current) {
      markerRef.current.getElement().style.background = accent
    }
  }, [styleTick, accent, isAir, resolved])

  // ── Push the trail in ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource(SRC_TRAIL)) return

    map.getSource(SRC_TRAIL).setData(lineFeature(coords))
    map.getSource(SRC_ENDS).setData(endpointFeatures(coords))

    if (coords.length >= 2) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0]),
      )
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 600 })
    } else if (coords.length === 1) {
      map.easeTo({ center: coords[0], zoom: 13, duration: 600 })
    }
  }, [coords, styleTick])

  // ── Move the replay head ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource(SRC_TRAVELLED)) return

    const head = Math.min(cursor, coords.length - 1)

    // slice is exclusive, so +1 includes the point under the scrubber
    map.getSource(SRC_TRAVELLED).setData(lineFeature(coords.slice(0, head + 1)))

    if (head < 0) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      const el = markerElement()
      el.style.background = accent
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(coords[head])
        .addTo(map)
    } else {
      markerRef.current.setLngLat(coords[head])
    }
  }, [coords, cursor, accent, styleTick])

  if (!TOKEN) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-app-panel text-center px-6 ${className || ''}`}
      >
        <MapPinOff size={22} className="text-muted" />
        <p className="text-[13px] font-semibold text-heading">Map unavailable</p>
        <p className="text-[12px] text-muted max-w-xs">
          Set <code className="font-mono">VITE_MAPBOX_TOKEN</code> in your frontend environment to
          render the route replay.
        </p>
      </div>
    )
  }

  return <div ref={containerRef} className={className} />
}
