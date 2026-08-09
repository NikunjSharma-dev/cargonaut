/**
 * Client-side mirror of app/services/geofencing.circle_to_ring.
 *
 * Only used to preview a circle while it is being drawn — the server buffers
 * the authoritative ring on save, so the two never need to agree exactly. Kept
 * at the same segment count so the preview matches what gets stored.
 */

const EARTH_RADIUS_M = 6_371_000
const CIRCLE_SEGMENTS = 48

/** Returns a closed ring of [lon, lat] pairs. */
export function circleToRing(latitude, longitude, radiusM, segments = CIRCLE_SEGMENTS) {
  const latRad = (latitude * Math.PI) / 180
  // Longitude degrees shrink with latitude; without this the preview is an
  // ellipse that does not match the fence the server stores.
  const cosLat = Math.max(Math.cos(latRad), 1e-6)

  const dLat = ((radiusM / EARTH_RADIUS_M) * 180) / Math.PI
  const dLon = ((radiusM / (EARTH_RADIUS_M * cosLat)) * 180) / Math.PI

  const ring = []
  for (let i = 0; i < segments; i += 1) {
    const theta = (2 * Math.PI * i) / segments
    ring.push([longitude + dLon * Math.cos(theta), latitude + dLat * Math.sin(theta)])
  }
  ring.push([...ring[0]])
  return ring
}

/** Rough centre of a ring, for list rows and map framing. */
export function ringCentroid(ring = []) {
  if (!ring.length) return null
  // Compare component-wise: a ring parsed from JSON has distinct array objects
  // for its first and last vertex, so `===` would never detect the closing
  // duplicate and it would be double-counted in the average.
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed = ring.length > 1 && first[0] === last[0] && first[1] === last[1]
  const pts = closed ? ring.slice(0, -1) : ring

  const sum = pts.reduce((acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat], [0, 0])
  return [sum[0] / pts.length, sum[1] / pts.length]
}
