import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPosition, isPositionFailure } from './devicePosition'

type SuccessCallback = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
type ErrorCallback = (error: { code: number; message: string }) => void

function mockGeolocation(respond: (success: SuccessCallback, failure: ErrorCallback) => void) {
  const mock = vi.fn((success: SuccessCallback, failure: ErrorCallback, _options?: PositionOptions) => respond(success, failure))
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: mock } })
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getPosition', () => {
  it('resolves with lat, lng and a whole-number accuracy', async () => {
    mockGeolocation((success) => success({ coords: { latitude: 12.5, longitude: 77.25, accuracy: 14.6 } }))
    await expect(getPosition()).resolves.toEqual({ lat: 12.5, lng: 77.25, accuracy: 15 })
  })

  it('asks for high accuracy, a 15 second timeout, and never a cached position', async () => {
    const mock = mockGeolocation((success) => success({ coords: { latitude: 1, longitude: 2, accuracy: 3 } }))
    await getPosition()
    expect(mock.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 })
  })

  it.each([
    [1, 'location_denied'],
    [2, 'location_unavailable'],
    [3, 'location_timeout'],
  ])('throws "%s" style failures: browser code %i becomes "%s"', async (code, failure) => {
    mockGeolocation((_success, fail) => fail({ code, message: 'x' }))
    await expect(getPosition()).rejects.toBe(failure)
  })

  it('treats a browser with no location support as unavailable', async () => {
    vi.stubGlobal('navigator', {})
    await expect(getPosition()).rejects.toBe('location_unavailable')
  })
})

describe('isPositionFailure', () => {
  it('recognises exactly the three failure strings', () => {
    expect(isPositionFailure('location_denied')).toBe(true)
    expect(isPositionFailure('location_unavailable')).toBe(true)
    expect(isPositionFailure('location_timeout')).toBe(true)
    expect(isPositionFailure('something else')).toBe(false)
    expect(isPositionFailure(new Error('x'))).toBe(false)
  })
})
