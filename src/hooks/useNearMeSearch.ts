import { useCallback, useEffect, useRef, useState } from 'react'
import { NEAR_ME_SEARCH_DEBOUNCE_MS } from '../config/constants'
import { getCachedAppConfig, loadAppConfig } from '../services/appConfig'
import { searchNearbyGyms, type PlaceSuggestion } from '../services/mapsService'
import type { LatLng } from '../utils/distance'
import { NearMeCache, nearMeCacheKey } from '../utils/nearMeCache'

/** One shared cache for the page: the last result for each search text and rough position, kept five minutes in memory. */
const sharedCache = new NearMeCache<PlaceSuggestion[]>()

/** For tests: forget the cached results. */
export function resetNearMeCache(): void {
  sharedCache.clear()
}

export interface NearbyState {
  results: PlaceSuggestion[]
  loading: boolean
  /** True when the last nearby search failed. */
  failed: boolean
  /** Asks again after a failure. */
  retry: () => void
}

const NOTHING: Omit<NearbyState, 'retry'> = { results: [], loading: false, failed: false }

/** The cache key for the nearby list: the rough position plus the two settings, so a changed setting is not served stale. */
function nearbyKey(here: LatLng, radius: number, max: number): string {
  return `${nearMeCacheKey('', here)}|${radius}|${max}`
}

/**
 * The "Gyms near me" list for an EMPTY search box: the gyms around the device position, nearest first, within
 * `config.gym_search_radius_meters` and at most `config.gym_search_max_results` of them (5000 m and 20 until the
 * config loads). It does nothing when the toggle is off, when there is no position, or when the person has typed
 * something (then the typed search takes over; that is in GymSearch, which has the session token).
 *
 * To save requests: it waits for a short pause before asking, and reuses a result for the same position (to about
 * 100 m) for five minutes. The position is only used in the request to Google and for the cache key; it is not stored.
 */
export function useNearbyGyms(position: LatLng | null, active: boolean): NearbyState {
  // What the last request produced, and for which position. Anything for another position (or while off) is ignored
  // when reading, so no reset is needed when the toggle goes off.
  const [answer, setAnswer] = useState<{ key: string; state: Omit<NearbyState, 'retry'> } | null>(null)
  // Bumped by Retry so the same search runs again.
  const [attempt, setAttempt] = useState(0)
  const configRequested = useRef(false)
  useEffect(() => {
    if (configRequested.current) return
    configRequested.current = true
    void loadAppConfig()
  }, [])

  const lat = position?.lat
  const lng = position?.lng
  const running = active && lat !== undefined && lng !== undefined
  const config = getCachedAppConfig()
  const key = running ? nearbyKey({ lat, lng }, config.gymSearchRadiusMeters, config.gymSearchMaxResults) : null

  const retry = useCallback(() => {
    setAnswer(null) // forget the failure, so the list shows "Finding gyms…" while it asks again
    setAttempt((count) => count + 1)
  }, [])

  useEffect(() => {
    if (!running || key === null || sharedCache.get(key)) return // nothing to ask: off, or already answered
    const here = { lat, lng }
    const { gymSearchRadiusMeters, gymSearchMaxResults } = getCachedAppConfig()

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const results = await searchNearbyGyms(here, gymSearchRadiusMeters, gymSearchMaxResults)
        if (cancelled) return
        sharedCache.set(key, results)
        setAnswer({ key, state: { results, loading: false, failed: false } })
      } catch (error) {
        console.error('Google Maps nearby search failed', error)
        if (!cancelled) setAnswer({ key, state: { results: [], loading: false, failed: true } })
      }
    }, NEAR_ME_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [running, key, lat, lng, attempt])

  if (!running || key === null) return { ...NOTHING, retry }
  const cached = sharedCache.get(key)
  if (cached) return { results: cached, loading: false, failed: false, retry }
  // An answer for this very search (a failure is not cached, so it is read from here); otherwise still waiting.
  if (answer && answer.key === key) return { ...answer.state, retry }
  return { results: [], loading: true, failed: false, retry }
}

/** Used by the typed search to share the same cache: get a stored result, or store one. */
export const typedSearchCache = {
  get: (text: string, position: LatLng) => sharedCache.get(nearMeCacheKey(text, position)),
  set: (text: string, position: LatLng, value: PlaceSuggestion[]) => sharedCache.set(nearMeCacheKey(text, position), value),
  /**
   * Forgets every stored result. Each stored suggestion belongs to the Google billing session it was fetched in, and a
   * session ends when a place is picked; so after a pick the old suggestions must not be offered again (choosing one
   * would run a details request outside any session).
   */
  clear: () => sharedCache.clear(),
}
