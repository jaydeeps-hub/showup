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

/** A place the user picked from Google Maps search, before it becomes a Gym. */
export interface SelectedPlace {
  googlePlaceId: string | null
  name: string
  formattedAddress: string
  latitude: number
  longitude: number
}

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

/*
 * The timed Show Up (Phase 6). These types mirror the JSON the database functions return, field for
 * field (snake_case on purpose), so what the server sends and what the code reads look the same.
 */

/** How a timed Show Up session stands. Anything other than `running` means it is over. */
export type SessionStatus = 'running' | 'completed' | 'left_early' | 'missed_checks' | 'expired' | 'cancelled'

/** One scheduled check inside a session. */
export interface SessionCheckpoint {
  /** When the check is due, in seconds after the session started. */
  at_seconds: number
  /** False when the session has no location checks (only the end counts). */
  needs_location: boolean
  /** True once a passing check exists for this checkpoint. */
  done: boolean
}

/**
 * A timed Show Up session, as every Phase 6 database function describes it. All of the timing (how
 * long, how often, how many misses are forgiven) comes from here; the app never assumes any of it.
 */
export interface ShowupSession {
  session_id: string
  status: SessionStatus
  /** ISO timestamps from the SERVER's clock: when the session started, and when this answer was made. */
  started_at: string
  server_now: string
  elapsed_seconds: number
  duration_seconds: number
  interval_seconds: number
  max_missed_checks: number
  checkpoints: SessionCheckpoint[]
  location_checks_done: number
  location_checks_total: number
}

/** What `get_showup_state` returns. */
export interface ShowupState {
  /** Today for this user, `YYYY-MM-DD`, worked out by the server in their time zone. */
  today: string
  showed_up_today: boolean
  /** The running session, if there is one. */
  session: ShowupSession | null
}

/** What `start_showup` returns. */
export interface StartShowupResult {
  /** True when today already has a Showup, so no session was started. */
  already_done: boolean
  session: ShowupSession | null
}

/** What `check_showup` can answer: `running`, `not_due` and `poor_accuracy` keep the session going; the rest end it. */
export type CheckResult = 'running' | 'not_due' | 'poor_accuracy' | Exclude<SessionStatus, 'running'>

/** What `check_showup` returns. */
export interface CheckShowupResult {
  result: CheckResult
  /** Whether this reading was close enough. Present only when the server judged a reading. */
  check_passed?: boolean
  /** Seconds until the next scheduled check, when the server said. */
  next_check_in_seconds?: number
  /** On `completed`: true if a new Showup was written, false if the day already had one. */
  recorded?: boolean
  session: ShowupSession
}

/** A position for the timed Show Up: whole-number accuracy in metres, as the database functions expect. */
export interface DevicePosition {
  lat: number
  lng: number
  accuracy: number
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
