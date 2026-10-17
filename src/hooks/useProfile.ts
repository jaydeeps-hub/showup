import { useCallback, useEffect, useState } from 'react'
import { fetchProfile } from '../services/profileService'
import type { Profile } from '../types'

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
export function useProfile(userId: string): ProfileState & { reload: () => void } {
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

  return { ...state, reload }
}
