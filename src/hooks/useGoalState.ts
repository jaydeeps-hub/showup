import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGoalState, setWeeklyGoal } from '../services/goalService'
import type { GoalState } from '../types'
import { goalSavedMessage } from '../utils/goal'

export type GoalLoad = { status: 'loading' } | { status: 'ready'; goal: GoalState } | { status: 'error'; message: string }

/** The result of saving a goal, with the text for the toast either way. */
export type GoalSaveResult = { ok: true; message: string } | { ok: false; message: string }

/** What `useGoalState` returns: the load state plus `retry` and `save`. */
export type GoalStateHandle = GoalLoad & { retry: () => void; save: (days: number) => Promise<GoalSaveResult> }

/**
 * Loads the weekly goal (`get_goal_state`) and saves a new one (`set_weekly_goal`).
 *
 * After a successful save it reads the goal back from the server, because the server decides when
 * the new goal starts. The message it returns uses that fresh answer.
 */
export function useGoalState(): GoalStateHandle {
  const [state, setState] = useState<GoalLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // The latest loaded goal, for `save` to know whether a goal existed before saving.
  const loadedGoal = useRef<GoalState | null>(null)
  useEffect(() => {
    loadedGoal.current = state.status === 'ready' ? state.goal : null
  }, [state])

  useEffect(() => {
    let cancelled = false

    fetchGoalState()
      .then((result) => {
        if (cancelled) return
        setState(result.status === 'ok' ? { status: 'ready', goal: result.goal } : { status: 'error', message: result.message })
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the weekly goal', error)
        if (!cancelled) setState({ status: 'error', message: 'Something went wrong while loading your goal.' })
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  const save = useCallback(async (days: number): Promise<GoalSaveResult> => {
    const before = loadedGoal.current
    // Without the loaded goal we cannot tell a first goal from a change, so the message would be wrong.
    if (!before) return { ok: false, message: "Your goal hasn't loaded yet. Please wait a moment and try again." }

    const saved = await setWeeklyGoal(days)
    if (saved.status === 'error') return { ok: false, message: saved.message }

    const fresh = await fetchGoalState()
    if (fresh.status === 'ok') setState({ status: 'ready', goal: fresh.goal })
    return { ok: true, message: goalSavedMessage(before.hasGoal, fresh.status === 'ok' ? fresh.goal : null) }
  }, [])

  return { ...state, retry, save }
}
