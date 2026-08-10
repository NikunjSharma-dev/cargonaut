import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPinOff, Loader2, AlertCircle } from 'lucide-react'
import { useResolvedTheme } from '../store/themeStore'
import api from '../utils/api'

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

const CARTO_STYLE = {
  dark: {
    version: 8,
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      },
    },
    layers: [
      {
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto-dark',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
  light: {
    version: 8,
    sources: {
      'carto-light': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
          'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      },
    },
    layers: [
      {
        id: 'carto-light-layer',
        type: 'raster',
        source: 'carto-light',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
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
  const isCartoRef = useRef(!TOKEN)
  const routeCacheRef = useRef(new Map())
  const [styleTick, setStyleTick] = useState(0)
  const [isFetchingRoute, setIsFetchingRoute] = useState(false)
  const [isFallback, setIsFallback] = useState(false)
  const [roadGeometry, setRoadGeometry] = useState(null)

  const resolved = useResolvedTheme()
  const accent = isAir ? ACCENT.air : ACCENT.road

  const coords = useMemo(
    () => points.map(p => [p.longitude, p.latitude]),
    [points],
  )

  // ── Create the map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    if (TOKEN && !isCartoRef.current) {
      mapboxgl.accessToken = TOKEN
    }

    const initialStyle = isCartoRef.current ? (CARTO_STYLE[resolved] || CARTO_STYLE.dark) : STYLE_FOR[resolved]

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: initialStyle,
      center: [72.8777, 19.076],
      zoom: 10,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left')
    map.scrollZoom.disable()
    styleKeyRef.current = resolved

    map.on('style.load', () => setStyleTick(t => t + 1))

    map.on('error', (e) => {
      const msg = e?.error?.message || e?.message || ''
      const status = e?.error?.status || e?.status
      if (!isCartoRef.current && (status === 401 || msg.includes('Token') || msg.includes('Not Authorized') || msg.includes('401'))) {
        isCartoRef.current = true
        map.setStyle(CARTO_STYLE[resolved] || CARTO_STYLE.dark)
      }
    })

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
    if (isCartoRef.current || !TOKEN) {
      map.setStyle(CARTO_STYLE[resolved] || CARTO_STYLE.dark)
    } else {
      map.setStyle(STYLE_FOR[resolved])
    }
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

  // Fetch true driving route geometry from Mapbox / Backend / OSRM API
  useEffect(() => {
    if (isAir || coords.length < 2) {
      setRoadGeometry(null)
      setIsFallback(false)
      setIsFetchingRoute(false)
      return
    }

    const waypointsToUse = coords.length > 25
      ? coords.filter((_, idx) => idx % Math.ceil(coords.length / 25) === 0 || idx === coords.length - 1)
      : coords

    const waypointsStr = waypointsToUse.map(c => `${c[0]},${c[1]}`).join(';')
    const cacheKey = `${profile}-${waypointsStr}`

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
      // 1. Direct Mapbox call if TOKEN exists
      if (TOKEN && !isCartoRef.current) {
        try {
          const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${waypointsStr}?geometries=geojson&overview=full&access_token=${TOKEN}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            if (data?.routes && data.routes[0]?.geometry?.coordinates) {
              const geom = data.routes[0].geometry.coordinates
              if (isMounted) {
                setRoadGeometry(geom)
                setIsFallback(false)
                setIsFetchingRoute(false)
                routeCacheRef.current.set(cacheKey, { geometry: geom, isFallback: false })
              }
              return
            }
          }
        } catch (_) {}
      }

      // 2. FastAPI backend proxy endpoint (which has OSRM fallback)
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
      } catch (_) {}

      // 3. Free public OSRM road routing API direct call
      try {
        const osrmProf = profile === 'driving' ? 'driving' : 'driving'
        const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProf}/${waypointsStr}?overview=full&geometries=geojson`
        const res = await fetch(osrmUrl)
        if (res.ok) {
          const data = await res.json()
          if (data?.routes && data.routes[0]?.geometry?.coordinates) {
            const geom = data.routes[0].geometry.coordinates
            if (isMounted) {
              setRoadGeometry(geom)
              setIsFallback(false)
              setIsFetchingRoute(false)
              routeCacheRef.current.set(cacheKey, { geometry: geom, isFallback: false })
            }
            return
          }
        }
      } catch (_) {}

      // 4. Straight line fallback
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
