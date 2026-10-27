import { createContext, useContext, useSyncExternalStore } from 'react'
import type { EnginePhase, EngineSnapshot, ShowupEvent } from '../services/showupEngine'
import type { LastOutcome } from '../types'

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
  /** How the last timer ended if it ended badly; stays until the next start. Not consumed by anyone. */
  lastOutcome: LastOutcome | null
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

/** The engine's live state, for components that only want a small piece of it. */
export interface ShowupStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => EngineSnapshot
  /** Reads the position and starts a session. The same function for the life of the engine. */
  start: () => void
  /** Stops (cancels) the running session. The same function for the life of the engine. */
  stop: () => void
}

export const ShowupStoreContext = createContext<ShowupStore | null>(null)

/**
 * The two actions, without subscribing to any state. A component that only needs to start or stop a
 * Show Up does not re-render when the timer ticks.
 */
export function useShowupActions(): { start: () => void; stop: () => void } {
  const store = useContext(ShowupStoreContext)
  if (!store) throw new Error('useShowupActions must be used inside a <ShowupProvider>.')
  return store
}

/**
 * Reads ONE value from the engine and re-renders the component only when that value changes.
 *
 * `useShowupSession()` hands out everything, so every component that uses it re-renders on every
 * half-second tick of a running timer. Use this instead when a component needs just one thing, for
 * example the minutes left or whether the timer is running:
 *   const running = useShowupSelector((s) => s.phase === 'running')
 *
 * `select` must return a primitive (number, string, boolean) or an object that is the same instance
 * until it really changes; a fresh object each time would re-render on every tick.
 */
export function useShowupSelector<T>(select: (snapshot: EngineSnapshot) => T): T {
  const store = useContext(ShowupStoreContext)
  if (!store) throw new Error('useShowupSelector must be used inside a <ShowupProvider>.')
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()), () => select(store.getSnapshot()))
}
