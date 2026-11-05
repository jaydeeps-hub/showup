// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GetSquadResult } from '../services/squadService'
import type { SquadState } from '../types'

/** The Squad page's data: loading, refresh, errors, and reloading when the page becomes visible again. */

const service = vi.hoisted(() => ({ getSquad: vi.fn() }))
vi.mock('../services/squadService', () => ({ getSquad: service.getSquad }))

const { useSquad } = await import('./useSquad')

function squad(overrides: Partial<SquadState> = {}): SquadState {
  return { squadCount: 0, maxSize: 50, incomingCount: 0, squad: [], incoming: [], outgoing: [], ...overrides }
}
const ok = (s: SquadState = squad()): GetSquadResult => ({ status: 'ok', squad: s })
const fail = (message = 'Something went wrong. Try again.'): GetSquadResult => ({ status: 'error', message, code: null })
function deferred() {
  let resolve!: (value: GetSquadResult) => void
  const promise = new Promise<GetSquadResult>((r) => (resolve = r))
  return { promise, resolve }
}
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  service.getSquad.mockReset()
  service.getSquad.mockResolvedValue(ok())
})
afterEach(() => {
  cleanup()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})

describe('loading', () => {
  it('loads get_squad once when it first runs (the Squad tab opens)', async () => {
    const { result } = renderHook(() => useSquad())
    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(service.getSquad).toHaveBeenCalledTimes(1)
  })

  it('shows the squad it loaded', async () => {
    const loaded = squad({ squadCount: 2, incomingCount: 1 })
    service.getSquad.mockResolvedValue(ok(loaded))
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', squad: loaded }))
  })

  it('a first load that fails is the error state, with the message', async () => {
    service.getSquad.mockResolvedValue(fail('Something went wrong. Try again.'))
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', message: 'Something went wrong. Try again.' }))
  })

  it('a load that throws is the error state too', async () => {
    service.getSquad.mockRejectedValue(new Error('boom'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    errors.mockRestore()
  })
})

describe('incomingCount (the tab badge)', () => {
  it('is 0 before the squad has loaded, and after a failed first load', async () => {
    service.getSquad.mockResolvedValue(fail())
    const { result } = renderHook(() => useSquad())
    expect(result.current.incomingCount).toBe(0)
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.incomingCount).toBe(0)
  })

  it('is the number of requests waiting, from the loaded squad', async () => {
    service.getSquad.mockResolvedValue(ok(squad({ incomingCount: 3 })))
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.incomingCount).toBe(3))
  })
})

describe('refresh', () => {
  it('loads again', async () => {
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    service.getSquad.mockResolvedValue(ok(squad({ squadCount: 5 })))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.state).toMatchObject({ squad: { squadCount: 5 } }))
    expect(service.getSquad).toHaveBeenCalledTimes(2)
  })

  it('keeps showing the current squad while it reloads (no flash to "loading")', async () => {
    service.getSquad.mockResolvedValueOnce(ok(squad({ squadCount: 1 })))
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    const pending = deferred()
    service.getSquad.mockImplementationOnce(() => pending.promise)
    act(() => result.current.refresh())
    expect(result.current.state).toMatchObject({ status: 'ready', squad: { squadCount: 1 } })
    await act(async () => pending.resolve(ok(squad({ squadCount: 2 }))))
    expect(result.current.state).toMatchObject({ squad: { squadCount: 2 } })
  })

  it('a refresh that fails keeps the squad on screen and reports refreshError', async () => {
    service.getSquad.mockResolvedValueOnce(ok(squad({ squadCount: 1 })))
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    service.getSquad.mockResolvedValueOnce(fail('Something went wrong. Try again.'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshError).toBe('Something went wrong. Try again.'))
    expect(result.current.state).toMatchObject({ status: 'ready', squad: { squadCount: 1 } })
  })

  it('clears refreshError once a later load succeeds', async () => {
    service.getSquad.mockResolvedValueOnce(ok()).mockResolvedValueOnce(fail()).mockResolvedValueOnce(ok())
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshError).not.toBeNull())
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.refreshError).toBeNull())
  })

  it('after a failed first load, a refresh says "loading" and then shows the squad', async () => {
    service.getSquad.mockResolvedValueOnce(fail())
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    const pending = deferred()
    service.getSquad.mockImplementationOnce(() => pending.promise)
    act(() => result.current.refresh())
    expect(result.current.state).toEqual({ status: 'loading' })
    await act(async () => pending.resolve(ok()))
    expect(result.current.state.status).toBe('ready')
  })

  it('a slow older answer cannot overwrite a newer one', async () => {
    const slow = deferred()
    service.getSquad.mockImplementationOnce(() => slow.promise)
    service.getSquad.mockImplementationOnce(async () => ok(squad({ squadCount: 9 })))
    const { result } = renderHook(() => useSquad())
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.state).toMatchObject({ squad: { squadCount: 9 } }))
    await act(async () => slow.resolve(ok(squad({ squadCount: 1 }))))
    expect(result.current.state).toMatchObject({ squad: { squadCount: 9 } })
  })
})

describe('coming back to the app', () => {
  it('loads again when the page becomes visible', async () => {
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => setVisibility('visible'))
    await waitFor(() => expect(service.getSquad).toHaveBeenCalledTimes(2))
  })

  it('does not load when the page is hidden', async () => {
    const { result } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    act(() => setVisibility('hidden'))
    await act(async () => {})
    expect(service.getSquad).toHaveBeenCalledTimes(1)
  })

  it('stops listening once the Squad tab is closed', async () => {
    const { result, unmount } = renderHook(() => useSquad())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    unmount()
    act(() => setVisibility('visible'))
    await act(async () => {})
    expect(service.getSquad).toHaveBeenCalledTimes(1)
  })
})
