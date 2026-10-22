import { useCallback, useEffect, useState } from 'react'
import { fetchHomeSummary, fetchPauseState } from '../services/homeSummaryService'
import type { HomeSummary, PauseState } from '../types'

export type HomeSummaryState =
  | { status: 'loading' }
  | { status: 'ready'; summary: HomeSummary; pause: PauseState }
  | { status: 'error'; message: string }

/**
 * Loads the Home numbers (`get_home_summary`) and the active pauses (`get_pause_state`) together.
 * Both must succeed: showing "0 of 3 days" for a paused week would be wrong, so a failure of either
 * is shown as an error with a retry instead of partial numbers.
 *
 * It loads when the screen appears and again whenever `refreshKey` changes (after a Show Up, or when
 * the person comes back to the app). A refresh keeps showing the current numbers until the new ones
 * arrive, so the screen does not flash.
 */
export function useHomeSummary(refreshKey: number): HomeSummaryState & { retry: () => void } {
  const [state, setState] = useState<HomeSummaryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false // ignore a slow answer if a newer request started or the screen went away

    Promise.all([fetchHomeSummary(), fetchPauseState()])
      .then(([summary, pause]) => {
        if (cancelled) return
        if (summary.status === 'error') setState({ status: 'error', message: summary.message })
        else if (pause.status === 'error') setState({ status: 'error', message: pause.message })
        else setState({ status: 'ready', summary: summary.summary, pause: pause.pause })
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the home summary', error)
        if (!cancelled) setState({ status: 'error', message: 'Something went wrong while loading your numbers.' })
      })

    return () => {
      cancelled = true
    }
  }, [refreshKey, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  return { ...state, retry }
}
