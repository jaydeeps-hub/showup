import { supabase } from './supabaseClient'

/**
 * Settings that can be changed in the database without releasing a new app version (the `config.*`
 * rows in the `config` table, renamed from `cms` in Phase 9). They are fetched through `get_app_config()` and kept for about an hour.
 * Every value has a safe built-in default, because these rows are edited by hand: a missing, empty
 * or unreadable value never breaks the app, it just falls back.
 */

export interface AppConfig {
  /** How close, in metres, the user must be to the gym for a Showup to count. */
  maxGymDistanceMeters: number
  /** The earliest month the calendar can show, as `YYYY-MM`. */
  calendarStartMonth: string
  /** Pause passes available each month. */
  pausePassesPerMonth: number
  /** How many weeks ahead a pause can be booked. */
  pauseMaxWeeksAhead: number
  /** Seconds left on a Show Up timer at which the mascot switches to "almost there". */
  mascotAlmostSeconds: number
  /** How far, in metres, "Gyms near me" looks around the device. Google allows at most 50,000. */
  gymSearchRadiusMeters: number
  /** The most gyms "Gyms near me" lists. Google allows 1 to 20. */
  gymSearchMaxResults: number
}

/** The most Google accepts for a nearby search's radius, and for its number of results. */
export const MAX_GYM_SEARCH_RADIUS_METERS = 50_000
export const MAX_GYM_SEARCH_RESULTS = 20

/** Used whenever a value is missing or cannot be read. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  maxGymDistanceMeters: 100,
  calendarStartMonth: '2026-06',
  pausePassesPerMonth: 3,
  pauseMaxWeeksAhead: 1,
  mascotAlmostSeconds: 180,
  gymSearchRadiusMeters: 5000,
  gymSearchMaxResults: 20,
}

/** How long a fetched config is reused before it is fetched again. */
export const APP_CONFIG_CACHE_MS = 60 * 60 * 1000

/** A whole number of at least `min`, or `fallback` if the value is not one. */
function parseWholeNumber(value: unknown, fallback: number, min: number): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^-?\d+$/.test(text)) return fallback
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : fallback
}

/** A whole number from `min` to `max`, or `fallback` if the value is not one (a typo cannot make Google refuse a request). */
function parseWholeNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = parseWholeNumber(value, Number.NaN, min)
  return Number.isNaN(parsed) || parsed > max ? fallback : parsed
}

/** `YYYY-MM` with a real month, or `fallback`. */
function parseMonth(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : fallback
}

/** Turns whatever the database returned into a complete, valid AppConfig. Never throws. */
export function parseAppConfig(raw: unknown): AppConfig {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_APP_CONFIG
  return {
    // A distance of 0 would reject everyone, so at least 1 metre.
    maxGymDistanceMeters: parseWholeNumber(source.max_gym_distance_meters, d.maxGymDistanceMeters, 1),
    calendarStartMonth: parseMonth(source.calendar_start_month, d.calendarStartMonth),
    pausePassesPerMonth: parseWholeNumber(source.pause_passes_per_month, d.pausePassesPerMonth, 0),
    pauseMaxWeeksAhead: parseWholeNumber(source.pause_max_weeks_ahead, d.pauseMaxWeeksAhead, 0),
    mascotAlmostSeconds: parseWholeNumber(source.mascot_almost_seconds, d.mascotAlmostSeconds, 0),
    gymSearchRadiusMeters: parseWholeNumberInRange(source.gym_search_radius_meters, d.gymSearchRadiusMeters, 1, MAX_GYM_SEARCH_RADIUS_METERS),
    gymSearchMaxResults: parseWholeNumberInRange(source.gym_search_max_results, d.gymSearchMaxResults, 1, MAX_GYM_SEARCH_RESULTS),
  }
}

let cached: { config: AppConfig; fetchedAt: number } | null = null
let inFlight: Promise<AppConfig> | null = null

/** The config last fetched, or the defaults if nothing has been fetched yet. Instant; never fetches. */
export function getCachedAppConfig(): AppConfig {
  return cached?.config ?? DEFAULT_APP_CONFIG
}

/**
 * The app config. Reuses the cached copy for an hour. If it cannot be fetched (offline, signed out,
 * not set up) it quietly returns the last good copy, or the defaults. It never throws. Two callers
 * at the same time share one request.
 */
export async function loadAppConfig(options: { now?: number; force?: boolean } = {}): Promise<AppConfig> {
  const now = options.now ?? Date.now()
  if (!options.force && cached && now - cached.fetchedAt < APP_CONFIG_CACHE_MS) return cached.config
  if (inFlight) return inFlight

  inFlight = (async () => {
    if (!supabase) return getCachedAppConfig()
    try {
      const { data, error } = await supabase.rpc('get_app_config')
      if (error) {
        console.error('Could not load the app config; using the last known values', error)
        return getCachedAppConfig()
      }
      const config = parseAppConfig(data)
      cached = { config, fetchedAt: now }
      return config
    } catch (error) {
      console.error('Unexpected error loading the app config; using the last known values', error)
      return getCachedAppConfig()
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** For tests: forget everything that was cached. */
export function resetAppConfigCache(): void {
  cached = null
  inFlight = null
}
