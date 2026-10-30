/** A point on the earth, in degrees. */
export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_METERS = 6_371_008.8

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/**
 * The straight-line ("great circle") distance in metres between two points, by the haversine formula. It is
 * worked out in the app from the device position and a place's own coordinates, so a distance costs no extra
 * request to Google.
 */
export function haversineMeters(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2
  // Rounding can push `a` a hair above 1 for opposite points; clamp so the square root stays real.
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * How a distance reads on a result row: "640 m" under a kilometre (rounded to the nearest 10 m, never "1000 m"),
 * and "1.2 km" from a kilometre up (one decimal, so 999.6 m is "1.0 km" and not "1000 m").
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  const roundedToTen = Math.round(meters / 10) * 10
  if (roundedToTen < 1000) return `${roundedToTen} m`
  return `${(Math.round(meters / 100) / 10).toFixed(1)} km`
}
