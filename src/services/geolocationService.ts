import { GEOLOCATION_OPTIONS } from '../config/constants'
import type { GeolocationFailureReason, ReportedPosition } from '../types'

/** Thrown when the browser cannot give us a position. */
export class GeolocationError extends Error {
  readonly reason: GeolocationFailureReason

  constructor(reason: GeolocationFailureReason, message: string) {
    super(message)
    this.name = 'GeolocationError'
    this.reason = reason
  }
}

// Numeric codes defined by the Geolocation API specification.
const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2

function toFailureReason(error: GeolocationPositionError): GeolocationFailureReason {
  if (error.code === PERMISSION_DENIED) return 'permission-denied'
  if (error.code === POSITION_UNAVAILABLE) return 'unavailable'
  return 'timeout'
}

/**
 * Asks the browser for the user's current position (high accuracy).
 * Wraps the callback-based browser API in a Promise so callers can `await` it.
 * Rejects with a GeolocationError on failure.
 */
export function getCurrentPosition(): Promise<ReportedPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationError('unsupported', 'Geolocation is not supported by this browser.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
        }),
      (error) => reject(new GeolocationError(toFailureReason(error), error.message)),
      GEOLOCATION_OPTIONS,
    )
  })
}
