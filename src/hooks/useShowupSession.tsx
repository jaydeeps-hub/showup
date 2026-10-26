import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { getPosition } from '../services/devicePosition'
import { ShowupEngine, type EngineDependencies } from '../services/showupEngine'
import { cancelShowup, checkShowup, getShowupState, startShowup } from '../services/showupSessionService'
import { acquireWakeLock, reacquireWakeLockIfWanted, releaseWakeLock } from '../services/wakeLock'
import { ShowupSessionContext, type ShowupSessionValue } from './showupSessionContext'

/**
 * The timed Show Up, available to the whole app (read it with `useShowupSession()` from
 * ./showupSessionContext).
 *
 * It lives in a provider ABOVE the tabs on purpose: the checks must keep running while the person
 * switches between Pause, Home and Profile, which unmount and remount their screens. All of the logic
 * is in ShowupEngine (services/showupEngine.ts); this file only connects it to React.
 */

/** The real network, location and clock. Defined once so it is the same object on every render. */
const realDependencies: EngineDependencies = {
  getState: getShowupState,
  start: startShowup,
  check: checkShowup,
  cancel: cancelShowup,
  getPosition,
  now: () => Date.now(),
  acquireWakeLock,
  releaseWakeLock,
}

interface ShowupProviderProps {
  /** The signed-in user's active gym id, or null when they have none yet. A new session starts at this gym. */
  gymId: string | null
  /** The signed-in user. When it changes, a new engine is created so nothing leaks between accounts. */
  userId: string
  children: ReactNode
}

export function ShowupProvider({ gymId, userId, children }: ShowupProviderProps) {
  // One engine per signed-in user. Creating it here only decides WHEN a new one is made; it is started
  // and stopped in the effect below, which keeps this safe under React StrictMode (which runs effects
  // twice in development).
  const engine = useMemo(() => {
    void userId // a different user gets a different engine
    return new ShowupEngine(realDependencies)
  }, [userId])

  useEffect(() => {
    engine.setGym(gymId)
  }, [engine, gymId])

  // App load: resume a running session, or show "done" if today already has a Showup. Then, whenever
  // the page becomes visible again, ask the server where things stand and catch up on due checks.
  useEffect(() => {
    void engine.load()
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      reacquireWakeLockIfWanted()
      void engine.resync()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      engine.destroy()
    }
  }, [engine])

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)

  const value = useMemo<ShowupSessionValue>(
    () => ({
      state: snapshot.phase,
      remainingSeconds: snapshot.remainingSeconds,
      progress: snapshot.progress,
      checksDone: snapshot.checksDone,
      checksTotal: snapshot.checksTotal,
      showedUpToday: snapshot.showedUpToday,
      completions: snapshot.completions,
      event: snapshot.event,
      clearEvent: engine.clearEvent,
      start: () => void engine.start(),
      stop: () => void engine.stop(),
    }),
    [engine, snapshot],
  )

  return <ShowupSessionContext.Provider value={value}>{children}</ShowupSessionContext.Provider>
}
