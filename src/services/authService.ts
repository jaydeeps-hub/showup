import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

/** Thrown when sign-in is attempted but the Supabase settings are missing from `.env.local`. */
export class AuthNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured.')
    this.name = 'AuthNotConfiguredError'
  }
}

/**
 * Where Google should send the user after signing in: the address the app is running on
 * (http://localhost:5173 locally, your Vercel address in production). This exact address
 * must be listed under Redirect URLs in the Supabase dashboard (see README).
 */
function getRedirectUrl(): string {
  return window.location.origin
}

/** Sends the browser to Google. The page leaves the app, so this does not "return" a user. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new AuthNotConfiguredError()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: getRedirectUrl() },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  // "local" always clears this browser's session, even if the network request fails.
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}

/** Reads the stored session (if any) and listens for sign-in / sign-out. Returns an unsubscribe function. */
export function watchSession(onChange: (session: Session | null) => void): () => void {
  if (!supabase) {
    onChange(null)
    return () => {}
  }
  const client = supabase
  let active = true

  client.auth
    .getSession()
    .then(({ data }) => {
      if (active) onChange(data.session)
    })
    .catch((error: unknown) => {
      console.error('Could not restore the Supabase session', error)
      if (active) onChange(null)
    })

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    if (active) onChange(session)
  })

  return () => {
    active = false
    subscription.unsubscribe()
  }
}

/** A display name and stable ID for the Showup app, taken from the signed-in Google account. */
export function getIdentity(user: User): { id: string; username: string } {
  const metadata = user.user_metadata as Record<string, unknown>
  const candidates = [metadata.full_name, metadata.name, user.email]
  const username = candidates.find((value): value is string => typeof value === 'string' && value.trim() !== '')
  return { id: user.id, username: username?.trim() ?? 'Showup member' }
}

/**
 * If Google or Supabase sent the user back with an error (for example the sign-in was
 * cancelled, or the redirect URL is not allowed), returns a readable message and removes
 * the error from the address bar. Returns null when there is nothing to report.
 */
export function consumeRedirectError(): string | null {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const description = search.get('error_description') ?? hash.get('error_description')
  const code = search.get('error') ?? hash.get('error')
  if (!description && !code) return null

  window.history.replaceState(null, '', window.location.pathname)
  return description ?? code
}
