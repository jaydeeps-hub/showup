import type { PauseDetails } from '../types'
import { addDays, parseIsoDate } from './calendarDates'

/**
 * Wording and week lists for the Pause screen. Dates are plain `YYYY-MM-DD` text. A week's last day
 * is worked out with UTC date math (see addDays), and the text is never turned into a Date with
 * `new Date(string)`, so a time zone cannot move a week.
 */

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** The reasons offered as chips. Choosing none is fine. */
export const PAUSE_REASONS = ['Sick', 'Travelling', 'Busy', 'Other'] as const

/** A safety limit on how many weeks are listed, in case the database setting is set absurdly high. */
export const MAX_PAUSE_WEEK_OPTIONS = 26

/**
 * A week as "Oct 19–25", or "Oct 26–Nov 1" when it spans two months. `monday` is the week's Monday.
 * Falls back to the raw text if it is not a real date, so the label is never blank.
 */
export function weekLabel(monday: string): string {
  const start = parseIsoDate(monday)
  const end = parseIsoDate(addDays(monday, 6))
  if (!start || !end) return monday
  const first = `${SHORT_MONTHS[start.month - 1]} ${start.day}`
  const last = start.month === end.month ? `${end.day}` : `${SHORT_MONTHS[end.month - 1]} ${end.day}`
  return `${first}–${last}`
}

/** A date as "1 November", or null if it is not a real date. */
export function formatRefillDate(iso: string): string | null {
  const parts = parseIsoDate(iso)
  return parts ? `${parts.day} ${FULL_MONTHS[parts.month - 1]}` : null
}

export interface PauseWeekOption {
  /** The Monday, which is what `use_pause` receives. */
  weekStart: string
  /** "This week", "Next week", or the date label. */
  title: string
  /** The date label, e.g. "Oct 19–25". */
  label: string
}

/**
 * The weeks that can be paused: this week and every week up to `maxWeeksAhead` after it, leaving out
 * any that already have an active pause.
 */
export function pauseWeekOptions(pause: PauseDetails): PauseWeekOption[] {
  const count = Math.min(pause.maxWeeksAhead, MAX_PAUSE_WEEK_OPTIONS - 1)
  const options: PauseWeekOption[] = []
  for (let ahead = 0; ahead <= count; ahead++) {
    const weekStart = addDays(pause.thisWeek, ahead * 7)
    if (pause.activePauses.includes(weekStart)) continue
    const label = weekLabel(weekStart)
    options.push({ weekStart, title: ahead === 0 ? 'This week' : ahead === 1 ? 'Next week' : label, label })
  }
  return options
}

/** The help text under the button when there are no passes left. */
export function noPassesText(pause: PauseDetails): string {
  const refill = pause.nextRefill ? formatRefillDate(pause.nextRefill) : null
  return refill ? `No passes left. They refill on ${refill}.` : 'No passes left.'
}

/** The text in the confirmation sheet. `passesLeft` is the number BEFORE this pass is used. */
export function confirmText(label: string, passesLeft: number): string {
  return `Pause ${label}. You'll have ${Math.max(passesLeft - 1, 0)} left this month.`
}

const ERROR_MESSAGES: Record<string, string> = {
  no_passes_left: 'You have no passes left this month.',
  already_paused: 'That week is already paused.',
  already_achieved: "You already hit your goal that week, so you don't need a pause.",
  week_in_past: "You can't pause a week that has already started.",
  week_too_far_ahead: 'You can only pause this week or next week.',
  invalid_week: 'Pick a week to pause.',
}

export const GENERIC_PAUSE_ERROR = 'Something went wrong. Try again.'

/**
 * A friendly message for an error from the database. The server's message starts with a code such as
 * "no_passes_left: ..."; only the code is read. The server's own text is never shown.
 */
export function pauseErrorMessage(serverMessage: string | undefined): string {
  const code = /^\s*([a-z_]+)/.exec(serverMessage ?? '')?.[1]
  return (code && ERROR_MESSAGES[code]) || GENERIC_PAUSE_ERROR
}
