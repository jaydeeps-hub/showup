import { GEOLOCATION_OPTIONS } from '../config/constants'
import type { DevicePosition } from '../types'

/** Why a position could not be read. These are thrown by `getPosition` as plain strings. */
export type PositionFailure = 'location_denied' | 'location_unavailable' | 'location_timeout'

// Numeric codes defined by the Geolocation API specification.
const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2

/** True for the three failure strings `getPosition` can throw. */
export function isPositionFailure(value: unknown): value is PositionFailure {
  return value === 'location_denied' || value === 'location_unavailable' || value === 'location_timeout'
}

/**
 * Reads the device's position once, at high accuracy, never from the cache (the options are in
 * GEOLOCATION_OPTIONS: high accuracy, 15 s timeout, maximum age 0). Resolves to the position with the
 * accuracy rounded to whole metres. Throws one of `location_denied`, `location_unavailable` or
 * `location_timeout`. A browser with no location support counts as `location_unavailable`.
 */
export function getPosition(): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject('location_unavailable' satisfies PositionFailure)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        }),
      (error) =>
        reject(
          (error.code === PERMISSION_DENIED
            ? 'location_denied'
            : error.code === POSITION_UNAVAILABLE
              ? 'location_unavailable'
              : 'location_timeout') satisfies PositionFailure,
        ),
      GEOLOCATION_OPTIONS,
    )
  })
}
