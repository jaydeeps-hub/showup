import { useCallback, useEffect, useState } from 'react'
import { squadBadgeStore } from '../services/squadBadgeStore'
import { getSquad } from '../services/squadService'
import type { SquadState } from '../types'

export type SquadLoadState =
  | { status: 'loading' }
  | { status: 'ready'; squad: SquadState }
  | { status: 'error'; message: string }

export interface UseSquad {
  state: SquadLoadState
  /** Loads the squad again (after an action, or by hand). Keeps showing the current squad until the new one arrives. */
  refresh: () => void
  /**
   * The message of the last refresh that failed while a squad was already showing, or null. The squad stays on screen
   * (a page the person is reading is never blanked by a refresh that failed); this says that it may be out of date.
   */
  refreshError: string | null
  /** Requests waiting for the person's answer, for the Squad tab's badge. 0 until the squad has loaded. */
  incomingCount: number
}

/**
 * The Squad page's data, from `get_squad`. It loads when the Squad tab opens (when this hook first runs) and again
 * whenever the page becomes visible after being hidden (coming back to the app), the same as Home.
 *
 * A refresh keeps the current squad showing until the new one arrives, so the page does not flash; a refresh that fails
 * keeps it showing too and reports `refreshError`. Only a FIRST load that fails shows the error state.
 */
export function useSquad(): UseSquad {
  const [state, setState] = useState<SquadLoadState>({ status: 'loading' })
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false // ignore a slow answer if a newer request started or the page went away

    getSquad()
      .then((result) => {
        if (cancelled) return
        if (result.status === 'ok') {
          setState({ status: 'ready', squad: result.squad })
          setRefreshError(null)
          // Keep the tab's badge in step with what this page now shows.
          squadBadgeStore.set(result.squad.incomingCount)
          return
        }
        // Keep a squad that is already showing; only a first load turns into the error state.
        setState((current) => (current.status === 'ready' ? current : { status: 'error', message: result.message }))
        setRefreshError((current) => current ?? result.message)
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the squad', error)
        if (cancelled) return
        const message = 'Something went wrong. Try again.'
        setState((current) => (current.status === 'ready' ? current : { status: 'error', message }))
        setRefreshError(message)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const refresh = useCallback(() => {
    // After an error there is nothing to keep showing, so say it is loading again; otherwise keep the squad.
    setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    setAttempt((count) => count + 1)
  }, [])

  // Coming back to the app (for example after replying to a friend elsewhere): load again.
  useEffect(() => {
    function reloadWhenVisible() {
      if (document.visibilityState === 'visible') setAttempt((count) => count + 1)
    }
    document.addEventListener('visibilitychange', reloadWhenVisible)
    return () => document.removeEventListener('visibilitychange', reloadWhenVisible)
  }, [])

  const incomingCount = state.status === 'ready' ? state.squad.incomingCount : 0
  return { state, refresh, refreshError, incomingCount }
}
