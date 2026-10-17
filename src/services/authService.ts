import type { Session, User } from '@supabase/supabase-js'
import { SITE_URL } from '../config/constants'
import { chooseRedirectUrl, describeRedirectError } from '../utils/authRedirect'
import { supabase } from './supabaseClient'

/** Thrown when sign-in is attempted but the Supabase settings are missing from `.env.local`. */
export class AuthNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured.')
    this.name = 'AuthNotConfiguredError'
  }
}

/** Thrown when no safe address to return to after sign-in can be worked out. */
export class AuthRedirectUnavailableError extends Error {
  constructor() {
    super('No valid return address for sign-in.')
    this.name = 'AuthRedirectUnavailableError'
  }
}

/**
 * Where Supabase should send the user after signing in: the address the app is running on, so
 * it is correct on localhost, on the main Vercel domain and on preview deployments alike. See
 * utils/authRedirect.ts for the rules.
 *
 * IMPORTANT: Supabase only honours this if the exact address is listed under Authentication ->
 * URL Configuration -> Redirect URLs. If it is not, Supabase silently ignores it and sends the
 * user to its configured Site URL instead (which is how a live site can end up on localhost).
 */
function getRedirectUrl(): string {
  const url = chooseRedirectUrl({ currentOrigin: window.location.origin, configuredSiteUrl: SITE_URL })
  if (url === null) throw new AuthRedirectUnavailableError()
  return url
}

/** Sends the browser to Google. The page leaves the app, so this does not "return" a user. */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new AuthNotConfiguredError()
  const redirectTo = getRedirectUrl()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
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
  const details = describeRedirectError(window.location.search, window.location.hash)
  if (!details) return null

  // Keep the technical detail for whoever debugs it; show the user a plain message.
  console.error('Sign-in returned an error:', details.raw)
  // Remove the error (and any leftover tokens) from the address bar.
  window.history.replaceState(null, '', window.location.pathname)
  return details.message
}
