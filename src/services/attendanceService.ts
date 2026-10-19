import { GEOFENCE_RADIUS_METRES, MAX_LOCATION_ACCURACY_METRES } from '../config/constants'
import type { Gym, ReportedPosition, ShowupOutcome } from '../types'
import { distanceInMetres } from '../utils/distance'
import { GeolocationError } from './geolocationService'

/**
 * The rules for deciding whether a Showup counts. Everything here is plain functions with no React
 * and no database, so it is easy to test. Saving a successful Showup is done separately, by
 * showupService.ts.
 */

export interface LocationRules {
  radiusMetres: number
  maxAccuracyMetres: number
}

const DEFAULT_RULES: LocationRules = {
  radiusMetres: GEOFENCE_RADIUS_METRES,
  maxAccuracyMetres: MAX_LOCATION_ACCURACY_METRES,
}

/** Decides whether a reported position counts as being at the gym. */
export function evaluatePosition(
  position: ReportedPosition,
  gym: Gym,
  rules: LocationRules = DEFAULT_RULES,
): Exclude<ShowupOutcome, { type: 'location-error' }> {
  const distanceMetres = distanceInMetres(position, gym)

  // Even the most generous reading of this position is outside the radius,
  // so the user is clearly not at the gym, however imprecise the reading.
  const clearlyOutside = distanceMetres - position.accuracyMetres > rules.radiusMetres

  if (position.accuracyMetres > rules.maxAccuracyMetres && !clearlyOutside) {
    return { type: 'poor-accuracy', accuracyMetres: position.accuracyMetres }
  }

  if (distanceMetres <= rules.radiusMetres) {
    return { type: 'success', distanceMetres }
  }
  return { type: 'outside-geofence', distanceMetres }
}

export interface ShowupCheck {
  outcome: ShowupOutcome
  /** The browser's reported accuracy, when a position was obtained. Stored with a successful Showup. */
  accuracyMetres: number | null
}

/**
 * Gets the position and decides the outcome. It does NOT save anything: the caller records a
 * Showup only when `outcome.type === 'success'`.
 * `getPosition` is passed in so tests can supply a fake location.
 */
export async function checkLocation(params: {
  gym: Gym
  getPosition: () => Promise<ReportedPosition>
}): Promise<ShowupCheck> {
  const { gym, getPosition } = params

  let position: ReportedPosition
  try {
    position = await getPosition()
  } catch (error) {
    const reason = error instanceof GeolocationError ? error.reason : 'unavailable'
    return { outcome: { type: 'location-error', reason }, accuracyMetres: null }
  }

  return { outcome: evaluatePosition(position, gym), accuracyMetres: position.accuracyMetres }
}
