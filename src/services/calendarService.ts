import type { CalendarData, CalendarWeek, WeekStatus } from '../types'
import { isIsoDate } from '../utils/calendarDates'
import { isRecord, toCount } from '../utils/jsonShape'
import { describeServiceError } from './rpcErrors'
import { supabase } from './supabaseClient'

/**
 * Loads the calendar for one month through the database function `get_calendar`. This is the only
 * file that calls it. The answer is checked before it is used: anything unexpected becomes a clear
 * error rather than a half-drawn calendar.
 */

export type CalendarResult = { status: 'ok'; calendar: CalendarData } | { status: 'error'; message: string }

const KNOWN_STATUSES: readonly WeekStatus[] = ['achieved', 'paused', 'in_progress', 'missed', 'upcoming']

function toWeekStatus(value: unknown): WeekStatus {
  return KNOWN_STATUSES.find((status) => status === value) ?? 'unknown'
}

function parseWeek(raw: unknown): CalendarWeek | null {
  if (!isRecord(raw) || !isIsoDate(raw.week_start)) return null
  return {
    weekStart: raw.week_start,
    // Null (not zero) for a week before the user's first goal.
    goalDays: raw.goal_days === null || raw.goal_days === undefined ? null : toCount(raw.goal_days),
    showupDays: toCount(raw.showup_days) ?? 0,
    status: toWeekStatus(raw.status),
  }
}

/** Turns the database's JSON into a CalendarData, or null if the required parts are missing. */
export function parseCalendar(raw: unknown): CalendarData | null {
  if (!isRecord(raw)) return null
  const { month, earliest_month: earliestMonth, latest_month: latestMonth, grid_from: gridFrom, grid_to: gridTo } = raw
  if (!isIsoDate(month) || !isIsoDate(earliestMonth) || !isIsoDate(latestMonth) || !isIsoDate(gridFrom) || !isIsoDate(gridTo)) {
    return null
  }
  if (!Array.isArray(raw.showup_dates) || !Array.isArray(raw.weeks)) return null

  return {
    month,
    earliestMonth,
    latestMonth,
    gridFrom,
    gridTo,
    showupDates: raw.showup_dates.filter(isIsoDate),
    weeks: raw.weeks.map(parseWeek).filter((week): week is CalendarWeek => week !== null),
  }
}

/** `monthStart` is the first day of the month as `YYYY-MM-01`. The database limits it to the allowed range. */
export async function fetchCalendar(monthStart: string): Promise<CalendarResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { data, error } = await supabase.rpc('get_calendar', { p_month: monthStart })
    if (error) {
      console.error('Could not load the calendar', error)
      return { status: 'error', message: describeServiceError(error) }
    }
    const calendar = parseCalendar(data)
    if (!calendar) {
      console.error('The calendar response had an unexpected shape', data)
      return { status: 'error', message: "The calendar came back in a form we couldn't read. Please try again." }
    }
    return { status: 'ok', calendar }
  } catch (error) {
    console.error('Unexpected error loading the calendar', error)
    return { status: 'error', message: describeServiceError({ message: error instanceof Error ? error.message : '' }) }
  }
}
