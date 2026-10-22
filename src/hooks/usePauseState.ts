import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPauseDetails } from '../services/pauseService'
import type { PauseDetails } from '../types'

export type PauseLoad =
  | { status: 'loading' }
  | { status: 'ready'; pause: PauseDetails }
  | { status: 'error'; message: string }

/**
 * Loads the pause state (`get_pause_state`) for the Pause screen.
 *
 * - `retry` shows the loading state again (used by the error state's Retry button).
 * - `reload` fetches fresh data but keeps the current screen on show until it arrives (used after
 *   using or ending a pause, so the screen does not flash).
 * Only the newest request is used; an older, slower answer is ignored.
 */
export function usePauseState(): PauseLoad & { retry: () => void; reload: () => Promise<void> } {
  const [state, setState] = useState<PauseLoad>({ status: 'loading' })
  const latestRequest = useRef(0)
  const isMounted = useRef(false)

  const reload = useCallback(async () => {
    const request = ++latestRequest.current
    const result = await fetchPauseDetails()
    // Ignore an older, slower answer, and any answer that arrives after the screen has gone.
    if (request !== latestRequest.current || !isMounted.current) return
    setState(result.status === 'ok' ? { status: 'ready', pause: result.pause } : { status: 'error', message: result.message })
  }, [])

  useEffect(() => {
    isMounted.current = true
    void reload()
    return () => {
      isMounted.current = false
    }
  }, [reload])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    void reload()
  }, [reload])

  return { ...state, retry, reload }
}
