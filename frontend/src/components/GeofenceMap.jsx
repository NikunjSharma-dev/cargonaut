import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPinOff } from 'lucide-react'
import { useResolvedTheme } from '../store/themeStore'
import { circleToRing } from '../utils/geofence'

/**
 * Mapbox map that renders saved geofences and captures a new one.
 *
 * Drawing is deliberately click-based rather than pulling in mapbox-gl-draw:
 * two shapes need two gestures, and the library is larger than the feature.
 *   circle  — click once to drop the centre, then size it with the radius input
 *   polygon — click each vertex, then Finish
 */

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

const SRC_SAVED = 'fences-saved'
const SRC_DRAFT = 'fence-draft'
const SRC_VERTICES = 'fence-draft-vertices'
const LYR_SAVED_FILL = 'fences-saved-fill'
const LYR_SAVED_LINE = 'fences-saved-line'
const LYR_DRAFT_FILL = 'fence-draft-fill'
const LYR_DRAFT_LINE = 'fence-draft-line'
const LYR_VERTICES = 'fence-draft-vertices-circle'

const DEFAULT_COLOUR = '#e8606d'
const DRAFT_COLOUR = '#3b82f6'

const STYLE_FOR = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function polygonFeature(ring, properties = {}) {
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } }
}

export default function GeofenceMap({
  fences = [],
  selectedId = null,
  drawMode = null,        // null | 'circle' | 'polygon'
  draftCentre = null,     // [lon, lat]
  draftRadiusM = 500,
  draftVertices = [],     // [[lon, lat], ...]
  onMapClick,
  className,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const clickRef = useRef(onMapClick)
  const styleKeyRef = useRef(null)
  const [styleTick, setStyleTick] = useState(0)

  const resolved = useResolvedTheme()

  // The click handler is registered once but must always call the latest
  // closure — drawMode and draft state change on every interaction.
  useEffect(() => { clickRef.current = onMapClick }, [onMapClick])

  const savedCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: fences
      .filter(f => Array.isArray(f.boundary) && f.boundary.length > 3)
      .map(f => polygonFeature(f.boundary, {
        id: f.id,
        colour: f.colour || DEFAULT_COLOUR,
        selected: f.id === selectedId,
        inactive: !f.is_active,
      })),
  }), [fences, selectedId])

  const draftCollection = useMemo(() => {
    if (drawMode === 'circle' && draftCentre) {
      return {
        type: 'FeatureCollection',
        features: [polygonFeature(circleToRing(draftCentre[1], draftCentre[0], draftRadiusM))],
      }
    }
    if (drawMode === 'polygon' && draftVertices.length >= 3) {
      return {
        type: 'FeatureCollection',
        features: [polygonFeature([...draftVertices, draftVertices[0]])],
      }
    }
    return EMPTY_FC
  }, [drawMode, draftCentre, draftRadiusM, draftVertices])

  const vertexCollection = useMemo(() => {
    const points = drawMode === 'circle' && draftCentre
      ? [draftCentre]
      : drawMode === 'polygon' ? draftVertices : []
    return {
      type: 'FeatureCollection',
      features: points.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c } })),
    }
  }, [drawMode, draftCentre, draftVertices])

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
    map.on('style.load', () => setStyleTick(t => t + 1))
    map.on('click', e => clickRef.current?.([e.lngLat.lng, e.lngLat.lat]))
    styleKeyRef.current = resolved

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Follow the app theme ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleKeyRef.current === resolved) return
    styleKeyRef.current = resolved
    map.setStyle(STYLE_FOR[resolved])
  }, [resolved])

  // ── Create sources and layers (once per style load) ────────────────────────
  // See RouteReplayMap: isStyleLoaded() is false until every tile lands, so
  // guarding on it here would leave the map permanently empty.
  useEffect(() => {
    const map = mapRef.current
    if (!map || styleTick === 0) return

    if (!map.getSource(SRC_SAVED)) {
      map.addSource(SRC_SAVED, { type: 'geojson', data: EMPTY_FC })
      map.addSource(SRC_DRAFT, { type: 'geojson', data: EMPTY_FC })
      map.addSource(SRC_VERTICES, { type: 'geojson', data: EMPTY_FC })
    }
    if (!map.getLayer(LYR_SAVED_FILL)) {
      map.addLayer({
        id: LYR_SAVED_FILL,
        type: 'fill',
        source: SRC_SAVED,
        paint: {
          'fill-color': ['get', 'colour'],
          'fill-opacity': [
            'case',
            ['get', 'inactive'], 0.05,
            ['get', 'selected'], 0.3,
            0.14,
          ],
        },
      })
      map.addLayer({
        id: LYR_SAVED_LINE,
        type: 'line',
        source: SRC_SAVED,
        paint: {
          'line-color': ['get', 'colour'],
          'line-width': ['case', ['get', 'selected'], 3, 1.5],
          'line-opacity': ['case', ['get', 'inactive'], 0.35, 0.9],
          'line-dasharray': ['case', ['get', 'inactive'], ['literal', [2, 2]], ['literal', [1]]],
        },
      })
      map.addLayer({
        id: LYR_DRAFT_FILL,
        type: 'fill',
        source: SRC_DRAFT,
        paint: { 'fill-color': DRAFT_COLOUR, 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: LYR_DRAFT_LINE,
        type: 'line',
        source: SRC_DRAFT,
        paint: { 'line-color': DRAFT_COLOUR, 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
      })
      map.addLayer({
        id: LYR_VERTICES,
        type: 'circle',
        source: SRC_VERTICES,
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': DRAFT_COLOUR,
        },
      })
    }
  }, [styleTick])

  // ── Push data in ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource(SRC_SAVED)) return
    map.getSource(SRC_SAVED).setData(savedCollection)
  }, [savedCollection, styleTick])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource(SRC_DRAFT)) return
    map.getSource(SRC_DRAFT).setData(draftCollection)
    map.getSource(SRC_VERTICES).setData(vertexCollection)
  }, [draftCollection, vertexCollection, styleTick])

  // ── Frame the selected fence ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const fence = fences.find(f => f.id === selectedId)
    if (!fence?.boundary?.length) return

    const bounds = fence.boundary.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(fence.boundary[0], fence.boundary[0]),
    )
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 })
  }, [selectedId, fences])

  // Drawing should feel like drawing
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = drawMode ? 'crosshair' : ''
  }, [drawMode, styleTick])

  if (!TOKEN) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-app-panel text-center px-6 ${className || ''}`}>
        <MapPinOff size={22} className="text-muted" />
        <p className="text-[13px] font-semibold text-heading">Map unavailable</p>
        <p className="text-[12px] text-muted max-w-xs">
          Set <code className="font-mono">VITE_MAPBOX_TOKEN</code> to draw and view geofences.
        </p>
      </div>
    )
  }

  return <div ref={containerRef} className={className} />
}
