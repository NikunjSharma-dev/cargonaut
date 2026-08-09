import {
  Boxes, Package, Layers, Snowflake, GlassWater, Flame,
  Droplets, Ruler, Gem, Truck, Plane,
} from 'lucide-react'

/**
 * Cargo taxonomy and transport modes — the frontend mirror of
 * `app/services/cargo_rules.py`. Keep the two in step: the API rejects a
 * booking these tables would have allowed, and the dispatcher sees a 422
 * instead of a disabled option.
 */

// ─── Transport modes ──────────────────────────────────────────────────────────

export const TRANSPORT_MODES = {
  road: {
    key: 'road',
    label: 'Road cargo',
    short: 'Road',
    icon: Truck,
    tone: 'mode-road',
    avgSpeedKmh: 40,
    fixedHandlingMinutes: 20,
    costPerKm: 0.85,
    volumetricFactor: 333,
    description: 'Trucks, box bodies and vans running hub to hub.',
  },
  air: {
    key: 'air',
    label: 'Air cargo',
    short: 'Air',
    icon: Plane,
    tone: 'mode-air',
    avgSpeedKmh: 780,
    fixedHandlingMinutes: 210,
    costPerKm: 4.2,
    volumetricFactor: 167,
    description: 'Freighter aircraft moving ULDs between cargo terminals.',
  },
}

export const MODE_LIST = Object.values(TRANSPORT_MODES)

export function modeMeta(mode) {
  return TRANSPORT_MODES[mode] || TRANSPORT_MODES.road
}

// ─── Cargo types ──────────────────────────────────────────────────────────────

export const CARGO_TYPES = {
  general: {
    key: 'general', label: 'General freight', icon: Boxes, tone: 'cargo-neutral',
    airAllowed: true, needsRefrigeration: false, rateMultiplier: 1.0,
    description: 'Mixed non-regulated goods, loose or cartoned.',
  },
  parcel: {
    key: 'parcel', label: 'Parcels', icon: Package, tone: 'cargo-neutral',
    airAllowed: true, needsRefrigeration: false, rateMultiplier: 1.05,
    description: 'Small consignments billed per piece.',
  },
  palletized: {
    key: 'palletized', label: 'Palletized', icon: Layers, tone: 'cargo-neutral',
    airAllowed: true, needsRefrigeration: false, rateMultiplier: 1.0,
    description: 'Shrink-wrapped pallets, forklift handled at both ends.',
  },
  refrigerated: {
    key: 'refrigerated', label: 'Refrigerated', icon: Snowflake, tone: 'cargo-cold',
    airAllowed: true, needsRefrigeration: true, rateMultiplier: 1.35,
    description: 'Temperature-controlled chain — needs a reefer unit or cool ULD.',
  },
  fragile: {
    key: 'fragile', label: 'Fragile', icon: GlassWater, tone: 'cargo-fragile',
    airAllowed: true, needsRefrigeration: false, rateMultiplier: 1.2,
    description: 'Breakable goods; no stacking, strapped loads only.',
  },
  hazmat: {
    key: 'hazmat', label: 'Hazardous goods', icon: Flame, tone: 'cargo-hazard',
    airAllowed: true, needsRefrigeration: false, rateMultiplier: 1.6,
    requiresDeclaration: true,
    description: 'Dangerous goods — a UN code is required to fly.',
  },
  liquid_bulk: {
    key: 'liquid_bulk', label: 'Liquid bulk', icon: Droplets, tone: 'cargo-bulk',
    airAllowed: false, needsRefrigeration: false, rateMultiplier: 1.25,
    description: 'Tanker loads. Road only — no ULD carries bulk liquid.',
  },
  oversized: {
    key: 'oversized', label: 'Oversized', icon: Ruler, tone: 'cargo-bulk',
    airAllowed: false, needsRefrigeration: false, rateMultiplier: 1.45,
    description: 'Out-of-gauge freight beyond a freighter door envelope.',
  },
  high_value: {
    key: 'high_value', label: 'High value', icon: Gem, tone: 'cargo-value',
    airAllowed: true, needsRefrigeration: false, rateMultiplier: 1.5,
    requiresDeclaration: true,
    description: 'Bullion, pharma and electronics under sealed custody.',
  },
}

