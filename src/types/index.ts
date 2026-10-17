/**
 * Core data types for Showup.
 *
 * These shapes are deliberately close to what database tables would look like
 * (users, gyms, showup_events) so they can move to a backend later.
 */

/**
 * A demo identity that exists only in this browser. It is NOT authenticated.
 * The password typed on the welcome screen is never stored anywhere.
 */
export interface TemporaryUser {
  id: string
  username: string
  createdAt: string // ISO 8601 timestamp
}

export interface Gym {
  /** Showup's own ID. Attendance events reference this, not the Google ID. */
  id: string
  userId: string
  /** Display label, e.g. "Gym 1". */
  label: string
  /** Google Maps place ID, when Google provided one. */
  googlePlaceId: string | null
  name: string
  formattedAddress: string
  latitude: number
  longitude: number
  createdAt: string
}

/** One successful, location-verified visit. Failed checks are never stored. */
export interface ShowupEvent {
  id: string
  userId: string
  gymId: string
  verifiedAt: string
  /** Distance between the user and the gym at verification time, if known. */
  distanceMetres: number | null
}

/** Everything Showup persists, stored as a single localStorage entry. */
export interface ShowupData {
  schemaVersion: 1
  user: TemporaryUser | null
  /** Only one gym is used in v0.1.0, but the array allows more later. */
  gyms: Gym[]
  events: ShowupEvent[]
}

export interface Coordinates {
  latitude: number
  longitude: number
}

/** A position reported by the browser, including its accuracy radius. */
export interface ReportedPosition extends Coordinates {
  accuracyMetres: number
}

/** A place the user picked from Google Maps search, before it becomes a Gym. */
export interface SelectedPlace {
  googlePlaceId: string | null
  name: string
  formattedAddress: string
  latitude: number
  longitude: number
}

export type GeolocationFailureReason = 'unsupported' | 'permission-denied' | 'unavailable' | 'timeout'

/** Every possible result of pressing the SHOW UP button. */
export type ShowupOutcome =
  | { type: 'success'; distanceMetres: number }
  | { type: 'outside-geofence'; distanceMetres: number }
  | { type: 'poor-accuracy'; accuracyMetres: number }
  | { type: 'location-error'; reason: GeolocationFailureReason }

/**
 * The only profile fields a user may change. There is deliberately no `isAdmin` here:
 * the database also refuses to let app users write it (see docs/DATABASE_SCHEMA.md).
 */
export interface ProfileEdits {
  firstName: string
  lastName: string
  /** `YYYY-MM-DD`, or null when the user leaves their birthday out. */
  dateOfBirth: string | null
}

/** Result of asking the app to save a profile, shaped for showing in a form. */
export type SaveResult = { ok: true } | { ok: false; message: string }

/**
 * Which places the gym search may offer.
 * - `fitness_only`: gyms and fitness-related places (everyone's default).
 * - `any_place`: any place on Google Maps. Only administrators can use this; the database enforces it.
 */
export type PlaceSearchMode = 'fitness_only' | 'any_place'

/** A row of the Supabase `public.profiles` table (see docs/DATABASE_SCHEMA.md). */
export interface Profile {
  /** Same ID as the signed-in Supabase Auth user. */
  id: string
  firstName: string | null
  lastName: string | null
  /** Calendar date as `YYYY-MM-DD`. */
  dateOfBirth: string | null
  isAdmin: boolean
  /**
   * The search mode that applies RIGHT NOW. For anyone who is not an administrator this is always
   * `fitness_only`, whatever was stored earlier (the database works this out, not the app).
   */
  placeSearchMode: PlaceSearchMode
  createdAt: string
  updatedAt: string
}
