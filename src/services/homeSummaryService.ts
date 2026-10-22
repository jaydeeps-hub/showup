import type { HomeSummary, PauseState } from '../types'
import { isIsoDate } from '../utils/calendarDates'
import { isRecord, toCount } from '../utils/jsonShape'
import { describeServiceError } from './rpcErrors'
import { supabase } from './supabaseClient'

/**
 * Loads the numbers shown on the Home screen through the database functions `get_home_summary` and
 * `get_pause_state`. This is the only file that calls them. The weeks-in-a-row count, the week
 * progress and the pause passes are all worked out by the database; nothing is counted here.
 */

export type HomeSummaryResult = { status: 'ok'; summary: HomeSummary } | { status: 'error'; message: string }
export type PauseStateResult = { status: 'ok'; pause: PauseState } | { status: 'error'; message: string }

/** Turns the database's JSON into a HomeSummary, or null if a required number is missing. */
export function parseHomeSummary(raw: unknown): HomeSummary | null {
  if (!isRecord(raw)) return null
  const weeksInARow = toCount(raw.weeks_in_a_row)
  const bestWeeksInARow = toCount(raw.best_weeks_in_a_row)
  const showupDaysThisWeek = toCount(raw.showup_days_this_week)
  const passesLeft = toCount(raw.passes_left)
  const totalShowups = toCount(raw.total_showups)
  if (
    weeksInARow === null ||
    bestWeeksInARow === null ||
    showupDaysThisWeek === null ||
    passesLeft === null ||
    totalShowups === null
  ) {
    return null
  }
  // goal_days is null until the user sets a goal; that is a real answer, not a missing one.
  const goalDays = raw.goal_days === null || raw.goal_days === undefined ? null : toCount(raw.goal_days)
  return { weeksInARow, bestWeeksInARow, goalDays, showupDaysThisWeek, passesLeft, totalShowups }
}

/**
 * Reads `active_pauses`: the Mondays of weeks covered by an active pause. Each entry may be the date
 * itself or an object holding it as `week_start`; anything else is ignored.
 */
export function parsePauseState(raw: unknown): PauseState | null {
  if (!isRecord(raw) || !Array.isArray(raw.active_pauses)) return null
  const activePauses = raw.active_pauses
    .map((entry): unknown => (isRecord(entry) ? entry.week_start : entry))
    .filter(isIsoDate)
  return { activePauses }
}

export async function fetchHomeSummary(): Promise<HomeSummaryResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { data, error } = await supabase.rpc('get_home_summary')
    if (error) {
      console.error('Could not load the home summary', error)
      return { status: 'error', message: describeServiceError(error) }
    }
    const summary = parseHomeSummary(data)
    if (!summary) {
      console.error('The home summary had an unexpected shape', data)
      return { status: 'error', message: "Your summary came back in a form we couldn't read. Please try again." }
    }
    return { status: 'ok', summary }
  } catch (error) {
    console.error('Unexpected error loading the home summary', error)
    return { status: 'error', message: describeServiceError({ message: error instanceof Error ? error.message : '' }) }
  }
}

export async function fetchPauseState(): Promise<PauseStateResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { data, error } = await supabase.rpc('get_pause_state')
    if (error) {
      console.error('Could not load the pause state', error)
      return { status: 'error', message: describeServiceError(error) }
    }
    const pause = parsePauseState(data)
    if (!pause) {
      console.error('The pause state had an unexpected shape', data)
      return { status: 'error', message: "Your pause details came back in a form we couldn't read. Please try again." }
    }
    return { status: 'ok', pause }
  } catch (error) {
    console.error('Unexpected error loading the pause state', error)
    return { status: 'error', message: describeServiceError({ message: error instanceof Error ? error.message : '' }) }
  }
}
