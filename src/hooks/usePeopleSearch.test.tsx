// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchPeopleResult } from '../services/squadService'

/** The people search: no request under 2 characters, the 450 ms pause, and answers for an older query ignored. */

const service = vi.hoisted(() => ({ searchPeople: vi.fn() }))
vi.mock('../services/squadService', () => ({ searchPeople: service.searchPeople }))

const { usePeopleSearch, PEOPLE_SEARCH_DEBOUNCE_MS, PEOPLE_SEARCH_MIN_CHARACTERS, searchQueryOf } = await import('./usePeopleSearch')

const found = (query: string, username = `${query}_1`): SearchPeopleResult => ({
  status: 'ok',
  query,
  results: [{ username, firstName: null, lastName: null, relation: 'none' }],
})
function deferred() {
  let resolve!: (value: SearchPeopleResult) => void
  const promise = new Promise<SearchPeopleResult>((r) => (resolve = r))
  return { promise, resolve }
}
/** The search state alone, without the query and retry the hook also returns, so a comparison stays exact. */
function stateOf(search: { query: string; retry: () => void } & Record<string, unknown>) {
  const { query: _query, retry: _retry, ...state } = search
  return state
}
const render = (value: string) => renderHook(({ value }) => usePeopleSearch(value), { initialProps: { value } })
async function waitOut(ms = PEOPLE_SEARCH_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  service.searchPeople.mockReset()
  service.searchPeople.mockImplementation(async (query: string) => found(query))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('nothing to look for', () => {
  it('waits 450 ms and needs 2 characters, as the design and the database do', () => {
    expect(PEOPLE_SEARCH_DEBOUNCE_MS).toBe(450)
    expect(PEOPLE_SEARCH_MIN_CHARACTERS).toBe(2)
  })

  it.each([[''], ['a'], [' '], ['@'], ['@a'], ['  a  ']])('%j is idle and asks nothing', async (value) => {
    const { result } = render(value)
    expect(stateOf(result.current)).toEqual({ status: 'idle' })
    await waitOut(2000)
    expect(service.searchPeople).not.toHaveBeenCalled()
  })

  it('cleans the query the way the database does: trimmed, a leading @ dropped', () => {
    expect(searchQueryOf('  @rahul ')).toBe('rahul')
    expect(searchQueryOf('@@rahul')).toBe('rahul')
    expect(searchQueryOf('ra')).toBe('ra')
  })
})

describe('the pause', () => {
  it('is "searching" at once, but asks only after 450 ms, with the cleaned query', async () => {
    const { result } = render('@ra')
    expect(stateOf(result.current)).toEqual({ status: 'searching' })
    await waitOut(PEOPLE_SEARCH_DEBOUNCE_MS - 1)
    expect(service.searchPeople).not.toHaveBeenCalled()
    await waitOut(1)
    expect(service.searchPeople).toHaveBeenCalledTimes(1)
    expect(service.searchPeople).toHaveBeenCalledWith('ra')
  })

  it('typing quickly asks only once, for the last query', async () => {
    const { rerender } = render('ra')
    for (const value of ['rah', 'rahu', 'rahul']) {
      await waitOut(200)
      rerender({ value })
    }
    await waitOut()
    expect(service.searchPeople).toHaveBeenCalledTimes(1)
    expect(service.searchPeople).toHaveBeenCalledWith('rahul')
  })

  it('going below 2 characters cancels the pending request and is idle', async () => {
    const { result, rerender } = render('ra')
    await waitOut(200)
    rerender({ value: 'r' })
    expect(stateOf(result.current)).toEqual({ status: 'idle' })
    await waitOut(2000)
    expect(service.searchPeople).not.toHaveBeenCalled()
  })

  it('a change that cleans to the same query (a space, an @) does not search again', async () => {
    const { rerender } = render('ra')
    await waitOut()
    expect(service.searchPeople).toHaveBeenCalledTimes(1)
    rerender({ value: ' @ra ' })
    await waitOut(2000)
    expect(service.searchPeople).toHaveBeenCalledTimes(1)
  })
})

describe('the answer', () => {
  it('shows the results', async () => {
    const { result } = render('ra')
    await waitOut()
    expect(stateOf(result.current)).toEqual({ status: 'results', results: [{ username: 'ra_1', firstName: null, lastName: null, relation: 'none' }] })
  })

  it('an empty list is "results", not an error (nobody was found)', async () => {
    service.searchPeople.mockResolvedValue({ status: 'ok', query: 'zz', results: [] })
    const { result } = render('zz')
    await waitOut()
    expect(stateOf(result.current)).toEqual({ status: 'results', results: [] })
  })

  it('a failure is "error" with the message', async () => {
    service.searchPeople.mockResolvedValue({ status: 'error', message: 'Something went wrong. Try again.', code: null })
    const { result } = render('ra')
    await waitOut()
    expect(stateOf(result.current)).toEqual({ status: 'error', message: 'Something went wrong. Try again.' })
  })
})

describe('the query and retry', () => {
  it('gives the cleaned query it is searching for, and an empty one while idle', async () => {
    const { result, rerender } = render(' @ra ')
    expect(result.current.query).toBe('ra')
    rerender({ value: 'r' })
    expect(result.current.query).toBe('')
  })

  it('retry asks again for the same query after a failure, showing "searching" meanwhile', async () => {
    service.searchPeople.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong. Try again.', code: null })
    const { result } = render('ra')
    await waitOut()
    expect(result.current.status).toBe('error')
    act(() => result.current.retry())
    expect(result.current.status).toBe('searching')
    await waitOut()
    expect(result.current.status).toBe('results')
    expect(service.searchPeople).toHaveBeenCalledTimes(2)
    expect(service.searchPeople).toHaveBeenLastCalledWith('ra')
  })
})

describe('stale answers are ignored', () => {
  it('an answer for an older query is dropped when the box has moved on', async () => {
    const slow = deferred()
    service.searchPeople.mockImplementationOnce(() => slow.promise)
    const { result, rerender } = render('ra')
    await waitOut() // asks for "ra"; the reply is held back
    rerender({ value: 'rah' })
    expect(stateOf(result.current)).toEqual({ status: 'searching' })
    await act(async () => slow.resolve(found('ra', 'old_answer')))
    expect(stateOf(result.current)).toEqual({ status: 'searching' }) // not the "ra" results
    await waitOut()
    expect(result.current).toMatchObject({ status: 'results', results: [{ username: 'rah_1' }] })
  })

  it('a slow answer for an old query cannot overwrite a newer one that came back first', async () => {
    const slow = deferred()
    service.searchPeople.mockImplementationOnce(() => slow.promise)
    const { result, rerender } = render('ra')
    await waitOut()
    rerender({ value: 'rah' })
    await waitOut()
    expect(result.current).toMatchObject({ results: [{ username: 'rah_1' }] })
    await act(async () => slow.resolve(found('ra', 'old_answer')))
    expect(result.current).toMatchObject({ results: [{ username: 'rah_1' }] })
  })

  it('going back to an earlier query searches again instead of showing its old answer', async () => {
    const { result, rerender } = render('ra')
    await waitOut()
    rerender({ value: 'rah' })
    await waitOut()
    rerender({ value: 'ra' })
    expect(stateOf(result.current)).toEqual({ status: 'searching' })
    await waitOut()
    expect(service.searchPeople).toHaveBeenCalledTimes(3)
  })

  it('an answer that arrives after the search is gone does nothing', async () => {
    const late = deferred()
    service.searchPeople.mockImplementationOnce(() => late.promise)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render('ra')
    await waitOut()
    unmount()
    await act(async () => late.resolve(found('ra')))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
