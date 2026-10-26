import { useCallback, useEffect, useState } from 'react'
import { loadAppConfig } from '../services/appConfig'
import { fetchActiveGym, saveActiveGym } from '../services/gymService'
import type { Gym, SaveResult, SelectedPlace } from '../types'

/** Who is using the app: the signed-in account (from Supabase / Google). */
export interface SignedInUser {
  id: string
  username: string
}

/**
 * - 'loading': fetching the user's gym from Supabase.
 * - 'ready': loaded.
 * - 'error': it could not be loaded (network, or the database migrations are missing).
 */
export type DataStatus = 'loading' | 'ready' | 'error'

/**
 * The single source of truth for the user's gym. It lives in Supabase; this hook loads it for the
 * signed-in user and is the only thing that changes it. (Showing up is the timed Show Up engine, in
 * useShowupSession.tsx.)
 *
 * What the screen shows always follows what the database confirmed: a gym is only switched on the
 * screen after it was saved, so the two cannot disagree.
 */
export function useShowup(user: SignedInUser) {
  const userId = user.id
  const [dataStatus, setDataStatus] = useState<DataStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gym, setGym] = useState<Gym | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let cancelled = false // ignore a slow response if the user changed or the component went away

    // The config is loaded alongside the gym (and cached for an hour). It never fails: it falls back to defaults.
    Promise.all([fetchActiveGym(), loadAppConfig()])
      .then(([gymResult]) => {
        if (cancelled) return
        if (gymResult.status === 'error') {
          setLoadError(gymResult.message)
          setDataStatus('error')
          return
        }
        setGym(gymResult.gym)
        setLoadError(null)
        setDataStatus('ready')
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the gym', error)
        if (cancelled) return
        setLoadError('Something went wrong while loading your gym.')
        setDataStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [userId, reloadCount])

  const reload = useCallback(() => {
    setDataStatus('loading')
    setReloadCount((count) => count + 1)
  }, [])

  /**
   * Saves the place as the user's one and only active gym ("Gym 1"). The screen switches to the new
   * gym only once the database has it; on failure the old gym is kept and the error is returned.
   */
  const saveGym = useCallback(async (place: SelectedPlace): Promise<SaveResult> => {
    const result = await saveActiveGym(place)
    if (result.status === 'error') return { ok: false, message: result.message }
    setGym(result.gym)
    return { ok: true }
  }, [])

  return {
    dataStatus,
    loadError,
    reload,
    gym,
    saveGym,
  }
}
