import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPosition, GeolocationError } from './geolocationService'

type SuccessCallback = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
type ErrorCallback = (error: { code: number; message: string }) => void

/** Replaces navigator.geolocation with a fake that calls one of the callbacks. */
function mockGeolocation(respond: (success: SuccessCallback, failure: ErrorCallback) => void) {
  const getCurrentPositionMock = vi.fn((success: SuccessCallback, failure: ErrorCallback, _options?: PositionOptions) =>
    respond(success, failure),
  )
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: getCurrentPositionMock } })
  return getCurrentPositionMock
}

describe('getCurrentPosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves with coordinates and accuracy, requesting high accuracy', async () => {
    const mock = mockGeolocation((success) => success({ coords: { latitude: 1, longitude: 2, accuracy: 15 } }))

    await expect(getCurrentPosition()).resolves.toEqual({ latitude: 1, longitude: 2, accuracyMetres: 15 })
    expect(mock.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true })
  })

  it.each([
    [1, 'permission-denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('maps browser error code %i to "%s"', async (code, reason) => {
    mockGeolocation((_success, failure) => failure({ code, message: 'failed' }))

    const error = await getCurrentPosition().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GeolocationError)
    expect((error as GeolocationError).reason).toBe(reason)
  })

  it('rejects with "unsupported" when the browser has no geolocation', async () => {
    vi.stubGlobal('navigator', {})

    const error = await getCurrentPosition().catch((caught: unknown) => caught)
    expect((error as GeolocationError).reason).toBe('unsupported')
  })
})
