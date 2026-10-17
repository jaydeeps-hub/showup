import { ALLOWED_GYM_PLACE_TYPES } from '../config/constants'
import type { PlaceSearchMode } from '../types'

/**
 * True if Google lists the place as a gym, fitness centre or similar facility.
 * Places Google has categorised wrongly or not at all are rejected: it is
 * safer to ask the user to pick another result than to accept any location.
 */
export function isFitnessPlace(placeTypes: readonly string[]): boolean {
  return placeTypes.some((type) => ALLOWED_GYM_PLACE_TYPES.includes(type))
}

/**
 * Whether a selected place may be saved as a gym under the given search mode.
 * `fitness_only` (the default for everyone) requires a fitness-related place. `any_place` accepts
 * anything, but is only ever passed for administrators (see Profile.placeSearchMode).
 * Anything that is not exactly `any_place` is treated as the restrictive mode.
 */
export function isPlaceAllowed(placeTypes: readonly string[], mode: PlaceSearchMode = 'fitness_only'): boolean {
  return mode === 'any_place' || isFitnessPlace(placeTypes)
}
