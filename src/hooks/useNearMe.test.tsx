// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The "Gyms near me" toggle's state: it asks the browser for location only when the person turns it on, falls back
 * to off when that fails, remembers only an on/off flag, and applies that flag on open only when location is
 * already allowed. The device position is faked.
 */

const device = vi.hoisted(() => ({ getNearMePosition: vi.fn() }))
vi.mock('../services/devicePosition', () => ({ getNearMePosition: device.getNearMePosition }))

const { useNearMe, NEAR_ME_STORAGE_KEY, locationAlreadyAllowed } = await import('./useNearMe')

const FOUND = { lat: 12.9716, lng: 77.5946, accuracy: 30 }

/** Pretends the browser's permission answer is `state`, or that the permissions feature is missing (null). */
function permission(state: PermissionState | null | 'throws') {
  if (state === null) vi.stubGlobal('navigator', { ...navigator, permissions: undefined })
  else if (state === 'throws') vi.stubGlobal('navigator', { ...navigator, permissions: { query: vi.fn().mockRejectedValue(new Error('unsupported')) } })
  else vi.stubGlobal('navigator', { ...navigator, permissions: { query: vi.fn().mockResolvedValue({ state }) } })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  device.getNearMePosition.mockResolvedValue(FOUND)
  permission('prompt')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks() // including the storage spies, so one test's blocked storage does not leak into the next
})

describe('never asks by itself', () => {
  it('does not read the position when it first appears, with no saved choice', async () => {
    renderHook(() => useNearMe())
    await act(async () => {})
    expect(device.getNearMePosition).not.toHaveBeenCalled()
  })

  it('starts off, with no position and nothing in progress', () => {
    const { result } = renderHook(() => useNearMe())
    expect(result.current).toMatchObject({ on: false, status: 'idle', position: null })
  })

  it('does not ask on open even when a choice was saved, if location is not already allowed', async () => {
    localStorage.setItem(NEAR_ME_STORAGE_KEY, '1')
    permission('prompt')
    const { result } = renderHook(() => useNearMe())
    await act(async () => {})
    expect(device.getNearMePosition).not.toHaveBeenCalled()
    expect(result.current.on).toBe(false)
    expect(result.current.status).toBe('idle') // not "failed": nobody refused anything
  })

  it.each([['denied'], [null], ['throws']] as const)('does not ask on open when the browser says %s', async (state) => {
    localStorage.setItem(NEAR_ME_STORAGE_KEY, '1')
    permission(state)
    const { result } = renderHook(() => useNearMe())
    await act(async () => {})
    expect(device.getNearMePosition).not.toHaveBeenCalled()
    expect(result.current.on).toBe(false)
  })
})

describe('turning it on', () => {
  it('asks for the position, shows "finding" meanwhile, and then is on with the position', async () => {
    let finish!: (value: typeof FOUND) => void
    device.getNearMePosition.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useNearMe())

    act(() => result.current.toggle(true))
    expect(result.current.status).toBe('finding')
    expect(result.current.on).toBe(false) // not on until there is a position to sort by
    expect(device.getNearMePosition).toHaveBeenCalledTimes(1)

    await act(async () => finish(FOUND))
    expect(result.current).toMatchObject({ on: true, status: 'idle', position: { lat: 12.9716, lng: 77.5946 } })
  })

  it('keeps only the latitude and longitude (not the accuracy or anything else)', async () => {
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.on).toBe(true))
    expect(Object.keys(result.current.position!).sort()).toEqual(['lat', 'lng'])
  })

  it.each([['location_denied'], ['location_unavailable'], ['location_timeout']])('goes back to off with a note when the browser says %s', async (reason) => {
    device.getNearMePosition.mockRejectedValue(reason)
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.on).toBe(false)
    expect(result.current.position).toBeNull()
  })

  it('can be tried again after a failure', async () => {
    device.getNearMePosition.mockRejectedValueOnce('location_denied')
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.status).toBe('failed'))

    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.on).toBe(true))
    expect(result.current.status).toBe('idle')
  })
})

describe('turning it off', () => {
  it('clears the position and goes back to idle', async () => {
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.on).toBe(true))

    act(() => result.current.toggle(false))
    expect(result.current).toMatchObject({ on: false, status: 'idle', position: null })
  })

  it('ignores a position that arrives after the person turned it off again', async () => {
    let finish!: (value: typeof FOUND) => void
    device.getNearMePosition.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    act(() => result.current.toggle(false))
    await act(async () => finish(FOUND))
    expect(result.current).toMatchObject({ on: false, status: 'idle', position: null })
  })

  it('ignores a refusal that arrives after the person turned it off (no stray note)', async () => {
    let fail!: (reason: string) => void
    device.getNearMePosition.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)))
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    act(() => result.current.toggle(false))
    await act(async () => fail('location_denied'))
    expect(result.current.status).toBe('idle')
  })
})

describe('what is remembered', () => {
  it('stores only an on/off flag when turned on, and removes it when turned off', async () => {
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.on).toBe(true))
    expect(localStorage.getItem(NEAR_ME_STORAGE_KEY)).toBe('1')

    act(() => result.current.toggle(false))
    expect(localStorage.getItem(NEAR_ME_STORAGE_KEY)).toBeNull()
  })

  it('never writes a position, in any key', async () => {
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.on).toBe(true))
    const everything = JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))
    expect(everything).not.toContain('12.97')
    expect(everything).not.toContain('77.59')
    expect(localStorage.length).toBe(1)
  })

  it('does not remember a toggle that was refused', async () => {
    device.getNearMePosition.mockRejectedValue('location_denied')
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(localStorage.getItem(NEAR_ME_STORAGE_KEY)).toBeNull()
  })

  it('works when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useNearMe())
    act(() => result.current.toggle(true))
    await waitFor(() => expect(result.current.on).toBe(true))
  })

  it('applies a saved "on" at open when location is already allowed, with no prompt', async () => {
    localStorage.setItem(NEAR_ME_STORAGE_KEY, '1')
    permission('granted')
    const { result } = renderHook(() => useNearMe())
    await waitFor(() => expect(result.current.on).toBe(true))
    expect(result.current.position).toEqual({ lat: 12.9716, lng: 77.5946 })
    expect(device.getNearMePosition).toHaveBeenCalledTimes(1)
  })

  it('a saved "off" (or nothing) never reads the position, even when location is allowed', async () => {
    permission('granted')
    renderHook(() => useNearMe())
    await act(async () => {})
    expect(device.getNearMePosition).not.toHaveBeenCalled()
  })

  it('if a saved "on" cannot get a position even though it was allowed, it ends up off with the note', async () => {
    localStorage.setItem(NEAR_ME_STORAGE_KEY, '1')
    permission('granted')
    device.getNearMePosition.mockRejectedValue('location_timeout')
    const { result } = renderHook(() => useNearMe())
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.on).toBe(false)
  })
})

describe('locationAlreadyAllowed', () => {
  it('is true only for "granted"', async () => {
    permission('granted')
    expect(await locationAlreadyAllowed()).toBe(true)
    permission('prompt')
    expect(await locationAlreadyAllowed()).toBe(false)
    permission('denied')
    expect(await locationAlreadyAllowed()).toBe(false)
  })

  it('is false when the browser cannot say', async () => {
    permission(null)
    expect(await locationAlreadyAllowed()).toBe(false)
    permission('throws')
    expect(await locationAlreadyAllowed()).toBe(false)
  })
})
