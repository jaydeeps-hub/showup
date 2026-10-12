import { useCallback, useRef, useState } from 'react'
import { PRIMARY_GYM_LABEL } from '../config/constants'
import { attemptShowup, countShowups } from '../services/attendanceService'
import { getCurrentPosition } from '../services/geolocationService'
import { clearData, createEmptyData, loadData, saveData } from '../services/storageService'
import type { Gym, SelectedPlace, ShowupData, ShowupOutcome, TemporaryUser } from '../types'
import { createId } from '../utils/id'

/**
 * - 'ok': data loads and saves normally.
 * - 'unavailable': localStorage is blocked; waiting for the user to decide.
 * - 'corrupted': saved data is unreadable; waiting for the user to reset.
 * - 'memory-only': user chose to continue without saving.
 */
export type StorageStatus = 'ok' | 'unavailable' | 'corrupted' | 'memory-only'

/**
 * The single source of truth for app state. Screens receive values and
 * callbacks from here; only this hook changes the saved data.
 */
export function useShowup() {
  const [initial] = useState(loadData)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(initial.status)
  const [data, setData] = useState<ShowupData>(initial.status === 'ok' ? initial.data : createEmptyData())
  const [saveFailed, setSaveFailed] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)

  // State updates are not instant, so a ref guards against a second tap
  // starting another check before React has disabled the button.
  const verificationInProgress = useRef(false)
  const latestData = useRef(data)

  const commit = useCallback(
    (next: ShowupData) => {
      latestData.current = next
      setData(next)
      if (storageStatus === 'ok') {
        setSaveFailed(!saveData(next))
      }
    },
    [storageStatus],
  )

  const user: TemporaryUser | null = data.user
  const gym: Gym | null = (user && data.gyms.find((candidate) => candidate.userId === user.id)) ?? null
  const showupCount = user ? countShowups(data, user.id) : 0

  /** The password is intentionally not a parameter: it is never stored. */
  const createUser = useCallback(
    (username: string) => {
      const newUser: TemporaryUser = { id: createId(), username: username.trim(), createdAt: new Date().toISOString() }
      commit({ ...latestData.current, user: newUser })
    },
    [commit],
  )

  /** Saves the place as the user's one and only gym ("Gym 1"), replacing any previous one. */
  const saveGym = useCallback(
    (place: SelectedPlace) => {
      const current = latestData.current
      if (!current.user) return
      const newGym: Gym = {
        id: createId(),
        userId: current.user.id,
        label: PRIMARY_GYM_LABEL,
        ...place,
        createdAt: new Date().toISOString(),
      }
      const otherUsersGyms = current.gyms.filter((existing) => existing.userId !== newGym.userId)
      commit({ ...current, gyms: [...otherUsersGyms, newGym] })
    },
    [commit],
  )

  /** Runs one location check. Resolves to null if a check is already running. */
  const showUp = useCallback(async (): Promise<ShowupOutcome | null> => {
    const current = latestData.current
    if (verificationInProgress.current || !current.user) return null
    const currentGym = current.gyms.find((candidate) => candidate.userId === current.user?.id)
    if (!currentGym) return null

    verificationInProgress.current = true
    setIsVerifying(true)
    try {
      const result = await attemptShowup({
        data: current,
        userId: current.user.id,
        gym: currentGym,
        getPosition: getCurrentPosition,
      })
      if (result.outcome.type === 'success') commit(result.data)
      return result.outcome
    } finally {
      verificationInProgress.current = false
      setIsVerifying(false)
    }
  }, [commit])

  /** Logs out by deleting all demo data (user, gym and history). */
  const resetDemoData = useCallback(() => {
    clearData()
    const empty = createEmptyData()
    latestData.current = empty
    setData(empty)
    setSaveFailed(false)
    if (storageStatus === 'corrupted') setStorageStatus('ok')
  }, [storageStatus])

  const continueWithoutSaving = useCallback(() => setStorageStatus('memory-only'), [])

  return {
    storageStatus,
    /** True when data will not survive a reload. */
    isNotPersisting: storageStatus === 'memory-only' || saveFailed,
    user,
    gym,
    showupCount,
    isVerifying,
    createUser,
    saveGym,
    showUp,
    resetDemoData,
    continueWithoutSaving,
  }
}
