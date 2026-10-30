import { GEOLOCATION_OPTIONS, NEAR_ME_GEOLOCATION_OPTIONS } from '../config/constants'
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
 *
 * Other callers may pass their own options (see getNearMePosition); with none, these are the Show Up ones.
 */
export function getPosition(options: PositionOptions = GEOLOCATION_OPTIONS): Promise<DevicePosition> {
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
      options,
    )
  })
}

/**
 * The position for "Gyms near me": the same as getPosition, but with the looser NEAR_ME options (no high accuracy,
 * 10 s, a minute-old position is fine). Call it only from the person turning the toggle on: it is the one moment
 * the browser is asked for location on that screen.
 */
export function getNearMePosition(): Promise<DevicePosition> {
  return getPosition(NEAR_ME_GEOLOCATION_OPTIONS)
}
