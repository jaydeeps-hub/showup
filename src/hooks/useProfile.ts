import { useCallback, useEffect, useState } from 'react'
import { fetchProfile, updateProfile } from '../services/profileService'
import type { Profile, ProfileEdits, SaveResult } from '../types'

export type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile }
  /** Signed in, but there is no profile row (the provisioning trigger has not run for this user). */
  | { status: 'missing' }
  | { status: 'error'; message: string }

/**
 * Loads the profile for the signed-in user. It is independent of useAuth: authentication
 * answers "who are you?", this answers "what do we know about you?".
 */
export function useProfile(userId: string): ProfileState & { reload: () => void; save: (edits: ProfileEdits) => Promise<SaveResult> } {
  const [state, setState] = useState<ProfileState>({ status: 'loading' })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let cancelled = false // ignore a slow response if the user changed or the component went away

    fetchProfile(userId)
      .then((result) => {
        if (cancelled) return
        if (result.status === 'found') setState({ status: 'ready', profile: result.profile })
        else if (result.status === 'not-found') setState({ status: 'missing' })
        else setState({ status: 'error', message: result.message })
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the profile', error)
        if (!cancelled) setState({ status: 'error', message: 'Something went wrong while loading your profile.' })
      })

    return () => {
      cancelled = true
    }
  }, [userId, reloadCount])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setReloadCount((count) => count + 1)
  }, [])

  /**
   * Saves name and birthday. On success the local profile is replaced with the row the database
   * returned, so screens update at once. On failure the profile state is left alone (and is NOT
   * switched to "loading"), so the form that is showing keeps everything the user typed.
   */
  const save = useCallback(
    async (edits: ProfileEdits): Promise<SaveResult> => {
      const result = await updateProfile(userId, edits)
      if (result.status === 'saved') {
        setState({ status: 'ready', profile: result.profile })
        return { ok: true }
      }
      return { ok: false, message: result.message }
    },
    [userId],
  )

  return { ...state, reload, save }
}
