import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { watchSession } from '../services/authService'

export type AuthState =
  | { status: 'loading' } // still checking for a saved session
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session }

/** Tells the app whether someone is signed in, and updates when they sign in or out. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    // watchSession returns its own cleanup, which React runs when the component unmounts.
    return watchSession((session) => setState(session ? { status: 'signed-in', session } : { status: 'signed-out' }))
  }, [])

  return state
}
