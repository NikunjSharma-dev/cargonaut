import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Phone, MessageSquare, Pencil, Camera, Maximize2, MapPin, Truck as TruckIcon,
  Plane, Gauge, Sparkles,
} from 'lucide-react'
import api from '../utils/api'
import clsx from 'clsx'
import VehicleGraphic from '../components/VehicleGraphic'
import RouteReplayMap from '../components/RouteReplayMap'
import RouteScrubber from '../components/RouteScrubber'
import {
  MODE_LIST, modeMeta, cargoMeta, chargeableWeightKg, isVolumetric,
} from '../utils/cargo'

/**
 * Normalise a demo card's static routePath into the same point shape the
 * tracking API returns, so the replay control has one input format.
 * Timestamps are spaced evenly backwards from now purely to give the scrubber
 * a readable clock — demo cards carry no real telemetry.
 */
function pathToPoints(routePath = [], minutesApart = 12) {
  const end = Date.now()
  const step = minutesApart * 60_000
  const origin = end - step * Math.max(routePath.length - 1, 0)
  return routePath.map(([latitude, longitude], i) => ({
    latitude,
    longitude,
    speed_kmh: null,
    heading: null,
    timestamp: new Date(origin + i * step).toISOString(),
  }))
}

const FLEET = [
  {
    id: 'RE-74ER453TR5', partner: 'Shiphike - For Packages', variant: 'box', mode: 'road',
    status: 'on_route', seconds: 9 * 3600 + 47 * 60 + 24, minsLeft: 58,
    driverName: 'Vikram Singh', driverPhone: '+91 98230 11204', depot: 'North Hub Depot',
    type: 'Medium Box Truck (12T)', capacityPct: 74, loadKg: 8900, maxKg: 12000,
    cargoType: 'parcel', pieces: 640, volumeM3: 26,
    stops: ['475 Broadus', '377 Hammond', '247 Coalwood', '687 Volborg', '874 Beebe'],
    activeStop: 3, currentLoc: [19.076, 72.8777],
    routePath: [
      [19.0200, 72.8400], [19.0340, 72.8450], [19.0510, 72.8520], [19.0650, 72.8640],
      [19.0760, 72.8777], [19.0950, 72.8880], [19.1120, 72.8980], [19.1350, 72.9200],
      [19.1650, 72.9450], [19.2000, 72.9700]
    ],
  },
  {
    id: 'YR-34DFR734W2', partner: 'Roambee', variant: 'semi', mode: 'road',
    status: 'on_route', seconds: 1 * 3600 + 38 * 60 + 47, minsLeft: 57,
    driverName: 'Amit Sharma', driverPhone: '+91 98112 44321', depot: 'Capital Gateway',
    type: 'Heavy Freight Semi (24T)', capacityPct: 82, loadKg: 18400, maxKg: 22000,
    cargoType: 'palletized', pieces: 38, volumeM3: 61,
    stops: ['074 Rosebud', '159 Thurlow', '357 Hathaway', '854 Sheffield', '712 Miles City'],
    activeStop: 2, currentLoc: [28.6139, 77.209],
    routePath: [
      [28.5562, 77.1000], [28.5680, 77.1210], [28.5790, 77.1420], [28.5890, 77.1630],
      [28.6010, 77.1850], [28.6139, 77.2090], [28.6250, 77.2180], [28.6380, 77.2280],
      [28.6510, 77.2410], [28.6600, 77.2500]
    ],
  },
  {
    id: 'CG412 · VT-CGN', partner: 'Cargonaut Air', variant: 'freighter', mode: 'air',
    status: 'on_route', seconds: 2 * 3600 + 12 * 60 + 5, minsLeft: 132,
    driverName: 'Capt. Neha Iyer', driverPhone: '+91 99204 77311', depot: 'BOM Air Cargo Terminal',
    type: 'Boeing 777F (112T)', capacityPct: 68, loadKg: 76200, maxKg: 112000,
    cargoType: 'refrigerated', pieces: 412, volumeM3: 580,
    tailNumber: 'VT-CGN', flightNumber: 'CG412', awb: '731-40028115',
    uldUsed: 25, uldTotal: 37, altitudeFt: 34000, groundSpeedKmh: 812,
    originIata: 'BOM', destIata: 'DEL',
    stops: ['BOM ramp build-up', 'BOM departure', 'En route FL340', 'DEL arrival', 'DEL breakdown'],
    activeStop: 2, currentLoc: [23.8, 74.9],
    routePath: [[19.0896, 72.8656], [21.4, 73.9], [23.8, 74.9], [26.2, 76.0], [28.5562, 77.1]],
  },
  {
    id: 'DW-847DE74E4R', partner: 'Post Hawk', variant: 'van', mode: 'road',
    status: 'on_route', seconds: 1 * 3600 + 38 * 60 + 47, minsLeft: 78,
    driverName: 'Rajesh Kumar', driverPhone: '+91 97401 55902', depot: 'Tech Hub South',
    type: 'Panel Cargo Van (3.5T)', capacityPct: 61, loadKg: 2100, maxKg: 3500,
    cargoType: 'general', pieces: 96, volumeM3: 11,
    stops: ['874 Sheridan', '589 Ucross', '967 Clearmont', '474 Leiter', '377 Kendrick'],
    activeStop: 1, currentLoc: [12.9716, 77.5946],
    routePath: [
      [12.9150, 77.5350], [12.9320, 77.5520], [12.9510, 77.5730], [12.9716, 77.5946],
      [12.9920, 77.6110], [13.0200, 77.6300]
    ],
  },
  {
    id: 'CG208 · VT-CGF', partner: 'Cargonaut Air', variant: 'turboprop', mode: 'air',
    status: 'on_route', seconds: 47 * 60 + 19, minsLeft: 47,
    driverName: 'Capt. Arjun Menon', driverPhone: '+91 98452 20719', depot: 'BLR Cargo Village',
    type: 'ATR 72-600F (8.6T)', capacityPct: 91, loadKg: 7800, maxKg: 8600,
    cargoType: 'high_value', pieces: 6, volumeM3: 1.2,
    tailNumber: 'VT-CGF', flightNumber: 'CG208', awb: '731-40028116',
    uldUsed: 6, uldTotal: 6, altitudeFt: 21000, groundSpeedKmh: 486,
    originIata: 'BLR', destIata: 'BOM',
    stops: ['BLR build-up', 'BLR departure', 'En route FL210', 'BOM arrival'],
    activeStop: 2, currentLoc: [16.2, 75.1],
    routePath: [[13.1986, 77.7066], [15.1, 76.2], [16.2, 75.1], [19.0896, 72.8656]],
  },
  {
    id: 'AQ-257DRE141E', partner: 'Loginext', variant: 'van', mode: 'road',
    status: 'waiting', seconds: 3 * 3600 + 29 * 60 + 58, minsLeft: 29,
    driverName: 'Sunil Patil', driverPhone: '+91 90045 88123', depot: 'West Cargo Yard',
    type: 'Compact Delivery Van (1.5T)', capacityPct: 38, loadKg: 570, maxKg: 1500,
    cargoType: 'fragile', pieces: 24, volumeM3: 4.5,
    stops: ['125 Kinsey', '654 Saugus', '789 Fallon', '577 Glendive'],
    activeStop: 0, currentLoc: [18.5204, 73.8567],
    routePath: [
      [18.4900, 73.8200], [18.5080, 73.8410], [18.5204, 73.8567], [18.5420, 73.8780], [18.5600, 73.9000]
    ],
  },
  {
    id: 'BG-ER74R6984R', partner: 'Forwardo', variant: 'box', mode: 'road',
    status: 'on_route', seconds: 28 * 60 + 38, minsLeft: 88,
    driverName: 'Manish Rao', driverPhone: '+91 99870 21118', depot: 'North Hub Depot',
    type: 'Medium Box Truck (12T)', capacityPct: 90, loadKg: 10800, maxKg: 12000,
    cargoType: 'refrigerated', pieces: 210, volumeM3: 30,
    stops: ['369 Cohagen', '258 Hillside', '147 Rock Springs', '268 Angela'],
    activeStop: 3, currentLoc: [23.0225, 72.5714],
    routePath: [
      [22.9500, 72.4900], [22.9800, 72.5200], [23.0050, 72.5480], [23.0225, 72.5714],
      [23.0550, 72.6000], [23.0800, 72.6300]
    ],
  },
  {
    id: 'CV-414ER58SER', partner: 'Lopez Pallets', variant: 'semi', mode: 'road',
    status: 'waiting', seconds: 2 * 3600 + 38 * 60 + 47, minsLeft: 18,
    driverName: 'Iqbal Khan', driverPhone: '+91 98765 40021', depot: 'East Terminal',
    type: 'Heavy Freight Semi (24T)', capacityPct: 55, loadKg: 12100, maxKg: 22000,
    cargoType: 'liquid_bulk', pieces: 1, volumeM3: 24,
    stops: ['536 Dickinson', '469 Belfield', '641 Medora', '279 Wibaux'],
    activeStop: 0, currentLoc: [22.5726, 88.3639],
    routePath: [
      [22.5400, 88.3400], [22.5580, 88.3520], [22.5726, 88.3639], [22.5950, 88.3850], [22.6200, 88.4100]
    ],
  },
  {
    id: 'CG377 · VT-CGN', partner: 'Cargonaut Air', variant: 'freighter', mode: 'air',
    status: 'waiting', seconds: 1 * 3600 + 5 * 60 + 12, minsLeft: 65,
    driverName: 'Capt. Neha Iyer', driverPhone: '+91 99204 77311', depot: 'DEL Air Freight Station',
    type: 'Boeing 777F (112T)', capacityPct: 34, loadKg: 38100, maxKg: 112000,
    cargoType: 'hazmat', pieces: 18, volumeM3: 140,
    tailNumber: 'VT-CGN', flightNumber: 'CG377', awb: '731-40028117', hazmatUnCode: 'UN1263',
    uldUsed: 13, uldTotal: 37, altitudeFt: 0, groundSpeedKmh: 0,
    originIata: 'DEL', destIata: 'BLR',
    stops: ['DEL acceptance', 'DGR check', 'ULD build-up', 'Awaiting slot'],
    activeStop: 2, currentLoc: [28.5562, 77.1],
    routePath: [[28.5562, 77.1], [13.1986, 77.7066]],
  },
  {
    id: 'MN-88TR2091KL', partner: 'Sonosolve', variant: 'box', mode: 'road',
    status: 'inactive', seconds: 0, minsLeft: 0,
    driverName: 'Deepak Nair', driverPhone: '+91 90876 33420', depot: 'South Depot',
    type: 'Medium Box Truck (12T)', capacityPct: 0, loadKg: 0, maxKg: 12000,
    cargoType: 'general', pieces: 0, volumeM3: 0,
    stops: ['902 Ekalaka', '188 Alzada'],
    activeStop: 0, currentLoc: [17.385, 78.4867],
    routePath: [
      [17.3500, 78.4400], [17.3710, 78.4680], [17.3850, 78.4867], [17.4050, 78.5020], [17.4200, 78.5200]
    ],
  },
  {
    id: 'PL-63DD1174QW', partner: 'Shiphike - For Packages', variant: 'van', mode: 'road',
    status: 'inactive', seconds: 0, minsLeft: 0,
    driverName: 'Farhan Ali', driverPhone: '+91 93456 77210', depot: 'West Cargo Yard',
    type: 'Panel Cargo Van (3.5T)', capacityPct: 0, loadKg: 0, maxKg: 3500,
    cargoType: 'general', pieces: 0, volumeM3: 0,
    stops: ['411 Broadus', '332 Otter'],
    activeStop: 0, currentLoc: [26.9124, 75.7873],
    routePath: [
      [26.8700, 75.7400], [26.8920, 75.7650], [26.9124, 75.7873], [26.9350, 75.8100], [26.9500, 75.8300]
    ],
  },
]

