/**
 * Core data types for Showup. Gyms and Showups are stored in Supabase (see docs/DATABASE_SCHEMA.md);
 * these are the shapes the app works with after reading them.
 */

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

/**
 * How the database describes one Monday-to-Sunday week. `unknown` stands for any status this
 * version of the app does not recognise, so a new status on the server never breaks the screen.
 */
export type WeekStatus = 'achieved' | 'paused' | 'in_progress' | 'missed' | 'upcoming' | 'unknown'

export interface CalendarWeek {
  /** The Monday of the week, `YYYY-MM-DD`. */
  weekStart: string
  /** The goal that applied to that week. Null for a week before the user's first goal. */
  goalDays: number | null
  showupDays: number
  status: WeekStatus
}

/** What `get_calendar` returns. Every date is plain `YYYY-MM-DD` text. */
export interface CalendarData {
  /** The month being shown (`YYYY-MM-01`), after the server has limited it to the allowed range. */
  month: string
  earliestMonth: string
  latestMonth: string
  /** The Monday the visible grid starts on and the Sunday it ends on. */
  gridFrom: string
  gridTo: string
  showupDates: string[]
  weeks: CalendarWeek[]
}

/** What `get_home_summary` returns. */
export interface HomeSummary {
  weeksInARow: number
  bestWeeksInARow: number
  /** This week's goal. Null until the user has set one. */
  goalDays: number | null
  showupDaysThisWeek: number
  passesLeft: number
  totalShowups: number
}

/**
 * What `get_goal_state` returns. A change to an existing goal does not apply until the next Monday,
 * so there can be a pending goal waiting; its start date comes from the server and is never worked
 * out in the app.
 */
export interface GoalState {
  hasGoal: boolean
  /** The goal in force this week. Null if the user has never set one. */
  currentGoal: number | null
  /** A new goal waiting for its start date. */
  pendingGoal: number | null
  /** The Monday the pending goal starts, as `YYYY-MM-DD` text exactly as the server sent it. */
  pendingFrom: string | null
}

/** What `get_pause_state` returns: the Mondays of the weeks covered by an active pause. */
export interface PauseState {
  activePauses: string[]
}

/**
 * Everything the Pause screen needs from `get_pause_state`. Every date is plain `YYYY-MM-DD` text
 * exactly as the server sent it.
 */
export interface PauseDetails extends PauseState {
  /** Today's date for this user, worked out by the server in their time zone. */
  today: string
  /** The Monday of the current week. */
  thisWeek: string
  /** How many weeks after this one can still be paused. */
  maxWeeksAhead: number
  passesTotal: number
  passesLeft: number
  /** The day passes come back, or null if the server did not say. */
  nextRefill: string | null
}
