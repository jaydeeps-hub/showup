import { createContext, useContext } from 'react'
import type { EnginePhase, ShowupEvent } from '../services/showupEngine'

/**
 * The value the timed Show Up shares with the whole app, and the hook that reads it. Kept apart from
 * the provider component (useShowupSession.tsx) so each file exports only components or only
 * non-components, which keeps hot reloading working.
 *
 * Named `useShowupSession` because `useShowup` already exists (src/hooks/useShowup.ts: the gym, and the
 * old one-tap Show Up that stays until the UI is switched over).
 */

export interface ShowupSessionValue {
  state: EnginePhase
  /** Whole seconds until the timer ends. */
  remainingSeconds: number
  /** 0 to 1. */
  progress: number
  checksDone: number
  checksTotal: number
  /** True once today has a Showup. */
  showedUpToday: boolean
  /** Goes up each time a visit finishes or is found already counted. Add it to a reload key to refresh numbers. */
  completions: number
  /** The latest thing that happened, shown once; call `clearEvent` after showing it. */
  event: ShowupEvent | null
  clearEvent: () => void
  /** Reads the position and starts a session. */
  start: () => void
  /** Stops (cancels) the running session. */
  stop: () => void
}

export const ShowupSessionContext = createContext<ShowupSessionValue | null>(null)

/** The timed Show Up. Must be used under a ShowupProvider. */
export function useShowupSession(): ShowupSessionValue {
  const value = useContext(ShowupSessionContext)
  if (!value) throw new Error('useShowupSession must be used inside a <ShowupProvider>.')
  return value
}
