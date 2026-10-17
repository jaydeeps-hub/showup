/**
 * App-wide settings. Change behaviour here rather than inside components.
 */

export const APP_VERSION = '0.2.0'

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

/**
 * Google Maps place types accepted as a "gym". A selected place must have at
 * least one of these, which stops people saving a random location (such as
 * their home) and earning Showups there. Add or remove types here.
 * Full list: https://developers.google.com/maps/documentation/places/web-service/place-types
 */
export const ALLOWED_GYM_PLACE_TYPES: readonly string[] = [
  'gym',
  'fitness_center',
  'yoga_studio',
  'sports_club',
  'sports_complex',
  'sports_activity_location',
  'sports_coaching',
  'swimming_pool',
  'athletic_field',
  'ice_skating_rink',
]

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

/**
 * Supabase connection settings, read from `.env.local`. Both values are public by design:
 * the publishable key only allows what your database security rules (RLS) allow.
 * Never add a secret/service_role key here.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