const CARGO_PHOTOS = [
  { id: 1, url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&q=80', label: 'Point #1 Cargo Photo', place: '712 Miles City', time: '01:35 PM' },
  { id: 2, url: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80', label: 'Point #2 Cargo Photo', place: '854 Sheffield', time: '02:10 PM' },
  { id: 3, url: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=400&q=80', label: 'Point #3 Cargo Photo', place: '357 Hathaway', time: '02:40 PM' },
]

const TABS = [
  { key: 'shipping', label: 'Shipping Info' },
  { key: 'cargo', label: 'Cargo' },
  { key: 'vehicle', label: 'Asset Info' },
  { key: 'docs', label: 'Documents' },
  { key: 'company', label: 'Company' },
  { key: 'billing', label: 'Billing' },
]

function formatClock(totalSeconds) {
  const s = Math.max(0, totalSeconds)
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${sec}`
}

function StatusDot({ status }) {
  const on = status === 'on_route'
  const inactive = status === 'inactive'
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap">
      <span className="relative flex w-2.5 h-2.5">
        {on && <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-60 animate-ping" />}
        <span
          className={clsx(
            'relative w-2.5 h-2.5 rounded-full ring-2',
            on && 'bg-emerald-500 ring-emerald-100',
            !on && !inactive && 'bg-primary ring-primary-soft',
            inactive && 'bg-slate-300 ring-slate-100'
          )}
        />
      </span>
      <span className={clsx(on ? 'text-body' : inactive ? 'text-subtle' : 'text-primary')}>
        {on ? 'On Route' : inactive ? 'Inactive' : 'Waiting'}
      </span>
    </span>
  )
}

/** Road / air pill — the first thing a dispatcher needs off a mixed fleet list. */
export function ModePill({ mode, className = '' }) {
  const meta = modeMeta(mode)
  const Icon = meta.icon
  return (
    <span className={clsx('mode-pill', meta.tone, className)}>
      <Icon size={12} strokeWidth={2.4} />
      {meta.short}
    </span>
  )
}

/** What is in the load, colour-coded by handling class. */
export function CargoChip({ type, className = '', showIcon = true }) {
  const meta = cargoMeta(type)
  const Icon = meta.icon
  return (
    <span className={clsx('cargo-chip', meta.tone, className)}>
      {showIcon && <Icon size={12} strokeWidth={2.2} />}
      {meta.label}
    </span>
  )
}

/** Timer + waypoint strip shown inside every fleet card and the detail header */
function StopsPanel({ vehicle, elapsed }) {
  return (
    <div className="flex items-stretch gap-2.5 bg-app-panel border border-app-border rounded-xl p-2.5">
      <div className="flex flex-col justify-center min-w-[66px]">
        <span className="font-mono text-[12.5px] font-semibold text-heading tracking-tighter tabular-nums">
          {formatClock(vehicle.seconds - elapsed)}
        </span>
        <span className="text-[10.5px] text-muted mt-1.5">{vehicle.minsLeft} min. left</span>
      </div>

      <div className="w-px bg-app-border" />

      <ul className="flex-1 min-w-0 space-y-[3px]">
        {vehicle.stops.map((stop, i) => {
          const reached = i <= vehicle.activeStop
          return (
            <li key={stop} className="flex items-center gap-2">
              <span className="relative flex justify-center w-2.5 flex-shrink-0">
                {i < vehicle.stops.length - 1 && (
                  <span className={clsx('absolute top-2 h-[9px] w-px', reached ? 'bg-primary/60' : 'bg-slate-200')} />
                )}
                <span
                  className={clsx(
                    'w-[7px] h-[7px] rounded-full',
                    i === vehicle.activeStop
                      ? 'bg-primary ring-2 ring-primary/20'
                      : reached ? 'bg-primary/70' : 'bg-slate-300'
                  )}
                />
              </span>
              <span className={clsx('text-[10.5px] truncate', reached ? 'text-body' : 'text-subtle')}>
                {stop}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="bg-app-panel border border-app-border rounded-xl px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</dt>
      <dd className="text-[14px] font-semibold text-heading mt-1">{value}</dd>
    </div>
  )
}

export default function TrackingPage() {
  const [partnerFilter, setPartnerFilter] = useState(null)
  const [modeFilter, setModeFilter] = useState('all')       // all | road | air
  const [cargoFilter, setCargoFilter] = useState(null)
  const [showFilter, setShowFilter] = useState('all')       // active | inactive | all
  const [selectedId, setSelectedId] = useState(FLEET[2].id)
  const [activeTab, setActiveTab] = useState('shipping')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [elapsed, setElapsed] = useState(0)

  // Live countdown shared by every timer on the page
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useQuery({
    queryKey: ['live-drivers'],
    queryFn: () => api.get('/tracking/drivers/live').then(r => r.data),
    refetchInterval: 15_000,
  })

  const partners = useMemo(() => {
    const counts = new Map()
    FLEET.forEach(v => counts.set(v.partner, (counts.get(v.partner) || 0) + 1))
    return [...counts.entries()].map(([name, count]) => ({ name, count }))
  }, [])

  const modeCounts = useMemo(() => ({
    road: FLEET.filter(v => v.mode === 'road').length,
    air: FLEET.filter(v => v.mode === 'air').length,
    all: FLEET.length,
  }), [])

  // Only offer cargo types the fleet is actually carrying right now
  const cargoFilters = useMemo(() => {
    const counts = new Map()
    FLEET.forEach(v => counts.set(v.cargoType, (counts.get(v.cargoType) || 0) + 1))
    return [...counts.entries()].map(([key, count]) => ({ key, count, meta: cargoMeta(key) }))
  }, [])

  const showCounts = useMemo(() => ({
    active: FLEET.filter(v => v.status !== 'inactive').length,
    inactive: FLEET.filter(v => v.status === 'inactive').length,
    all: FLEET.length,
  }), [])

  const visibleFleet = useMemo(() => FLEET.filter(v => {
    if (partnerFilter && v.partner !== partnerFilter) return false
    if (modeFilter !== 'all' && v.mode !== modeFilter) return false
    if (cargoFilter && v.cargoType !== cargoFilter) return false
    if (showFilter === 'active' && v.status === 'inactive') return false
    if (showFilter === 'inactive' && v.status !== 'inactive') return false
    if (query && !v.id.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [partnerFilter, modeFilter, cargoFilter, showFilter, query])

  const selected = FLEET.find(v => v.id === selectedId) || visibleFleet[0] || FLEET[0]
  const isAir = selected.mode === 'air'

  // ── Route replay ───────────────────────────────────────────────────────────
  // A fleet card matches a registered vehicle by registration number; when it
  // does, the breadcrumb comes from the tracking API. Demo-only cards fall back
  // to their static routePath so the replay control still has something to run.
  const { data: vehicles, isError: vehiclesFailed } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get('/vehicles/').then(r => r.data),
    retry: false,
  })

  const liveVehicleId = useMemo(
    () => vehicles?.find(v => v.registration_number === selected.id)?.id ?? null,
    [vehicles, selected.id],
  )

  const { data: track, isLoading: trackLoading } = useQuery({
    queryKey: ['vehicle-track', liveVehicleId],
    queryFn: () => api.get(`/tracking/vehicles/${liveVehicleId}/history`).then(r => r.data),
    enabled: Boolean(liveVehicleId),
    retry: false,
  })

  const replayPoints = useMemo(
    () => (track?.points?.length ? track.points : pathToPoints(selected.routePath)),
    [track, selected.routePath],
  )
  const replayIsLive = Boolean(track?.points?.length)

  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(1)

  // A new trail opens fully drawn with the head on the newest fix — this is a
  // live tracking screen, so the default view is "where is it now", not the
  // start of yesterday. Pressing play rewinds and replays from the beginning.
  useEffect(() => {
    setPlaying(false)
    setCursor(Math.max(replayPoints.length - 1, 0))
  }, [replayPoints])

  const selectedCargo = cargoMeta(selected.cargoType)
  const chargeable = chargeableWeightKg(selected.loadKg, selected.volumeM3, selected.mode)
  const billedOnVolume = isVolumetric(selected.loadKg, selected.volumeM3, selected.mode)

  const etaQuery = useQuery({
    queryKey: ['predict-eta', selected.id, selected.loadKg, selected.mode],
    queryFn: () => api.post('/predict/eta', {
      distance_km: 120.0,
      stops_count: selected.stops?.length || 1,
      cargo_weight_kg: selected.loadKg || 500.0,
      transport_mode: selected.mode || 'road',
    }).then(r => r.data),
    enabled: Boolean(selected),
  })

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-app-panel">
      {/* ---------- Middle column: fleet list ---------- */}
      <section className="w-full lg:w-[46%] xl:w-[44%] flex-shrink-0 flex flex-col min-h-0 border-r border-app-border">
        <div className="px-6 pt-6 pb-4 space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-[30px] leading-none font-extrabold text-heading font-display tracking-tight">
              Tracking
            </h1>
            <div className="flex items-center gap-2">
              {searchOpen && (
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search vehicle / flight..."
                  className="input h-9 w-44 text-xs"
                />
              )}
              <button
                onClick={() => { setSearchOpen(o => !o); setQuery('') }}
                className="p-2 rounded-full text-subtle hover:text-primary hover:bg-primary-soft transition-colors"
                title="Search fleet"
              >
                <Search size={20} />
              </button>
            </div>
          </div>

          {/* Transport mode — the primary split of the fleet */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'all', label: 'All cargo', count: modeCounts.all, icon: null },
              { key: 'road', label: modeMeta('road').short, count: modeCounts.road, icon: modeMeta('road').icon },
              { key: 'air', label: modeMeta('air').short, count: modeCounts.air, icon: modeMeta('air').icon },
            ].map(opt => {
              const Icon = opt.icon
              const active = modeFilter === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => setModeFilter(opt.key)}
                  className={clsx('mode-tab', active && 'active')}
                >
                  {Icon && <Icon size={14} strokeWidth={active ? 2.4 : 2} className="flex-shrink-0" />}
                  <span>{opt.label}</span>
                  <span className="chip-count">{String(opt.count).padStart(2, '0')}</span>
                </button>
              )
            })}
          </div>

          <div className="space-y-2">
            <p className="text-[13px] text-muted font-medium">Cargo type</p>
            <div className="flex flex-wrap gap-2">
              {cargoFilters.map(c => {
                const Icon = c.meta.icon
                return (
                  <button
                    key={c.key}
                    onClick={() => setCargoFilter(cur => (cur === c.key ? null : c.key))}
                    className={clsx('chip', cargoFilter === c.key && 'active')}
                  >
                    <Icon size={13} className="flex-shrink-0" />
                    {c.meta.label}
                    <span className="chip-count">{String(c.count).padStart(2, '0')}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] text-muted font-medium">Filter by Partners</p>
            <div className="flex flex-wrap gap-2">
              {partners.map(p => (
                <button
                  key={p.name}
                  onClick={() => setPartnerFilter(cur => (cur === p.name ? null : p.name))}
                  className={clsx('chip', partnerFilter === p.name && 'active')}
                >
                  {p.name}
                  <span className="chip-count">{String(p.count).padStart(2, '0')}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] text-muted font-medium">Show</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'active', label: 'Active', count: showCounts.active },
                { key: 'inactive', label: 'Inactive', count: showCounts.inactive },
                { key: 'all', label: 'All', count: showCounts.all },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setShowFilter(opt.key)}
                  className={clsx('chip', showFilter === opt.key && 'active')}
                >
                  {opt.label}
                  <span className="chip-count">{String(opt.count).padStart(2, '0')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fleet cards */}
        <div className="flex-1 overflow-y-auto px-6 pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleFleet.map(vehicle => {
              const isSelected = vehicle.id === selectedId
              return (
                <button
                  key={vehicle.id}
                  onClick={() => setSelectedId(vehicle.id)}
                  className={clsx(
                    'text-left bg-app-surface rounded-2xl p-3.5 transition-all duration-200 flex flex-col gap-3',
                    isSelected
                      ? 'border-2 border-primary shadow-floating'
                      : 'border-2 border-transparent shadow-card hover:shadow-card-hover'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-bold text-heading font-display tracking-tight truncate">
                      {vehicle.id}
                    </span>
                    <StatusDot status={vehicle.status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <ModePill mode={vehicle.mode} />
                    <CargoChip type={vehicle.cargoType} />
                  </div>

                  <StopsPanel vehicle={vehicle} elapsed={elapsed} />

                  <VehicleGraphic variant={vehicle.variant} className="w-full max-w-[300px] self-center h-auto mt-1" />
                </button>
              )
            })}
          </div>

          {visibleFleet.length === 0 && (
            <div className="text-center py-16 text-sm text-muted">
              No vehicles match the current filters.
            </div>
          )}
        </div>
      </section>

      {/* ---------- Right column: selected vehicle detail ---------- */}
      <section className="flex-1 min-w-0 flex flex-col min-h-0 bg-app-surface">
        {/* Header */}
        <div className="px-6 pt-6 pb-0 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[26px] leading-none font-extrabold text-heading font-display tracking-tight">
                {selected.id}
              </h2>
              <StatusDot status={selected.status} />
              <ModePill mode={selected.mode} />
              <CargoChip type={selected.cargoType} />
            </div>

            <div className="flex items-center gap-2.5">
              <a href={`tel:${selected.driverPhone.replace(/\s/g, '')}`} className="btn-secondary text-[13px]">
                <Phone size={16} /> Call {isAir ? 'Crew' : 'Driver'}
              </a>
              <button className="btn-primary text-[13px]">
                <MessageSquare size={16} /> Chat with {isAir ? 'Crew' : 'Driver'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 mt-5 border-b border-app-border overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'px-4 py-3 text-[14px] font-semibold border-b-[3px] -mb-px transition-colors whitespace-nowrap',
                  activeTab === tab.key
                    ? 'border-primary text-heading'
                    : 'border-transparent text-muted hover:text-heading'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {activeTab === 'shipping' && (
            <>
              {/* Capacity */}
              <section className="space-y-3">
                <h3 className="text-[17px] font-bold text-heading font-display">
                  {isAir ? 'Current Main Deck Load' : 'Current Truck Capacity'}
                </h3>
                <div className="flex items-center justify-center">
                  <VehicleGraphic
                    variant={selected.variant}
                    fillPercent={selected.capacityPct}
                    showLabel
                    className="w-full max-w-[620px] h-auto"
                  />
                </div>
                <p className="text-[12px] text-muted text-center">
                  {selected.loadKg.toLocaleString()} kg loaded of {selected.maxKg.toLocaleString()} kg capacity
                  {isAir && selected.uldTotal
                    ? ` · ${selected.uldUsed} of ${selected.uldTotal} ULD positions built up`
                    : ''}
                </p>
              </section>

              {/* Route + map */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
                  <h3 className="text-[17px] font-bold text-heading font-display">
                    {isAir ? `Flight ${selected.flightNumber} · ${selected.originIata} → ${selected.destIata}` : 'Route'}
                  </h3>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[15px] font-semibold text-heading tabular-nums">
                      {formatClock(selected.seconds - elapsed)}
                    </span>
                    <span className="text-[13px] text-muted">{selected.minsLeft} min. left</span>
                    {etaQuery.data?.predicted_eta_minutes && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title={`Model: ${etaQuery.data.model_used}`}>
                        <Sparkles size={13} />
                        AI ETA: {etaQuery.data.predicted_eta_minutes} min
                      </span>
                    )}
                    <button className="btn-secondary text-[13px] py-1.5">
                      <Pencil size={14} /> {isAir ? 'Change Routing' : 'Change Route'}
                    </button>
                  </div>
                </div>

                {isAir && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      ['Flight level', selected.altitudeFt ? `FL${Math.round(selected.altitudeFt / 100)}` : 'On ground'],
                      ['Ground speed', selected.groundSpeedKmh ? `${selected.groundSpeedKmh} km/h` : '—'],
                      ['Air waybill', selected.awb],
                      ['ULD positions', `${selected.uldUsed} / ${selected.uldTotal}`],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-app-panel border border-app-border rounded-xl px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</p>
                        <p className="text-[13px] font-semibold text-heading font-mono mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative h-[340px] rounded-2xl overflow-hidden border border-app-border">
                  {trackLoading ? (
                    <div className="w-full h-full bg-app-panel animate-pulse" aria-label="Loading route" />
                  ) : (
                    <RouteReplayMap
                      points={replayPoints}
                      cursor={cursor}
                      isAir={isAir}
                      className="w-full h-full"
                    />
                  )}

                  {/* Floating map controls */}
                  <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
                    {[Maximize2, MapPin, isAir ? Plane : TruckIcon].map((Icon, i) => (
                      <button
                        key={i}
                        className="w-9 h-9 rounded-xl bg-app-surface border border-app-border text-primary flex items-center justify-center shadow-card hover:bg-primary-soft transition-colors"
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>

                <RouteScrubber
                  points={replayPoints}
                  cursor={cursor}
                  onCursor={setCursor}
                  playing={playing}
                  onPlaying={setPlaying}
                  speed={replaySpeed}
                  onSpeed={setReplaySpeed}
                />

                {!replayIsLive && (
                  <p className="text-[11px] text-muted">
                    Replaying this card&apos;s planned path —{' '}
                    {vehiclesFailed
                      ? 'could not reach the API to look up telemetry.'
                      : liveVehicleId
                        ? <>no GPS pings recorded for <span className="font-mono">{selected.id}</span> in the last 24 hours.</>
                        : <><span className="font-mono">{selected.id}</span> is not a registered vehicle.</>}
                  </p>
                )}
                {track?.truncated && (
                  <p className="text-[11px] text-muted">
                    Trail clipped to the most recent {track.point_count.toLocaleString()} pings —
                    earlier fixes in this window are not shown.
                  </p>
                )}
              </section>

              {/* Cargo photos */}
              <section className="space-y-3">
                <h3 className="text-[17px] font-bold text-heading font-display">Cargo Photo Reports</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {CARGO_PHOTOS.map(photo => (
                    <figure key={photo.id} className="space-y-2">
                      <div className="h-28 rounded-xl overflow-hidden border border-app-border bg-app-panel">
                        <img
                          src={photo.url}
                          alt={photo.label}
                          loading="lazy"
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <figcaption className="space-y-0.5">
                        <p className="text-[12px] font-semibold text-heading flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span className="truncate">{photo.label}</span>
                        </p>
                        <p className="text-[11px] text-muted pl-3">{photo.place} • {photo.time}</p>
                      </figcaption>
                    </figure>
                  ))}

                  <button className="h-28 rounded-xl border-2 border-dashed border-primary/40 text-primary flex flex-col items-center justify-center gap-1.5 hover:bg-primary-soft transition-colors">
                    <Camera size={20} />
                    <span className="text-[12px] font-semibold">Add Photo</span>
                  </button>
                </div>
              </section>
            </>
          )}

          {activeTab === 'cargo' && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <h3 className="text-[17px] font-bold text-heading font-display">Cargo on board</h3>
                <CargoChip type={selected.cargoType} />
              </div>

              <p className="text-[13px] text-body bg-app-panel border border-app-border rounded-xl px-4 py-3">
                {selectedCargo.description}
              </p>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Cargo type" value={selectedCargo.label} />
                <Field label="Transport mode" value={modeMeta(selected.mode).label} />
                <Field label="Pieces" value={selected.pieces?.toLocaleString() ?? '—'} />
                <Field label="Gross weight" value={`${selected.loadKg.toLocaleString()} kg`} />
                <Field label="Volume" value={selected.volumeM3 ? `${selected.volumeM3.toLocaleString()} m³` : '—'} />
                <Field
                  label="Chargeable weight"
                  value={
                    <span className="flex items-center gap-2">
                      {chargeable ? `${chargeable.toLocaleString()} kg` : '—'}
                      {billedOnVolume && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary-soft border border-primary/25 rounded-full px-2 py-0.5">
                          volumetric
                        </span>
                      )}
                    </span>
                  }
                />
              </dl>

              {/* Handling requirements come straight off the cargo profile */}
              <div className="space-y-2">
                <h4 className="text-[13px] font-bold text-heading uppercase tracking-wider">Handling</h4>
                <ul className="space-y-2">
                  {[
                    selectedCargo.needsRefrigeration && 'Temperature-controlled chain — reefer unit or cool ULD required at every leg.',
                    selectedCargo.requiresDeclaration && 'Shipper declaration required before acceptance.',
                    selected.hazmatUnCode && `Dangerous goods class ${selected.hazmatUnCode} — segregation rules apply on the deck.`,
                    !selectedCargo.airAllowed && 'Road only: this cargo class cannot be carried by air.',
                    selected.cargoType === 'fragile' && 'No stacking. Strapped and dunnaged loads only.',
                    selected.cargoType === 'high_value' && 'Sealed custody, two-person handover at each transfer.',
                  ].filter(Boolean).map(rule => (
                    <li key={rule} className="flex items-start gap-2 text-[13px] text-body">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                      {rule}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-[13px] text-body">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                    Rate multiplier {selectedCargo.rateMultiplier.toFixed(2)}× applied to the base {modeMeta(selected.mode).short.toLowerCase()} tariff.
                  </li>
                </ul>
              </div>
            </section>
          )}

          {activeTab === 'vehicle' && (
            <section className="space-y-4">
              <h3 className="text-[17px] font-bold text-heading font-display">
                {isAir ? 'Aircraft Info' : 'Vehicle Info'}
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(isAir
                  ? [
                    ['Aircraft Type', selected.type],
                    ['Tail Number', selected.tailNumber],
                    ['Flight Number', selected.flightNumber],
                    ['Home Terminal', selected.depot],
                    ['Carrier Partner', selected.partner],
                    ['Max Payload', `${selected.maxKg.toLocaleString()} kg`],
                    ['Current Load', `${selected.loadKg.toLocaleString()} kg (${selected.capacityPct}%)`],
                    ['ULD Positions', `${selected.uldUsed} of ${selected.uldTotal} built up`],
                    ['Fuel', 'Jet A-1'],
                    ['Telemetry Interval', '5 sec (ADS-B)'],
                  ]
                  : [
                    ['Vehicle Type', selected.type],
                    ['Registration', selected.id],
                    ['Home Depot', selected.depot],
                    ['Carrier Partner', selected.partner],
                    ['Max Payload', `${selected.maxKg.toLocaleString()} kg`],
                    ['Current Load', `${selected.loadKg.toLocaleString()} kg (${selected.capacityPct}%)`],
                    ['Fuel Level', '78% (Diesel)'],
                    ['Telemetry Interval', '5 sec'],
                  ]
                ).map(([label, value]) => (
                  <Field key={label} label={label} value={value} />
                ))}
              </dl>
            </section>
          )}

          {activeTab === 'docs' && (
            <section className="space-y-4">
              <h3 className="text-[17px] font-bold text-heading font-display">Documents</h3>
              <ul className="space-y-2">
                {(isAir
                  ? [
                    `Air_Waybill_${selected.awb}.pdf`,
                    'Cargo_Manifest_NOTOC.pdf',
                    selected.hazmatUnCode ? 'Shippers_Declaration_DGR.pdf' : 'Security_Declaration_CCSF.pdf',
                    'Customs_Clearance_Doc.pdf',
                  ]
                  : [
                    `Bill_of_Lading_${selected.id}.pdf`,
                    'Customs_Clearance_Doc.pdf',
                    'Insurance_Certificate_2026.pdf',
                  ]
                ).map(doc => (
                  <li
                    key={doc}
                    className="flex items-center justify-between bg-app-panel border border-app-border rounded-xl px-4 py-3"
                  >
                    <span className="text-[13px] font-medium text-heading truncate">{doc}</span>
                    <button className="text-[13px] font-semibold text-primary hover:underline">Download</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activeTab === 'company' && (
            <section className="space-y-4">
              <h3 className="text-[17px] font-bold text-heading font-display">Company</h3>
              <div className="bg-app-panel border border-app-border rounded-2xl p-5 space-y-2 text-[13px]">
                <p className="text-[16px] font-bold text-heading font-display">{selected.partner}</p>
                <p className="text-muted">
                  Assigned {isAir ? 'commander' : 'driver'}:{' '}
                  <span className="text-heading font-semibold">{selected.driverName}</span>
                </p>
                <p className="text-muted">Contact: <span className="text-heading font-semibold">{selected.driverPhone}</span></p>
                <p className="text-muted">
                  Operating {isAir ? 'terminal' : 'depot'}:{' '}
                  <span className="text-heading font-semibold">{selected.depot}</span>
                </p>
              </div>
            </section>
          )}

          {activeTab === 'billing' && (
            <section className="space-y-4">
              <h3 className="text-[17px] font-bold text-heading font-display">Billing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(isAir
                  ? [
                    ['Air Freight Rate', '₹ 3,18,400'],
                    ['Fuel & Security Surcharge', '₹ 54,900'],
                    ['Total Payable', '₹ 3,73,300'],
                  ]
                  : [
                    ['Freight Rate', '₹ 42,500'],
                    ['Fuel Surcharge', '₹ 6,180'],
                    ['Total Payable', '₹ 48,680'],
                  ]
                ).map(([label, value]) => (
                  <div key={label} className="bg-app-panel border border-app-border rounded-xl px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</p>
                    <p className="text-[18px] font-bold text-heading font-display mt-1">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-muted flex items-center gap-1.5">
                <Gauge size={13} className="text-primary" />
                Billed on {billedOnVolume ? 'volumetric' : 'actual'} weight of {chargeable?.toLocaleString()} kg
                {' '}at the {selectedCargo.rateMultiplier.toFixed(2)}× {selectedCargo.label.toLowerCase()} multiplier.
              </p>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}
