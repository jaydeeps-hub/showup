import type { Coordinates } from '../types'

/** Mean radius of the Earth in metres, as used by most mapping tools. */
const EARTH_RADIUS_METRES = 6_371_000

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Straight-line ("as the crow flies") distance between two points on Earth,
 * using the Haversine formula. Accurate to well under a metre at gym-sized
 * distances, which is far better than phone GPS accuracy.
 */
export function distanceInMetres(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)))
}
