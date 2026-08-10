import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPinOff, Loader2, AlertCircle } from 'lucide-react'
import { useResolvedTheme } from '../store/themeStore'
import api from '../utils/api'

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

export default function RouteReplayMap({ points = [], cursor = 0, isAir = false, profile = 'driving', className }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const styleKeyRef = useRef(null)
  const routeCacheRef = useRef(new Map())
  const [styleTick, setStyleTick] = useState(0)
  const [isFetchingRoute, setIsFetchingRoute] = useState(false)
  const [isFallback, setIsFallback] = useState(false)
  const [roadGeometry, setRoadGeometry] = useState(null)

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
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left')
    map.scrollZoom.disable()
    styleKeyRef.current = resolved

    map.on('style.load', () => setStyleTick(t => t + 1))

    mapRef.current = map
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Follow the app theme ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleKeyRef.current === resolved) return
    styleKeyRef.current = resolved
    map.setStyle(STYLE_FOR[resolved])
  }, [resolved])

  // ── Create sources and layers (once per style load) ────────────────────────
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

  // Fetch true driving route geometry from Mapbox Directions API (with caching & fallback)
  useEffect(() => {
    if (isAir || coords.length < 2) {
      setRoadGeometry(null)
      setIsFallback(false)
      setIsFetchingRoute(false)
      return
    }

    // Limit to max 25 waypoints per Mapbox Directions API limits
    const waypointsToUse = coords.length > 25
      ? coords.filter((_, idx) => idx % Math.ceil(coords.length / 25) === 0 || idx === coords.length - 1)
      : coords

    const waypointsStr = waypointsToUse.map(c => `${c[0]},${c[1]}`).join(';')
    const cacheKey = `${profile}-${waypointsStr}`

    // Check memory cache first
    if (routeCacheRef.current.has(cacheKey)) {
      const cached = routeCacheRef.current.get(cacheKey)
      setRoadGeometry(cached.geometry)
      setIsFallback(cached.isFallback)
      setIsFetchingRoute(false)
      return
    }

    let isMounted = true
    setIsFetchingRoute(true)
    setIsFallback(false)

    async function fetchDirections() {
      // 1. Try Mapbox Directions API directly
      if (TOKEN) {
        try {
          const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${waypointsStr}?geometries=geojson&overview=full&access_token=${TOKEN}`
          const res = await fetch(url)
          const data = await res.json()
          if (data.routes && data.routes[0]?.geometry?.coordinates) {
            const geom = data.routes[0].geometry.coordinates
            if (isMounted) {
              setRoadGeometry(geom)
              setIsFallback(false)
              setIsFetchingRoute(false)
              routeCacheRef.current.set(cacheKey, { geometry: geom, isFallback: false })
            }
            return
          }
        } catch (e) {
          // Direct fetch failed, fallback to backend proxy
        }
      }

      // 2. Try FastAPI backend proxy endpoint
      try {
        const res = await api.get('/dispatch/route-geometry', {
          params: { waypoints: waypointsStr, profile, overview: 'full' },
        })
        if (res.data?.coordinates && res.data.coordinates.length > 0) {
          const geom = res.data.coordinates
          if (isMounted) {
            setRoadGeometry(geom)
            setIsFallback(false)
            setIsFetchingRoute(false)
            routeCacheRef.current.set(cacheKey, { geometry: geom, isFallback: false })
          }
          return
        }
      } catch (e) {
        // Proxy fetch failed
      }

      // 3. Fallback to straight line with dashed styling
      if (isMounted) {
        setRoadGeometry(null)
        setIsFallback(true)
        setIsFetchingRoute(false)
        routeCacheRef.current.set(cacheKey, { geometry: null, isFallback: true })
      }
    }

    fetchDirections()

    return () => {
      isMounted = false
    }
  }, [coords, isAir, profile])

  const activeCoords = (!isAir && roadGeometry && roadGeometry.length > 0) ? roadGeometry : coords

  // ── Keep paint in step with mode, theme & fallback state ────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(LYR_TRAIL)) return

    map.setPaintProperty(LYR_TRAIL, 'line-color', accent)
    map.setPaintProperty(LYR_TRAVELLED, 'line-color', accent)
    map.setPaintProperty(LYR_ENDS, 'circle-stroke-color', accent)
    map.setPaintProperty(
      LYR_ENDS, 'circle-color', resolved === 'dark' ? '#11131a' : '#ffffff',
    )
    // Dashed for air OR straight-line fallback
    map.setPaintProperty(LYR_TRAIL, 'line-dasharray', (isAir || isFallback) ? [3, 3] : [1])

    if (markerRef.current) {
      markerRef.current.getElement().style.background = accent
    }
  }, [styleTick, accent, isAir, isFallback, resolved])

  // ── Push the trail in ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource(SRC_TRAIL)) return

    map.getSource(SRC_TRAIL).setData(lineFeature(activeCoords))
    map.getSource(SRC_ENDS).setData(endpointFeatures(activeCoords))

    if (activeCoords.length >= 2) {
      const bounds = activeCoords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(activeCoords[0], activeCoords[0]),
      )
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 600 })
    } else if (activeCoords.length === 1) {
      map.easeTo({ center: activeCoords[0], zoom: 13, duration: 600 })
    }
  }, [activeCoords, styleTick])

  // ── Move the replay head ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource(SRC_TRAVELLED)) return

    const ratio = coords.length > 1 ? cursor / (coords.length - 1) : 0
    const head = Math.min(Math.round(ratio * (activeCoords.length - 1)), activeCoords.length - 1)

    map.getSource(SRC_TRAVELLED).setData(lineFeature(activeCoords.slice(0, head + 1)))

    if (head < 0 || activeCoords.length === 0) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      const el = markerElement()
      el.style.background = accent
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(activeCoords[head])
        .addTo(map)
    } else {
      markerRef.current.setLngLat(activeCoords[head])
    }
  }, [activeCoords, coords, cursor, accent, styleTick])

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

  return (
    <div className={`relative ${className || ''}`}>
      <div ref={containerRef} className="w-full h-full" />
      {isFetchingRoute && !isAir && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-app-surface/90 border border-app-border backdrop-blur shadow-md text-xs font-semibold text-heading animate-pulse">
          <Loader2 size={13} className="animate-spin text-primary" />
          <span>Snapping to roads...</span>
        </div>
      )}
      {isFallback && !isAir && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-app-surface/90 border border-app-border backdrop-blur text-[11px] font-medium text-subtle shadow-xs">
          <AlertCircle size={12} className="text-amber-400" />
          <span>Dashed straight-line fallback</span>
        </div>
      )}
    </div>
  )
}
