import type { GoalState } from '../types'
import { isIsoDate } from '../utils/calendarDates'
import { MAX_GOAL_DAYS, MIN_GOAL_DAYS } from '../utils/goal'
import { isRecord, toCount } from '../utils/jsonShape'
import { describeServiceError } from './rpcErrors'
import { supabase } from './supabaseClient'

/**
 * Reads and changes the weekly goal through the database functions `get_goal_state` and
 * `set_weekly_goal`. This is the only file that calls them.
 *
 * The database decides WHEN a goal takes effect (the first goal this week, a change next Monday).
 * This file never works that out: it only passes the date the server reports back.
 */

export type GoalStateResult = { status: 'ok'; goal: GoalState } | { status: 'error'; message: string }
export type SetGoalResult = { status: 'saved' } | { status: 'error'; message: string }

/** A whole number from 1 to 7, or null. */
function toGoalDays(value: unknown): number | null {
  const days = toCount(value)
  return days !== null && days >= MIN_GOAL_DAYS && days <= MAX_GOAL_DAYS ? days : null
}

/** Turns the database's JSON into a GoalState, or null if it is not in the expected form. */
export function parseGoalState(raw: unknown): GoalState | null {
  if (!isRecord(raw) || typeof raw.has_goal !== 'boolean') return null
  const pendingGoal = toGoalDays(raw.pending_goal)
  return {
    hasGoal: raw.has_goal,
    currentGoal: toGoalDays(raw.current_goal),
    pendingGoal,
    // Only meaningful alongside a pending goal.
    pendingFrom: pendingGoal !== null && isIsoDate(raw.pending_from) ? raw.pending_from : null,
  }
}

function describeSetGoalError(error: { message?: string }): string {
  const message = error.message ?? ''
  if (/invalid_goal/.test(message)) return `Choose between ${MIN_GOAL_DAYS} and ${MAX_GOAL_DAYS} days a week.`
  if (/not_signed_in/.test(message)) return 'Please sign in again to change your goal.'
  return describeServiceError(error)
}

export async function fetchGoalState(): Promise<GoalStateResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { data, error } = await supabase.rpc('get_goal_state')
    if (error) {
      console.error('Could not load the weekly goal', error)
      return { status: 'error', message: describeServiceError(error) }
    }
    const goal = parseGoalState(data)
    if (!goal) {
      console.error('The weekly goal had an unexpected shape', data)
      return { status: 'error', message: "Your goal came back in a form we couldn't read. Please try again." }
    }
    return { status: 'ok', goal }
  } catch (error) {
    console.error('Unexpected error loading the weekly goal', error)
    return { status: 'error', message: describeServiceError({ message: error instanceof Error ? error.message : '' }) }
  }
}

/** Asks the database to set the goal. It works out the start date itself. */
export async function setWeeklyGoal(days: number): Promise<SetGoalResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { error } = await supabase.rpc('set_weekly_goal', { p_days: days })
    if (error) {
      console.error('Could not set the weekly goal', error)
      return { status: 'error', message: describeSetGoalError(error) }
    }
    return { status: 'saved' }
  } catch (error) {
    console.error('Unexpected error setting the weekly goal', error)
    return { status: 'error', message: describeSetGoalError({ message: error instanceof Error ? error.message : '' }) }
  }
}
