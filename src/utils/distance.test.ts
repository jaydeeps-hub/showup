import { describe, expect, it } from 'vitest'
import { distanceInMetres } from './distance'

describe('distanceInMetres', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { latitude: 12.9716, longitude: 77.5946 }
    expect(distanceInMetres(point, point)).toBe(0)
  })

  it('returns about 111.19 km for one degree of latitude', () => {
    const distance = distanceInMetres({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })
    expect(distance).toBeCloseTo(111_194.9, 0)
  })

  it('returns roughly 340 km between Big Ben and the Eiffel Tower', () => {
    const bigBen = { latitude: 51.5007, longitude: -0.1246 }
    const eiffelTower = { latitude: 48.8584, longitude: 2.2945 }
    const distance = distanceInMetres(bigBen, eiffelTower)
    expect(distance).toBeGreaterThan(335_000)
    expect(distance).toBeLessThan(345_000)
  })

  it('gives the same distance in both directions', () => {
    const a = { latitude: 40.7128, longitude: -74.006 }
    const b = { latitude: 34.0522, longitude: -118.2437 }
    expect(distanceInMetres(a, b)).toBeCloseTo(distanceInMetres(b, a), 6)
  })
})
