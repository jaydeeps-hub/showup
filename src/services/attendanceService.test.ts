import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_CONFIG } from './appConfig'
import { positionNorthOfGym, testGym } from '../test/fixtures'
import type { ReportedPosition } from '../types'
import { checkLocation, evaluatePosition } from './attendanceService'
import { GeolocationError } from './geolocationService'

const rules = { radiusMetres: 100, maxAccuracyMetres: 100 }

describe('evaluatePosition', () => {
  it('passes a user inside the radius', () => {
    const result = evaluatePosition(positionNorthOfGym(50), testGym, rules)
    expect(result.type).toBe('success')
    if (result.type === 'success') expect(result.distanceMetres).toBeCloseTo(50, 0)
  })

  it('passes a user exactly at the gym', () => {
    expect(evaluatePosition(positionNorthOfGym(0), testGym, rules).type).toBe('success')
  })

  it('fails a user outside the radius', () => {
    expect(evaluatePosition(positionNorthOfGym(150), testGym, rules).type).toBe('outside-geofence')
  })

  it('rejects an imprecise reading that might be inside the radius', () => {
    const result = evaluatePosition(positionNorthOfGym(20, 500), testGym, rules)
    expect(result).toEqual({ type: 'poor-accuracy', accuracyMetres: 500 })
  })

  it('reports "outside" for an imprecise reading that is clearly far away', () => {
    expect(evaluatePosition(positionNorthOfGym(5_000, 500), testGym, rules).type).toBe('outside-geofence')
  })

  it('uses the configured radius by default (100 m until the database config is loaded)', () => {
    const radius = DEFAULT_APP_CONFIG.maxGymDistanceMeters
    expect(radius).toBe(100)
    expect(evaluatePosition(positionNorthOfGym(radius - 5), testGym).type).toBe('success')
    expect(evaluatePosition(positionNorthOfGym(radius + 5), testGym).type).toBe('outside-geofence')
  })
})

describe('checkLocation', () => {
  function checkWith(getPosition: () => Promise<ReportedPosition>) {
    return checkLocation({ gym: testGym, getPosition })
  }

  it('reports success, with the position to send to the database, when the user is at the gym', async () => {
    const reported = positionNorthOfGym(30, 12)
    const getPosition = vi.fn().mockResolvedValue(reported)
    const { outcome, position } = await checkWith(getPosition)

    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(outcome.type).toBe('success')
    expect(position).toEqual(reported)
  })

  it('reports outside-geofence when the user is too far away', async () => {
    const { outcome } = await checkWith(() => Promise.resolve(positionNorthOfGym(500)))
    expect(outcome.type).toBe('outside-geofence')
  })

  it('reports poor accuracy when the reading is too vague', async () => {
    const { outcome } = await checkWith(() => Promise.resolve(positionNorthOfGym(10, 1_000)))
    expect(outcome.type).toBe('poor-accuracy')
  })

  it('reports a location error, with no position, when permission is denied', async () => {
    const { outcome, position } = await checkWith(() =>
      Promise.reject(new GeolocationError('permission-denied', 'User denied Geolocation')),
    )
    expect(outcome).toEqual({ type: 'location-error', reason: 'permission-denied' })
    expect(position).toBeNull()
  })

  it('treats an unexpected error as "location unavailable"', async () => {
    const { outcome } = await checkWith(() => Promise.reject(new Error('boom')))
    expect(outcome).toEqual({ type: 'location-error', reason: 'unavailable' })
  })
})
