/**
 * App-wide settings. Change behaviour here rather than inside components.
 */

export const APP_VERSION = '0.2.0'

/**
 * NOTE: how close the user must be to the gym, how long the timer runs and how often it checks are NOT
 * set here. The database decides them (`config.max_gym_distance_meters`, `config.showup_*`) and the app
 * only follows what each session says.
 */

/**
 * Options passed to navigator.geolocation.getCurrentPosition (src/services/devicePosition.ts). Whether a
 * position is close enough to the gym, or precise enough, is decided by the database, not by the app.
 */
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000, // give up after 15 seconds
  maximumAge: 0, // never reuse a cached position
}

/**
 * The timed Show Up engine (src/hooks/useShowupEngine.ts). How LONG a session lasts and how OFTEN it
 * checks are never set here: they come from the session the database returns. These two numbers are
 * only about how the engine behaves while it waits.
 */
/** How often the engine looks at the clock, in milliseconds. */
export const SHOWUP_TICK_MS = 500
/** How long the engine waits before trying a check again after a failed attempt, in milliseconds. */
export const SHOWUP_RETRY_MS = 10_000

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

/**
 * Longest first or last name a person can type or save, in characters as they see them (spaces count). The same number
 * as the display rule, so a name typed here is never cut when shown. The database check on `profiles` allows 100 and is
 * left as it is, so names saved before this limit still load and show.
 */
export const PROFILE_NAME_MAX_LENGTH = 25

/**
 * The browser's own `maxLength` on a name field is only a backstop against a huge paste. It counts code units (a Hindi
 * letter with its vowel sign is 2, an emoji up to 11), so it is set to this many times the limit; the real limit, in
 * characters as a person sees them, is enforced when the text changes.
 */
export const NAME_BACKSTOP_FACTOR = 12

/**
 * Youngest age accepted. A birthday must be at least this many years ago: the date picker stops at
 * exactly this many years before today, and the form rejects anything later.
 */
export const MINIMUM_AGE_YEARS = 15

/** Earliest birth date accepted. Matches the database check on `profiles.date_of_birth`. */
export const EARLIEST_DATE_OF_BIRTH = '1900-01-01'

/** Label given to the single gym supported in v0.1.0. */
export const PRIMARY_GYM_LABEL = 'Gym 1'

/** Wait this long after the user stops typing before calling Google. */
export const PLACE_SEARCH_DEBOUNCE_MS = 300

/** Wait this long after the user stops typing before calling Google while "Gyms near me" is on (a little longer, to save requests). */
export const NEAR_ME_SEARCH_DEBOUNCE_MS = 350

/**
 * Options for the one-off position read when the person turns "Gyms near me" on. Much looser than the Show Up
 * ones above: a rough position is enough to sort a list, so there is no high-accuracy fix, a 10 s wait, and a
 * position up to a minute old is fine.
 */
export const NEAR_ME_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
}

/** The note shown under the "Gyms near me" toggle when location was refused, unavailable or timed out. */
export const LOCATION_OFF_NOTE = 'Location is off. Allow it in your browser settings to sort by distance.'

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

/**
 * Optional. The address of the Privacy Policy page. There is no policy page in this project yet, so
 * this is empty and the landing page shows "Privacy Policy" as plain text instead of a link. Set
 * `VITE_PRIVACY_POLICY_URL` (an https address) to turn it into a link.
 */
export const PRIVACY_POLICY_URL: string = import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() ?? ''

/**
 * Optional. The public address of the deployed app (for example https://showup.example.com), used
 * as the sign-in return address in production. Normally leave this unset: the app returns to the
 * address it is running on, which is correct for localhost, the main Vercel domain and previews.
 * It is ignored when running on localhost.
 */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL?.trim() ?? ''
