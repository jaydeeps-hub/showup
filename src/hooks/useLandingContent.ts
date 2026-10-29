import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_LANDING_CONTENT, fetchLandingContent, type LandingContent } from '../services/landingContent'

/**
 * What the landing page shows, from the `config` table, working before sign-in.
 *   - `content` is ALWAYS usable: it starts as the built-in defaults and is replaced by the table's values
 *     when they arrive, so the page never waits and never shows a hole.
 *   - `status` says how the lookup went: `loading`, `ready`, or `failed` (the defaults are showing because
 *     the table could not be read).
 *
 * Several parts of the page use this hook (the banner, the Terms popup, the carousel heading). They share
 * one request and one result, so the page asks the database once.
 */
export type LandingContentStatus = 'loading' | 'ready' | 'failed'

export interface LandingContentState {
  content: LandingContent
  status: LandingContentStatus
  /** Look again after a failure. */
  retry: () => void
}

let shared: Promise<{ content: LandingContent; failed: boolean }> | null = null

/** One request at a time, shared by everyone asking. A failure is forgotten so a retry can ask again. */
function loadOnce(force: boolean): Promise<{ content: LandingContent; failed: boolean }> {
  if (shared && !force) return shared
  const request = fetchLandingContent().then((result) => {
    if (result.failed && shared === request) shared = null
    return result
  })
  shared = request
  return request
}

/** For tests: forget the shared result. */
export function resetLandingContentCache(): void {
  shared = null
}

export function useLandingContent(): LandingContentState {
  const [state, setState] = useState<{ content: LandingContent; status: LandingContentStatus }>({
    content: DEFAULT_LANDING_CONTENT,
    status: 'loading',
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false // ignore a slow answer if the component went away
    loadOnce(attempt > 0)
      .then(({ content, failed }) => {
        if (!cancelled) setState({ content, status: failed ? 'failed' : 'ready' })
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading the landing page content', error)
        if (!cancelled) setState({ content: DEFAULT_LANDING_CONTENT, status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState((current) => ({ ...current, status: 'loading' }))
    setAttempt((count) => count + 1)
  }, [])

  return { ...state, retry }
}
