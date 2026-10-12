/**
 * App-wide settings. Change behaviour here rather than inside components.
 */

export const APP_VERSION = '0.1.0'

/**
 * How close (in metres) the user must be to the saved gym's coordinates for a
 * Showup to count. Google stores a single point per place, often the entrance
 * or the building centre, so very small values can reject people standing
 * inside a large building.
 */
export const GEOFENCE_RADIUS_METRES = 100

/**
 * The largest location uncertainty (in metres) we accept. The browser reports
 * an accuracy radius with every position: "you are somewhere within N metres
 * of this point". If N is larger than this value, the reading is too vague to
 * prove the user is at the gym, so we ask them to retry instead of guessing.
 */
export const MAX_LOCATION_ACCURACY_METRES = 100

/** Options passed to navigator.geolocation.getCurrentPosition. */
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000, // give up after 15 seconds
  maximumAge: 0, // never reuse a cached position
}

/** Label given to the single gym supported in v0.1.0. */
export const PRIMARY_GYM_LABEL = 'Gym 1'

/** localStorage key. The version suffix lets future releases migrate data. */
export const STORAGE_KEY = 'showup:data:v1'

/** Wait this long after the user stops typing before calling Google. */
export const PLACE_SEARCH_DEBOUNCE_MS = 300

/** Minimum characters typed before searching Google Maps. */
export const PLACE_SEARCH_MIN_CHARACTERS = 3

/**
 * Read from the .env file. Vite only exposes variables starting with VITE_.
 * This key is visible to anyone using the built app: protect it with
 * referrer and API restrictions in Google Cloud, not by hiding it.
 */
export const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
