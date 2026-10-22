import { useCallback, useEffect, useState } from 'react'
import { fetchCalendar } from '../services/calendarService'
import type { CalendarData } from '../types'

export type CalendarState =
  | { status: 'loading' }
  | { status: 'ready'; calendar: CalendarData }
  | { status: 'error'; message: string }

/** What was last received, and which month was asked for to get it. */
type Received = { forMonth: string; state: CalendarState }

/**
 * Loads one month of the calendar with `get_calendar`. `monthStart` is the first of the month as
 * `YYYY-MM-01`. It reloads when the month changes, and again whenever `refreshKey` changes (after a
 * Show Up).
 *
 * Changing month shows the loading state straight away (the old month is never left on screen under
 * a new heading). A refresh of the SAME month keeps showing the current grid until the new one
 * arrives, so the calendar does not flash after a Show Up. Answers that arrive late for a month the
 * person has already left are ignored.
 */
export function useCalendar(monthStart: string, refreshKey: number): CalendarState & { retry: () => void } {
  const [received, setReceived] = useState<Received | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetchCalendar(monthStart)
      .then((result) => {
        if (cancelled) return
        setReceived({
          forMonth: monthStart,
          state: result.status === 'ok' ? { status: 'ready', calendar: result.calendar } : { status: 'error', message: result.message },
        })
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the calendar', error)
        if (!cancelled) {
          setReceived({ forMonth: monthStart, state: { status: 'error', message: 'Something went wrong while loading the calendar.' } })
        }
      })

    return () => {
      cancelled = true
    }
  }, [monthStart, refreshKey, attempt])

  const retry = useCallback(() => {
    setReceived(null)
    setAttempt((count) => count + 1)
  }, [])

  const state: CalendarState = received && received.forMonth === monthStart ? received.state : { status: 'loading' }
  return { ...state, retry }
}
