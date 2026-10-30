import { describe, expect, it } from 'vitest'
import { formatDistance, haversineMeters } from './distance'
import { NEAR_ME_CACHE_MS, NearMeCache, nearMeCacheKey } from './nearMeCache'

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9716, lng: 77.5946 })).toBe(0)
  })

  it('is about 111.2 km for one degree of latitude, and 111.2 km * cos(latitude) for a degree of longitude', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2)
    expect(haversineMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 1 })).toBeCloseTo(55_597, -2)
  })

  it('matches a known real distance: Bengaluru to Chennai is about 290 km', () => {
    const km = haversineMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 13.0827, lng: 80.2707 }) / 1000
    expect(km).toBeGreaterThan(285)
    expect(km).toBeLessThan(295)
  })

  it('is the same both ways, and works across the date line and the poles', () => {
    const a = { lat: 10, lng: 179.5 }
    const b = { lat: -5, lng: -179.5 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
    // 15 degrees of latitude is about 1,670 km, plus a degree of longitude across the date line. Going the wrong
    // way round the world would give more than 38,000 km.
    expect(haversineMeters(a, b)).toBeGreaterThan(1_650_000)
    expect(haversineMeters(a, b)).toBeLessThan(1_700_000)
    expect(haversineMeters({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBeCloseTo(20_015_087, -3)
  })

  it('does not return NaN for opposite points', () => {
    expect(Number.isNaN(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }))).toBe(false)
  })

  it('measures a short walk well: 0.001 degrees of latitude is about 111 m', () => {
    expect(haversineMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9726, lng: 77.5946 })).toBeCloseTo(111.2, 0)
  })
})

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [4, '0 m'],
    [5, '10 m'],
    [640, '640 m'],
    [644, '640 m'],
    [645, '650 m'],
    [994, '990 m'],
    [1000, '1.0 km'],
    [1049, '1.0 km'],
    [1050, '1.1 km'],
    [1200, '1.2 km'],
    [9950, '10.0 km'],
    [22_400, '22.4 km'],
  ])('%i metres reads "%s"', (meters, text) => {
    expect(formatDistance(meters)).toBe(text)
  })

  it('never reads "1000 m": just under a kilometre goes to km', () => {
    expect(formatDistance(995)).toBe('1.0 km')
    expect(formatDistance(999.6)).toBe('1.0 km')
  })

  it('reads nothing for a distance that is not a sensible number', () => {
    expect(formatDistance(Number.NaN)).toBe('')
    expect(formatDistance(-1)).toBe('')
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('nearMeCacheKey', () => {
  const here = { lat: 12.9716, lng: 77.5946 }

  it('is the same for positions within about 100 m, and different beyond that', () => {
    expect(nearMeCacheKey('iron', here)).toBe(nearMeCacheKey('iron', { lat: 12.97162, lng: 77.59458 }))
    expect(nearMeCacheKey('iron', here)).not.toBe(nearMeCacheKey('iron', { lat: 12.9736, lng: 77.5946 }))
  })

  it('ignores case and extra spaces in the text, but not different text', () => {
    expect(nearMeCacheKey('Iron  Gym ', here)).toBe(nearMeCacheKey('iron gym', here))
    expect(nearMeCacheKey('iron', here)).not.toBe(nearMeCacheKey('iron gym', here))
  })

  it('keeps the empty search (the nearby list) apart from any typed one', () => {
    expect(nearMeCacheKey('', here)).not.toBe(nearMeCacheKey('a', here))
  })

  it('only holds a rounded position, never the exact one', () => {
    expect(nearMeCacheKey('x', { lat: 12.97163456, lng: 77.59461234 })).toBe('x|12.972,77.595')
  })
})

describe('NearMeCache', () => {
  it('returns what was stored, and nothing for an unknown key', () => {
    const cache = new NearMeCache<string[]>(() => 0)
    cache.set('a', ['x'])
    expect(cache.get('a')).toEqual(['x'])
    expect(cache.get('b')).toBeUndefined()
  })

  it('keeps an entry for five minutes and then forgets it', () => {
    let now = 1_000
    const cache = new NearMeCache<number>(() => now)
    cache.set('a', 1)
    expect(NEAR_ME_CACHE_MS).toBe(300_000)
    now += NEAR_ME_CACHE_MS - 1
    expect(cache.get('a')).toBe(1)
    now += 1
    expect(cache.get('a')).toBeUndefined()
  })

  it('a newer value replaces an older one and restarts its five minutes', () => {
    let now = 0
    const cache = new NearMeCache<number>(() => now)
    cache.set('a', 1)
    now = 200_000
    cache.set('a', 2)
    now = 400_000
    expect(cache.get('a')).toBe(2)
  })

  it('can be emptied', () => {
    const cache = new NearMeCache<number>(() => 0)
    cache.set('a', 1)
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
  })

  it('keeps an empty result (no gyms nearby) as a real answer, not as "not stored"', () => {
    const cache = new NearMeCache<string[]>(() => 0)
    cache.set('a', [])
    expect(cache.get('a')).toEqual([])
  })
})
