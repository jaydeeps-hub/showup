import { useCallback, useEffect, useState } from 'react'
import { searchPeople } from '../services/squadService'
import type { SearchResult } from '../types'

/** How long typing must pause before the database is asked, as the prototype's Squad search waits. */
export const PEOPLE_SEARCH_DEBOUNCE_MS = 450

/** The fewest characters worth asking about. `search_people` returns nothing for fewer, so they are never sent. */
export const PEOPLE_SEARCH_MIN_CHARACTERS = 2

/**
 * - `idle`: nothing to look for (empty, or fewer than 2 characters);
 * - `searching`: waiting for the pause, or for the database's answer ("Finding people…");
 * - `results`: the answer for this query (the list can be empty: nobody was found);
 * - `error`: the search failed.
 */
export type PeopleSearchStatus = 'idle' | 'searching' | 'results' | 'error'

export type PeopleSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; results: SearchResult[] }
  | { status: 'error'; message: string }

/** The search state, and `retry` to ask again for the same query (after a failed search). */
export type PeopleSearch = PeopleSearchState & {
  /** The cleaned query being searched for (empty while idle). */
  query: string
  retry: () => void
}

interface Answer {
  /** The query this answer is for. An answer for any other query is ignored, so a late reply can never win. */
  query: string
  state: { status: 'results'; results: SearchResult[] } | { status: 'error'; message: string }
}

/** What the database actually receives: trimmed, a leading "@" dropped, as `search_people` cleans it too. */
export function searchQueryOf(value: string): string {
  return value.trim().replace(/^@+/, '').trim()
}

/**
 * The people search under the Squad header, following the `useUsernameCheck` pattern: no request for fewer than 2
 * characters, a 450 ms pause after the last keystroke, then `search_people`. An answer that arrives after the box has
 * moved on is dropped, and an answer is only ever shown for the query it was asked for.
 */
export function usePeopleSearch(value: string): PeopleSearch {
  const query = searchQueryOf(value)
  const active = query.length >= PEOPLE_SEARCH_MIN_CHARACTERS
  const [answer, setAnswer] = useState<Answer | null>(null)
  // Bumped by retry() to ask again for the same query.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await searchPeople(query)
      // A new query (or the box going away) replaces this effect and its clean-up sets `cancelled`, so an answer for
      // an older query is dropped here. A stored answer is also only shown for its own query (below).
      if (cancelled) return
      setAnswer(
        result.status === 'ok'
          ? { query, state: { status: 'results', results: result.results } }
          : { query, state: { status: 'error', message: result.message } },
      )
    }, PEOPLE_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, active, attempt])

  const retry = useCallback(() => {
    setAnswer(null) // forget the failure, so it shows "searching" while it asks again
    setAttempt((count) => count + 1)
  }, [])

  if (!active) return { status: 'idle', query: '', retry }
  if (answer && answer.query === query) return { ...answer.state, query, retry }
  return { status: 'searching', query, retry }
}
