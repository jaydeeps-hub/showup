import { MAX_LOCATION_ACCURACY_METRES } from '../config/constants'
import type { Gym, ReportedPosition, ShowupOutcome } from '../types'
import { distanceInMetres } from '../utils/distance'
import { getCachedAppConfig } from './appConfig'
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

/**
 * The rules in force right now. The distance limit comes from the database config (see appConfig.ts)
 * and falls back to 100 m if it has not been loaded.
 */
function currentRules(): LocationRules {
  return {
    radiusMetres: getCachedAppConfig().maxGymDistanceMeters,
    maxAccuracyMetres: MAX_LOCATION_ACCURACY_METRES,
  }
}

/** Decides whether a reported position counts as being at the gym. */
export function evaluatePosition(
  position: ReportedPosition,
  gym: Gym,
  rules: LocationRules = currentRules(),
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
  /** The position the browser reported, when one was obtained. Sent to the database to record a Showup. */
  position: ReportedPosition | null
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
    return { outcome: { type: 'location-error', reason }, position: null }
  }

  return { outcome: evaluatePosition(position, gym), position }
}
