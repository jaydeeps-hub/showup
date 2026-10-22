/**
 * Helpers for calendar dates written as plain `YYYY-MM-DD` text, such as the dates the database
 * sends for the calendar.
 *
 * Why not `new Date("2026-10-21")`? A date-only string is read as midnight UTC, and showing it in
 * the viewer's local time zone can move it to the previous day (anywhere west of UTC). So these
 * dates are only ever split into numbers, calculated with `Date.UTC`, and compared as text. Because
 * every part is zero-padded, comparing two `YYYY-MM-DD` strings with < and > orders them by date.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const MONTH_NAMES = [
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

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export interface DateParts {
  year: number
  /** 1 to 12. */
  month: number
  day: number
}

/** Splits `YYYY-MM-DD` into numbers, or returns null if it is not a real calendar date. */
export function parseIsoDate(value: string): DateParts | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  const isReal = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  return isReal ? { year, month, day } : null
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

/** `iso` moved by a number of days (negative goes back). An invalid date is returned unchanged. */
export function addDays(iso: string, days: number): string {
  const parts = parseIsoDate(iso)
  if (!parts) return iso
  const moved = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return formatIsoDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate())
}

/** 0 for Monday up to 6 for Sunday. */
export function weekdayIndex(iso: string): number {
  const parts = parseIsoDate(iso)
  if (!parts) return 0
  const sundayFirst = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  return (sundayFirst + 6) % 7
}

/** The Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso))
}

/** The first day of the month containing `iso`, for example `2026-10-21` gives `2026-10-01`. */
export function monthStartOf(iso: string): string {
  const parts = parseIsoDate(iso)
  return parts ? formatIsoDate(parts.year, parts.month, 1) : iso
}

/** The first day of the month `months` away from the one containing `iso` (negative goes back). */
export function addMonths(iso: string, months: number): string {
  const parts = parseIsoDate(iso)
  if (!parts) return iso
  const index = parts.year * 12 + (parts.month - 1) + months
  const year = Math.floor(index / 12)
  return formatIsoDate(year, index - year * 12 + 1, 1)
}

/** For example `October 2026`. */
export function monthLabel(iso: string): string {
  const parts = parseIsoDate(iso)
  return parts ? `${MONTH_NAMES[parts.month - 1]} ${parts.year}` : ''
}

/** For example `Wednesday, 21 October 2026`. Used for screen reader labels. */
export function formatLongDate(iso: string): string {
  const parts = parseIsoDate(iso)
  if (!parts) return iso
  return `${WEEKDAY_NAMES[weekdayIndex(iso)]}, ${parts.day} ${MONTH_NAMES[parts.month - 1]} ${parts.year}`
}

/** Today's calendar date on THIS DEVICE, as `YYYY-MM-DD`. */
export function localTodayIso(now: Date = new Date()): string {
  return formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export interface CalendarCell {
  date: string
  /** False for the days of neighbouring months that share the first or last week of the grid. */
  inMonth: boolean
}

export interface CalendarRow {
  /** The Monday this row starts on. */
  weekStart: string
  cells: CalendarCell[]
}

/** A month never needs more than six weeks. */
const MAX_CALENDAR_ROWS = 6

/** Splits the grid range the database returned into Monday-to-Sunday rows. */
export function buildCalendarRows(gridFrom: string, gridTo: string, monthStart: string): CalendarRow[] {
  const month = monthStart.slice(0, 7)
  const rows: CalendarRow[] = []
  let weekStart = mondayOf(gridFrom)
  while (weekStart <= gridTo && rows.length < MAX_CALENDAR_ROWS) {
    const cells = Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(weekStart, offset)
      return { date, inMonth: date.slice(0, 7) === month }
    })
    rows.push({ weekStart, cells })
    weekStart = addDays(weekStart, 7)
  }
  return rows
}
