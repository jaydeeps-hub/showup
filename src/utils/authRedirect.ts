/**
 * Decides where Supabase should send the user back to after Google sign-in, and turns the
 * error details Supabase puts in the returned URL into messages a person can act on.
 *
 * Kept free of React and of the Supabase library so it can be tested on its own.
 */

/** Hosts that mean "this developer's own computer". */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase())
}

/**
 * Turns a configured address into a clean origin (for example `https://showup.vercel.app`),
 * or returns null if it is empty or not a usable web address. Only `https:` is accepted for
 * non-local addresses, because OAuth must never hand a login back over plain http on the internet.
 */
export function normalizeSiteUrl(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  const isHttps = url.protocol === 'https:'
  const isLocalHttp = url.protocol === 'http:' && isLocalHostname(url.hostname)
  if (!isHttps && !isLocalHttp) return null
  return url.origin
}

export interface RedirectContext {
  /** `window.location.origin` of the page the user is on. */
  currentOrigin: string
  /** Value of `VITE_SITE_URL`, if the project sets one. */
  configuredSiteUrl?: string
}

/**
 * The address to pass to Supabase as `redirectTo`.
 *
 * 1. Running on localhost: always the local address, so a production `VITE_SITE_URL` can never
 *    send a developer's sign-in to the live site (or the live site's to localhost).
 * 2. Otherwise `VITE_SITE_URL` when it is set and valid. This is an optional override for
 *    custom setups; nothing is hardcoded.
 * 3. Otherwise the address the app is running on. This is the right answer for the main
 *    Vercel domain and for each preview deployment, with no configuration at all.
 *
 * Returns null if no safe address can be worked out (for example when opened from a file),
 * so the caller can show a message rather than sending the user somewhere invalid.
 */
export function chooseRedirectUrl({ currentOrigin, configuredSiteUrl }: RedirectContext): string | null {
  const current = normalizeSiteUrl(currentOrigin)
  if (current === null) return null
  if (isLocalHostname(new URL(current).hostname)) return current
  return normalizeSiteUrl(configuredSiteUrl) ?? current
}

export type RedirectProblem = 'redirect-not-allowed' | 'access-denied' | 'unknown'

export interface RedirectErrorDetails {
  problem: RedirectProblem
  /** Safe to show to the user. */
  message: string
  /** The raw text from the URL, for the console only. */
  raw: string
}

const REDIRECT_PARAMS = ['error', 'error_code', 'error_description'] as const

/** Reads `error`, `error_code` and `error_description` from the query string or the hash. */
export function readRedirectErrorParams(search: string, hash: string): Record<(typeof REDIRECT_PARAMS)[number], string | null> {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const read = (name: string) => query.get(name) ?? fragment.get(name)
  return { error: read('error'), error_code: read('error_code'), error_description: read('error_description') }
}

/**
 * Describes an error that Supabase or Google added to the address the user was sent back to.
 * Returns null when the URL carries no error.
 */
export function describeRedirectError(search: string, hash: string): RedirectErrorDetails | null {
  const { error, error_code, error_description } = readRedirectErrorParams(search, hash)
  if (!error && !error_code && !error_description) return null

  const raw = [error, error_code, error_description].filter(Boolean).join(' | ')
  const text = raw.toLowerCase()

  if (error === 'access_denied' || text.includes('access_denied') || text.includes('user denied')) {
    return {
      problem: 'access-denied',
      raw,
      message: 'Sign-in was cancelled. Choose Continue with Google to try again.',
    }
  }
  if (
    error === 'invalid_request' ||
    text.includes('redirect') ||
    text.includes('flow state') ||
    text.includes('code verifier') ||
    text.includes('pkce')
  ) {
    return {
      problem: 'redirect-not-allowed',
      raw,
      message:
        'Sign-in could not be completed. Please try again. If it keeps failing, the site administrator needs to check the Supabase redirect settings (see docs/SETUP_SUPABASE.md).',
    }
  }
  return {
    problem: 'unknown',
    raw,
    message: 'Sign-in did not complete. Please try again.',
  }
}
