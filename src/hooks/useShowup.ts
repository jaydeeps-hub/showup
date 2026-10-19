import { useCallback, useEffect, useRef, useState } from 'react'
import { checkLocation } from '../services/attendanceService'
import { getCurrentPosition } from '../services/geolocationService'
import { fetchActiveGym, saveActiveGym } from '../services/gymService'
import { fetchShowupCount, recordShowup } from '../services/showupService'
import type { Gym, SaveResult, SelectedPlace, ShowupOutcome } from '../types'

/** Who is using the app: the signed-in account (from Supabase / Google). */
export interface SignedInUser {
  id: string
  username: string
}

/** What a SHOW UP press produced, including the one case the screen must explain separately. */
export type ShowUpResult = ShowupOutcome | { type: 'save-failed'; message: string }

/**
 * - 'loading': fetching the gym and Showup count from Supabase.
 * - 'ready': loaded.
 * - 'error': they could not be loaded (network, or the database migrations are missing).
 */
export type DataStatus = 'loading' | 'ready' | 'error'

/**
 * The single source of truth for the gym and the Showup count. Both live in Supabase; this hook
 * loads them for the signed-in user and is the only thing that changes them.
 *
 * What the screen shows always follows what the database confirmed: a gym or Showup is only added
 * to the screen after it was saved, so the two cannot disagree.
 */
export function useShowup(user: SignedInUser) {
  const userId = user.id
  const [dataStatus, setDataStatus] = useState<DataStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gym, setGym] = useState<Gym | null>(null)
  const [showupCount, setShowupCount] = useState(0)
  const [isVerifying, setIsVerifying] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)

  // State updates are not instant, so a ref guards against a second tap
  // starting another check before React has disabled the button.
  const verificationInProgress = useRef(false)
  // The latest gym, for the Show Up handler (which must not be recreated on every change).
  const gymRef = useRef<Gym | null>(null)
  useEffect(() => {
    gymRef.current = gym
  }, [gym])

  useEffect(() => {
    let cancelled = false // ignore a slow response if the user changed or the component went away

    Promise.all([fetchActiveGym(), fetchShowupCount()])
      .then(([gymResult, countResult]) => {
        if (cancelled) return
        if (gymResult.status === 'error' || countResult.status === 'error') {
          setLoadError(gymResult.status === 'error' ? gymResult.message : (countResult as { message: string }).message)
          setDataStatus('error')
          return
        }
        setGym(gymResult.gym)
        setShowupCount(countResult.count)
        setLoadError(null)
        setDataStatus('ready')
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the gym and Showups', error)
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

  /** Runs one location check. Resolves to null if a check is already running. */
  const showUp = useCallback(async (): Promise<ShowUpResult | null> => {
    const currentGym = gymRef.current
    if (verificationInProgress.current || !currentGym) return null

    verificationInProgress.current = true
    setIsVerifying(true)
    try {
      const { outcome, accuracyMetres } = await checkLocation({ gym: currentGym, getPosition: getCurrentPosition })
      if (outcome.type !== 'success') return outcome

      // Save first. Only a saved Showup increases the counter.
      const saved = await recordShowup({
        gymId: currentGym.id,
        distanceMetres: outcome.distanceMetres,
        accuracyMetres: accuracyMetres ?? 0,
      })
      if (saved.status === 'error') return { type: 'save-failed', message: saved.message }

      setShowupCount((count) => count + 1)
      return outcome
    } finally {
      verificationInProgress.current = false
      setIsVerifying(false)
    }
  }, [])

  return {
    dataStatus,
    loadError,
    reload,
    gym,
    showupCount,
    isVerifying,
    saveGym,
    showUp,
  }
}
