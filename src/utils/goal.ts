import type { GoalState } from '../types'
import { parseIsoDate } from './calendarDates'

/** The fewest and most days a week a goal can be. Matches the database. */
export const MIN_GOAL_DAYS = 1
export const MAX_GOAL_DAYS = 7
/** Where the picker starts for someone with no goal yet. */
export const DEFAULT_GOAL_DAYS = 3

const GOAL_LABELS: Record<number, string> = {
  1: 'A gentle start',
  2: 'Light and steady',
  3: 'Steady',
  4: 'Committed',
  5: 'A strong week',
  6: 'Nearly every day',
  7: 'Every day',
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** The encouraging label for a number of days, or an empty string for anything outside 1 to 7. */
export function goalLabel(days: number): string {
  return GOAL_LABELS[days] ?? ''
}

/** "1 day" or "3 days". */
export function daysText(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** The number the picker or stepper starts on: the pending goal, else the current goal, else 3. */
export function initialGoalDays(goal: GoalState | null): number {
  return goal?.pendingGoal ?? goal?.currentGoal ?? DEFAULT_GOAL_DAYS
}

/**
 * A `YYYY-MM-DD` date as "26 Oct". Only the text is split and looked up, never turned into a Date
 * with `new Date(string)`, so a time zone can never move it to a different day.
 */
export function formatShortDate(iso: string): string | null {
  const parts = parseIsoDate(iso)
  return parts ? `${parts.day} ${SHORT_MONTHS[parts.month - 1]}` : null
}

/** "Your goal changes to 4 days a week on Mon 26 Oct." Null when there is nothing pending (or no usable date). */
export function pendingGoalNote(goal: GoalState | null): string | null {
  if (!goal || goal.pendingGoal === null || goal.pendingFrom === null) return null
  const from = formatShortDate(goal.pendingFrom)
  return from ? `Your goal changes to ${daysText(goal.pendingGoal)} a week on Mon ${from}.` : null
}

/**
 * The message shown after a goal was saved.
 * - The very first goal starts this week.
 * - A later change starts on the Monday the server reported.
 * `fresh` is the state read back from the server after saving.
 */
export function goalSavedMessage(hadGoalBefore: boolean, fresh: GoalState | null): string {
  if (!hadGoalBefore) return 'Goal set. It starts this week.'
  const from = fresh?.pendingFrom ? formatShortDate(fresh.pendingFrom) : null
  return from ? `Goal updated. It starts Monday ${from}.` : 'Goal updated.'
}