export const CARGO_LIST = Object.values(CARGO_TYPES)

export function cargoMeta(type) {
  return CARGO_TYPES[type] || CARGO_TYPES.general
}

/** Cargo types that can actually fly, for mode-aware selects. */
export function cargoTypesForMode(mode) {
  return mode === 'air' ? CARGO_LIST.filter(c => c.airAllowed) : CARGO_LIST
}

// ─── Fleet asset types ────────────────────────────────────────────────────────

export const VEHICLE_TYPES_BY_MODE = {
  road: [
    { key: 'truck', label: 'Truck' },
    { key: 'van', label: 'Van' },
    { key: 'car', label: 'Car' },
    { key: 'bike', label: 'Bike' },
    { key: 'motorcycle', label: 'Motorcycle' },
  ],
  air: [
    { key: 'freighter', label: 'Freighter (wide-body)' },
    { key: 'turboprop', label: 'Turboprop (regional)' },
  ],
}

export const FUEL_TYPES_BY_MODE = {
  road: ['diesel', 'electric', 'petrol', 'cng', 'hybrid'],
  air: ['jet_a1'],
}

export const AIR_VEHICLE_TYPES = new Set(['freighter', 'turboprop'])

export function modeForVehicleType(vehicleType) {
  return AIR_VEHICLE_TYPES.has(vehicleType) ? 'air' : 'road'
}

/** Which illustration a fleet asset gets. */
export function graphicVariant(vehicleType) {
  switch (vehicleType) {
    case 'freighter': return 'freighter'
    case 'turboprop': return 'turboprop'
    case 'truck': return 'semi'
    case 'van': return 'van'
    default: return 'box'
  }
}

// ─── Rating helpers ───────────────────────────────────────────────────────────

/**
 * Billable weight: the greater of actual weight and the weight the volume
 * would carry at the mode's density factor (IATA 1:167 kg/m³ for air).
 */
export function chargeableWeightKg(weightKg, volumeM3, mode = 'road') {
  if (weightKg == null && volumeM3 == null) return null
  const actual = weightKg || 0
  if (!volumeM3) return Math.round(actual * 100) / 100
  const volumetric = volumeM3 * modeMeta(mode).volumetricFactor
  return Math.round(Math.max(actual, volumetric) * 100) / 100
}

/** True when the volumetric weight is what the shipment gets billed on. */
export function isVolumetric(weightKg, volumeM3, mode = 'road') {
  if (!volumeM3) return false
  return volumeM3 * modeMeta(mode).volumetricFactor > (weightKg || 0)
}

export function estimateDurationMinutes(distanceKm, mode = 'road') {
  const m = modeMeta(mode)
  return Math.round((distanceKm / m.avgSpeedKmh) * 60 + m.fixedHandlingMinutes)
}

export function fmtDuration(minutes) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/** Mirrors `check_compatibility` — returns null when the pairing is fine. */
export function incompatibilityReason(cargoType, mode, vehicle = null) {
  const cargo = cargoMeta(cargoType)
  if (mode === 'air' && !cargo.airAllowed) {
    return `${cargo.label} cannot be carried as air cargo — route it by road.`
  }
  if (!vehicle) return null

  const vehicleMode = modeForVehicleType(vehicle.vehicle_type)
  if (vehicleMode !== mode) {
    return `${vehicle.registration_number} is a ${vehicleMode} asset and cannot serve a ${mode} shipment.`
  }
  if (cargo.needsRefrigeration && !vehicle.has_refrigeration) {
    return `${cargo.label} needs a temperature-controlled unit; ${vehicle.registration_number} has none.`
  }
  return null
}
