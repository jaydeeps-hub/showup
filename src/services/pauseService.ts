import type { PauseDetails } from '../types'
import { isIsoDate } from '../utils/calendarDates'
import { isRecord, toCount } from '../utils/jsonShape'
import { GENERIC_PAUSE_ERROR, pauseErrorMessage } from '../utils/pause'
import { parsePauseState } from './homeSummaryService'
import { describeServiceError } from './rpcErrors'
import { supabase } from './supabaseClient'

/**
 * Reads and changes pauses through the database functions `get_pause_state`, `use_pause` and
 * `end_pause`. This is the only file that calls them for the Pause screen. The database decides
 * everything (which weeks are allowed, how many passes are left); the app only shows it.
 *
 * Errors are turned into friendly text here, so a raw database message can never reach the screen.
 */

export type PauseDetailsResult = { status: 'ok'; pause: PauseDetails } | { status: 'error'; message: string }
export type PauseActionResult = { status: 'ok' } | { status: 'error'; message: string }

/** Turns the database's JSON into PauseDetails, or null if a required part is missing. */
export function parsePauseDetails(raw: unknown): PauseDetails | null {
  if (!isRecord(raw)) return null
  const state = parsePauseState(raw)
  const maxWeeksAhead = toCount(raw.max_weeks_ahead)
  const passesTotal = toCount(raw.passes_total)
  const passesLeft = toCount(raw.passes_left)
  if (!state || maxWeeksAhead === null || passesTotal === null || passesLeft === null) return null
  if (!isIsoDate(raw.today) || !isIsoDate(raw.this_week)) return null

  return {
    ...state,
    today: raw.today,
    thisWeek: raw.this_week,
    maxWeeksAhead,
    passesTotal,
    passesLeft,
    nextRefill: isIsoDate(raw.next_refill) ? raw.next_refill : null,
  }
}

export async function fetchPauseDetails(): Promise<PauseDetailsResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { data, error } = await supabase.rpc('get_pause_state')
    if (error) {
      console.error('Could not load the pause state', error)
      return { status: 'error', message: describeServiceError(error) }
    }
    const pause = parsePauseDetails(data)
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

/** Spends one pass to pause the week starting on `weekStart` (a Monday). `reason` is optional. */
export async function startPause(weekStart: string, reason: string | null): Promise<PauseActionResult> {
  if (!supabase) return { status: 'error', message: GENERIC_PAUSE_ERROR }
  try {
    const { error } = await supabase.rpc('use_pause', { p_week_start: weekStart, p_reason: reason })
    if (error) {
      console.error('Could not use a pause pass', error)
      return { status: 'error', message: pauseErrorMessage(error.message) }
    }
    return { status: 'ok' }
  } catch (error) {
    console.error('Unexpected error using a pause pass', error)
    return { status: 'error', message: GENERIC_PAUSE_ERROR }
  }
}

/** Ends a pause early. The pass is not given back. */
export async function endPause(weekStart: string): Promise<PauseActionResult> {
  if (!supabase) return { status: 'error', message: GENERIC_PAUSE_ERROR }
  try {
    const { error } = await supabase.rpc('end_pause', { p_week_start: weekStart })
    if (error) {
      console.error('Could not end the pause', error)
      return { status: 'error', message: pauseErrorMessage(error.message) }
    }
    return { status: 'ok' }
  } catch (error) {
    console.error('Unexpected error ending the pause', error)
    return { status: 'error', message: GENERIC_PAUSE_ERROR }
  }
}
