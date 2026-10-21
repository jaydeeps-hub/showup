import { useCallback, useEffect, useState } from 'react'
import { fetchCmsValue, type CmsEntry, type CmsResult } from '../services/cmsService'

export type CmsState = { status: 'loading' } | CmsResult

/**
 * Loads one CMS entry. With `enabled: false` nothing is fetched until it turns true, which is how
 * the Terms are loaded only when someone opens them. A result that has loaded successfully is kept,
 * so closing and reopening the popup does not fetch again.
 */
export function useCmsValue(entry: CmsEntry, enabled = true): CmsState & { retry: () => void } {
  const [state, setState] = useState<CmsState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false // ignore a slow answer if the component went away

    fetchCmsValue(entry)
      .then((result) => {
        if (!cancelled) setState(result)
      })
      .catch((error: unknown) => {
        console.error('Unexpected error loading CMS content', error)
        if (!cancelled) setState({ status: 'error', message: 'Something went wrong while loading this content.' })
      })

    return () => {
      cancelled = true
    }
    // `entry` is a constant object from CMS_ENTRIES, so its id and type are the real dependencies.
  }, [entry.id, entry.contentType, enabled, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  return { ...state, retry }
}
