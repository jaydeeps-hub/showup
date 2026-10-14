import { ALLOWED_GYM_PLACE_TYPES } from '../config/constants'

/**
 * True if Google lists the place as a gym, fitness centre or similar facility.
 * Places Google has categorised wrongly or not at all are rejected: it is
 * safer to ask the user to pick another result than to accept any location.
 */
export function isFitnessPlace(placeTypes: readonly string[]): boolean {
  return placeTypes.some((type) => ALLOWED_GYM_PLACE_TYPES.includes(type))
}
