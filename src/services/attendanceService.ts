import { GEOFENCE_RADIUS_METRES, MAX_LOCATION_ACCURACY_METRES } from '../config/constants'
import type { Gym, ReportedPosition, ShowupData, ShowupOutcome } from '../types'
import { distanceInMetres } from '../utils/distance'
import { createId } from '../utils/id'
import { GeolocationError } from './geolocationService'

/**
 * The rules for deciding whether a Showup counts, and for recording it.
 * Everything here is plain functions with no React, so it is easy to test.
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

/** Returns a copy of `data` with one new successful Showup event added. */
export function recordShowup(
  data: ShowupData,
  details: { userId: string; gymId: string; distanceMetres: number | null; verifiedAt: Date },
): ShowupData {
  const event = {
    id: createId(),
    userId: details.userId,
    gymId: details.gymId,
    verifiedAt: details.verifiedAt.toISOString(),
    distanceMetres: details.distanceMetres,
  }
  return { ...data, events: [...data.events, event] }
}

/**
 * The Showup counter. It is always calculated from the event history rather
 * than stored separately, so the two can never disagree.
 */
export function countShowups(data: ShowupData, userId: string): number {
  return data.events.filter((event) => event.userId === userId).length
}

export interface ShowupAttempt {
  outcome: ShowupOutcome
  /** The data after the attempt. Identical to the input unless it succeeded. */
  data: ShowupData
}

/**
 * The whole SHOW UP flow: get the position, check it, and record it if valid.
 * `getPosition` is passed in so tests can supply a fake location.
 */
export async function attemptShowup(params: {
  data: ShowupData
  userId: string
  gym: Gym
  getPosition: () => Promise<ReportedPosition>
  now?: () => Date
}): Promise<ShowupAttempt> {
  const { data, userId, gym, getPosition, now = () => new Date() } = params

  let position: ReportedPosition
  try {
    position = await getPosition()
  } catch (error) {
    const reason = error instanceof GeolocationError ? error.reason : 'unavailable'
    return { outcome: { type: 'location-error', reason }, data }
  }

  const outcome = evaluatePosition(position, gym)
  if (outcome.type !== 'success') {
    return { outcome, data }
  }

  const updated = recordShowup(data, {
    userId,
    gymId: gym.id,
    distanceMetres: outcome.distanceMetres,
    verifiedAt: now(),
  })
  return { outcome, data: updated }
}
