import { describe, expect, it, vi } from 'vitest'
import { GEOFENCE_RADIUS_METRES } from '../config/constants'
import { createTestData, positionNorthOfGym, TEST_USER_ID, testGym } from '../test/fixtures'
import type { ReportedPosition } from '../types'
import { attemptShowup, countShowups, evaluatePosition, recordShowup } from './attendanceService'
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

  it('uses the configured radius by default', () => {
    expect(evaluatePosition(positionNorthOfGym(GEOFENCE_RADIUS_METRES - 5), testGym).type).toBe('success')
    expect(evaluatePosition(positionNorthOfGym(GEOFENCE_RADIUS_METRES + 5), testGym).type).toBe('outside-geofence')
  })
})

describe('recordShowup and countShowups', () => {
  it('adds one event linked to the user and gym', () => {
    const before = createTestData()
    const after = recordShowup(before, {
      userId: TEST_USER_ID,
      gymId: testGym.id,
      distanceMetres: 12,
      verifiedAt: new Date('2026-02-03T07:00:00.000Z'),
    })

    expect(before.events).toHaveLength(0) // original data is not mutated
    expect(after.events).toHaveLength(1)
    expect(after.events[0]).toMatchObject({
      userId: TEST_USER_ID,
      gymId: testGym.id,
      distanceMetres: 12,
      verifiedAt: '2026-02-03T07:00:00.000Z',
    })
    expect(after.events[0].id).toEqual(expect.any(String))
  })

  it('only counts events belonging to the given user', () => {
    const data = createTestData()
    data.events = [
      { id: 'e1', userId: TEST_USER_ID, gymId: testGym.id, verifiedAt: '2026-01-01T00:00:00Z', distanceMetres: 1 },
      { id: 'e2', userId: 'someone-else', gymId: 'gym-x', verifiedAt: '2026-01-01T00:00:00Z', distanceMetres: 1 },
    ]
    expect(countShowups(data, TEST_USER_ID)).toBe(1)
  })
})

describe('attemptShowup', () => {
  function attemptWith(getPosition: () => Promise<ReportedPosition>) {
    const data = createTestData()
    return attemptShowup({ data, userId: TEST_USER_ID, gym: testGym, getPosition })
  }

  it('increases the counter by exactly one when the user is at the gym', async () => {
    const getPosition = vi.fn().mockResolvedValue(positionNorthOfGym(30))
    const { outcome, data } = await attemptWith(getPosition)

    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(outcome.type).toBe('success')
    expect(countShowups(data, TEST_USER_ID)).toBe(1)
  })

  it('does not increase the counter when the user is outside the geofence', async () => {
    const { outcome, data } = await attemptWith(() => Promise.resolve(positionNorthOfGym(500)))

    expect(outcome.type).toBe('outside-geofence')
    expect(countShowups(data, TEST_USER_ID)).toBe(0)
    expect(data.events).toHaveLength(0)
  })

  it('does not increase the counter when location accuracy is poor', async () => {
    const { outcome, data } = await attemptWith(() => Promise.resolve(positionNorthOfGym(10, 1_000)))

    expect(outcome.type).toBe('poor-accuracy')
    expect(data.events).toHaveLength(0)
  })

  it('does not increase the counter when location permission is denied', async () => {
    const { outcome, data } = await attemptWith(() =>
      Promise.reject(new GeolocationError('permission-denied', 'User denied Geolocation')),
    )

    expect(outcome).toEqual({ type: 'location-error', reason: 'permission-denied' })
    expect(data.events).toHaveLength(0)
  })

  it('treats an unexpected error as "location unavailable"', async () => {
    const { outcome } = await attemptWith(() => Promise.reject(new Error('boom')))
    expect(outcome).toEqual({ type: 'location-error', reason: 'unavailable' })
  })

  it('keeps the counter and history consistent across successes and failures', async () => {
    const positions = [30, 500, 10, 2_000, 99].map((metres) => positionNorthOfGym(metres))
    let data = createTestData()

    for (const position of positions) {
      const result = await attemptShowup({
        data,
        userId: TEST_USER_ID,
        gym: testGym,
        getPosition: () => Promise.resolve(position),
      })
      data = result.data
    }

    // 30 m, 10 m and 99 m are inside the 100 m radius; 500 m and 2,000 m are not.
    expect(countShowups(data, TEST_USER_ID)).toBe(3)
    expect(data.events).toHaveLength(3)
    expect(data.events.every((event) => event.gymId === testGym.id)).toBe(true)
    expect(new Set(data.events.map((event) => event.id)).size).toBe(3)
  })
})
