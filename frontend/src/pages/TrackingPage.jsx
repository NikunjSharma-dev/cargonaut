import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Phone, MessageSquare, Pencil, Camera, Maximize2, MapPin, Truck as TruckIcon,
} from 'lucide-react'
import api from '../utils/api'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import clsx from 'clsx'
import TruckGraphic from '../components/TruckGraphic'

const truckIcon = new L.DivIcon({
  className: '',
  html: `<div class="map-marker-truck" style="background:#e8606d;width:34px;height:34px;border-radius:50%;border:4px solid #fff;display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
  </div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
})

const stopIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:#fff;width:24px;height:24px;border-radius:50%;border:2px solid #e8606d;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(24,26,33,.18);">
    <span style="width:8px;height:8px;border-radius:50%;background:#e8606d;display:block"></span>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const FLEET = [
  {
    id: 'RE-74ER453TR5', partner: 'Shiphike - For Packages', variant: 'box',
    status: 'on_route', seconds: 9 * 3600 + 47 * 60 + 24, minsLeft: 58,
    driverName: 'Vikram Singh', driverPhone: '+91 98230 11204', depot: 'North Hub Depot',
    type: 'Medium Box Truck (12T)', capacityPct: 74, loadKg: 8900, maxKg: 12000,
    stops: ['475 Broadus', '377 Hammond', '247 Coalwood', '687 Volborg', '874 Beebe'],
    activeStop: 3, currentLoc: [19.076, 72.8777],
    routePath: [[19.02, 72.84], [19.076, 72.8777], [19.12, 72.9], [19.2, 72.97]],
  },
  {
    id: 'YR-34DFR734W2', partner: 'Roambee', variant: 'semi',
    status: 'on_route', seconds: 1 * 3600 + 38 * 60 + 47, minsLeft: 57,
    driverName: 'Amit Sharma', driverPhone: '+91 98112 44321', depot: 'Capital Gateway',
    type: 'Heavy Freight Semi (24T)', capacityPct: 82, loadKg: 18400, maxKg: 22000,
    stops: ['074 Rosebud', '159 Thurlow', '357 Hathaway', '854 Sheffield', '712 Miles City'],
    activeStop: 2, currentLoc: [28.6139, 77.209],
    routePath: [[28.55, 77.15], [28.59, 77.18], [28.6139, 77.209], [28.66, 77.25]],
  },
  {
    id: 'DW-847DE74E4R', partner: 'Post Hawk', variant: 'van',
    status: 'on_route', seconds: 1 * 3600 + 38 * 60 + 47, minsLeft: 78,
    driverName: 'Rajesh Kumar', driverPhone: '+91 97401 55902', depot: 'Tech Hub South',
    type: 'Panel Cargo Van (3.5T)', capacityPct: 61, loadKg: 2100, maxKg: 3500,
    stops: ['874 Sheridan', '589 Ucross', '967 Clearmont', '474 Leiter', '377 Kendrick'],
    activeStop: 1, currentLoc: [12.9716, 77.5946],
    routePath: [[12.93, 77.55], [12.9716, 77.5946], [13.02, 77.63]],
  },
  {
    id: 'AQ-257DRE141E', partner: 'Loginext', variant: 'van',
    status: 'waiting', seconds: 3 * 3600 + 29 * 60 + 58, minsLeft: 29,
    driverName: 'Sunil Patil', driverPhone: '+91 90045 88123', depot: 'West Cargo Yard',
    type: 'Compact Delivery Van (1.5T)', capacityPct: 38, loadKg: 570, maxKg: 1500,
    stops: ['125 Kinsey', '654 Saugus', '789 Fallon', '577 Glendive'],
    activeStop: 0, currentLoc: [18.5204, 73.8567],
    routePath: [[18.5204, 73.8567], [18.56, 73.9]],
  },
  {
    id: 'BG-ER74R6984R', partner: 'Forwardo', variant: 'box',
    status: 'on_route', seconds: 28 * 60 + 38, minsLeft: 88,
    driverName: 'Manish Rao', driverPhone: '+91 99870 21118', depot: 'North Hub Depot',
    type: 'Medium Box Truck (12T)', capacityPct: 90, loadKg: 10800, maxKg: 12000,
    stops: ['369 Cohagen', '258 Hillside', '147 Rock Springs', '268 Angela'],
    activeStop: 3, currentLoc: [23.0225, 72.5714],
    routePath: [[22.98, 72.52], [23.0225, 72.5714], [23.08, 72.63]],
  },
  {
    id: 'CV-414ER58SER', partner: 'Lopez Pallets', variant: 'semi',
    status: 'waiting', seconds: 2 * 3600 + 38 * 60 + 47, minsLeft: 18,
    driverName: 'Iqbal Khan', driverPhone: '+91 98765 40021', depot: 'East Terminal',
    type: 'Heavy Freight Semi (24T)', capacityPct: 55, loadKg: 12100, maxKg: 22000,
    stops: ['536 Dickinson', '469 Belfield', '641 Medora', '279 Wibaux'],
    activeStop: 0, currentLoc: [22.5726, 88.3639],
    routePath: [[22.5726, 88.3639], [22.62, 88.41]],
  },
  {
    id: 'MN-88TR2091KL', partner: 'Sonosolve', variant: 'box',
    status: 'inactive', seconds: 0, minsLeft: 0,
    driverName: 'Deepak Nair', driverPhone: '+91 90876 33420', depot: 'South Depot',
    type: 'Medium Box Truck (12T)', capacityPct: 0, loadKg: 0, maxKg: 12000,
    stops: ['902 Ekalaka', '188 Alzada'],
    activeStop: 0, currentLoc: [17.385, 78.4867],
    routePath: [[17.385, 78.4867], [17.42, 78.52]],
  },
  {
    id: 'PL-63DD1174QW', partner: 'Shiphike - For Packages', variant: 'van',
    status: 'inactive', seconds: 0, minsLeft: 0,
    driverName: 'Farhan Ali', driverPhone: '+91 93456 77210', depot: 'West Cargo Yard',
    type: 'Panel Cargo Van (3.5T)', capacityPct: 0, loadKg: 0, maxKg: 3500,
    stops: ['411 Broadus', '332 Otter'],
    activeStop: 0, currentLoc: [26.9124, 75.7873],
    routePath: [[26.9124, 75.7873], [26.95, 75.83]],
  },
]

const CARGO_PHOTOS = [
  { id: 1, url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&q=80', label: 'Point #1 Cargo Photo', place: '712 Miles City', time: '01:35 PM' },
  { id: 2, url: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80', label: 'Point #2 Cargo Photo', place: '854 Sheffield', time: '02:10 PM' },
  { id: 3, url: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=400&q=80', label: 'Point #3 Cargo Photo', place: '357 Hathaway', time: '02:40 PM' },
]

const TABS = [
  { key: 'shipping', label: 'Shipping Info' },
  { key: 'vehicle', label: 'Vehicle Info' },
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

export default function TrackingPage() {
  const [partnerFilter, setPartnerFilter] = useState(null)
  const [showFilter, setShowFilter] = useState('all') // active | inactive | all
  const [selectedId, setSelectedId] = useState(FLEET[1].id)
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

  const showCounts = useMemo(() => ({
    active: FLEET.filter(v => v.status !== 'inactive').length,
    inactive: FLEET.filter(v => v.status === 'inactive').length,
    all: FLEET.length,
  }), [])

  const visibleFleet = useMemo(() => FLEET.filter(v => {
    if (partnerFilter && v.partner !== partnerFilter) return false
    if (showFilter === 'active' && v.status === 'inactive') return false
    if (showFilter === 'inactive' && v.status !== 'inactive') return false
    if (query && !v.id.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [partnerFilter, showFilter, query])

  const selected = FLEET.find(v => v.id === selectedId) || FLEET[0]

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
                  placeholder="Search vehicle ID..."
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
        <div className="flex-1 overflow-y-auto px-6 pb-6">
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

                  <StopsPanel vehicle={vehicle} elapsed={elapsed} />

                  <TruckGraphic variant={vehicle.variant} className="w-full max-w-[300px] self-center h-auto mt-1" />
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
            <div className="flex items-center gap-3">
              <h2 className="text-[26px] leading-none font-extrabold text-heading font-display tracking-tight">
                {selected.id}
              </h2>
              <StatusDot status={selected.status} />
            </div>

            <div className="flex items-center gap-2.5">
              <a href={`tel:${selected.driverPhone.replace(/\s/g, '')}`} className="btn-secondary text-[13px]">
                <Phone size={16} /> Call Driver
              </a>
              <button className="btn-primary text-[13px]">
                <MessageSquare size={16} /> Chat with Driver
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
                <h3 className="text-[17px] font-bold text-heading font-display">Current Truck Capacity</h3>
                <div className="flex items-center justify-center">
                  <TruckGraphic
                    variant={selected.variant}
                    fillPercent={selected.capacityPct}
                    showLabel
                    className="w-full max-w-[620px] h-auto"
                  />
                </div>
                <p className="text-[12px] text-muted text-center">
                  {selected.loadKg.toLocaleString()} kg loaded of {selected.maxKg.toLocaleString()} kg capacity
                </p>
              </section>

              {/* Route + map */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
                  <h3 className="text-[17px] font-bold text-heading font-display">Route</h3>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[15px] font-semibold text-heading tabular-nums">
                      {formatClock(selected.seconds - elapsed)}
                    </span>
                    <span className="text-[13px] text-muted">{selected.minsLeft} min. left</span>
                    <button className="btn-secondary text-[13px] py-1.5">
                      <Pencil size={14} /> Change Route
                    </button>
                  </div>
                </div>

                <div className="relative h-[340px] rounded-2xl overflow-hidden border border-app-border">
                  <MapContainer
                    key={selected.id}
                    center={selected.currentLoc}
                    zoom={12}
                    scrollWheelZoom={false}
                    zoomControl={false}
                    className="w-full h-full"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    <Polyline
                      positions={selected.routePath}
                      pathOptions={{ color: '#e8606d', weight: 4, opacity: 0.9 }}
                    />
                    {[selected.routePath[0], selected.routePath[selected.routePath.length - 1]].map((pos, i) => (
                      <Marker key={i} position={pos} icon={stopIcon} />
                    ))}
                    <Marker position={selected.currentLoc} icon={truckIcon}>
                      <Popup>
                        <span className="text-xs font-semibold">{selected.id} — live position</span>
                      </Popup>
                    </Marker>
                  </MapContainer>

                  {/* Floating map controls */}
                  <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
                    {[Maximize2, MapPin, TruckIcon].map((Icon, i) => (
                      <button
                        key={i}
                        className="w-9 h-9 rounded-xl bg-app-surface border border-app-border text-primary flex items-center justify-center shadow-card hover:bg-primary-soft transition-colors"
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>
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

          {activeTab === 'vehicle' && (
            <section className="space-y-4">
              <h3 className="text-[17px] font-bold text-heading font-display">Vehicle Info</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['Vehicle Type', selected.type],
                  ['Registration', selected.id],
                  ['Home Depot', selected.depot],
                  ['Carrier Partner', selected.partner],
                  ['Max Payload', `${selected.maxKg.toLocaleString()} kg`],
                  ['Current Load', `${selected.loadKg.toLocaleString()} kg (${selected.capacityPct}%)`],
                  ['Fuel Level', '78% (Diesel)'],
                  ['Telemetry Interval', '5 sec'],
                ].map(([label, value]) => (
                  <div key={label} className="bg-app-panel border border-app-border rounded-xl px-4 py-3">
                    <dt className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</dt>
                    <dd className="text-[14px] font-semibold text-heading mt-1">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {activeTab === 'docs' && (
            <section className="space-y-4">
              <h3 className="text-[17px] font-bold text-heading font-display">Documents</h3>
              <ul className="space-y-2">
                {[
                  `Bill_of_Lading_${selected.id}.pdf`,
                  'Customs_Clearance_Doc.pdf',
                  'Insurance_Certificate_2026.pdf',
                ].map(doc => (
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
                <p className="text-muted">Assigned driver: <span className="text-heading font-semibold">{selected.driverName}</span></p>
                <p className="text-muted">Contact: <span className="text-heading font-semibold">{selected.driverPhone}</span></p>
                <p className="text-muted">Operating depot: <span className="text-heading font-semibold">{selected.depot}</span></p>
              </div>
            </section>
          )}

          {activeTab === 'billing' && (
            <section className="space-y-4">
              <h3 className="text-[17px] font-bold text-heading font-display">Billing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ['Freight Rate', '₹ 42,500'],
                  ['Fuel Surcharge', '₹ 6,180'],
                  ['Total Payable', '₹ 48,680'],
                ].map(([label, value]) => (
                  <div key={label} className="bg-app-panel border border-app-border rounded-xl px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</p>
                    <p className="text-[18px] font-bold text-heading font-display mt-1">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}
