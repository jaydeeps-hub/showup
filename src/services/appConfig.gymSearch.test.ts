import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_CONFIG, MAX_GYM_SEARCH_RADIUS_METERS, MAX_GYM_SEARCH_RESULTS, parseAppConfig } from './appConfig'

/** The two "Gyms near me" settings (Phase 10g): gym_search_radius_meters and gym_search_max_results. */

describe('the gym search settings', () => {
  it('default to 5000 metres and 20 results', () => {
    expect(DEFAULT_APP_CONFIG.gymSearchRadiusMeters).toBe(5000)
    expect(DEFAULT_APP_CONFIG.gymSearchMaxResults).toBe(20)
    expect(parseAppConfig({}).gymSearchRadiusMeters).toBe(5000)
    expect(parseAppConfig({}).gymSearchMaxResults).toBe(20)
    expect(parseAppConfig(null).gymSearchRadiusMeters).toBe(5000)
  })

  it('are read from the text the database sends, under the names the SQL file seeds', () => {
    const parsed = parseAppConfig({ gym_search_radius_meters: '8000', gym_search_max_results: '10' })
    expect(parsed.gymSearchRadiusMeters).toBe(8000)
    expect(parsed.gymSearchMaxResults).toBe(10)
  })

  it('accept real numbers as well as text', () => {
    const parsed = parseAppConfig({ gym_search_radius_meters: 1200, gym_search_max_results: 5 })
    expect([parsed.gymSearchRadiusMeters, parsed.gymSearchMaxResults]).toEqual([1200, 5])
  })

  it('accept the largest values Google allows, and fall back above them', () => {
    expect(MAX_GYM_SEARCH_RADIUS_METERS).toBe(50_000)
    expect(MAX_GYM_SEARCH_RESULTS).toBe(20)
    expect(parseAppConfig({ gym_search_radius_meters: '50000' }).gymSearchRadiusMeters).toBe(50_000)
    expect(parseAppConfig({ gym_search_radius_meters: '50001' }).gymSearchRadiusMeters).toBe(5000)
    expect(parseAppConfig({ gym_search_max_results: '20' }).gymSearchMaxResults).toBe(20)
    expect(parseAppConfig({ gym_search_max_results: '21' }).gymSearchMaxResults).toBe(20)
  })

  it('need at least 1, so a radius or count of zero (or less) falls back', () => {
    expect(parseAppConfig({ gym_search_radius_meters: '1' }).gymSearchRadiusMeters).toBe(1)
    expect(parseAppConfig({ gym_search_radius_meters: '0' }).gymSearchRadiusMeters).toBe(5000)
    expect(parseAppConfig({ gym_search_radius_meters: '-5' }).gymSearchRadiusMeters).toBe(5000)
    expect(parseAppConfig({ gym_search_max_results: '1' }).gymSearchMaxResults).toBe(1)
    expect(parseAppConfig({ gym_search_max_results: '0' }).gymSearchMaxResults).toBe(20)
  })

  it('fall back for text that is not a whole number, without touching the other settings', () => {
    const parsed = parseAppConfig({ gym_search_radius_meters: '5km', gym_search_max_results: '', max_gym_distance_meters: '150' })
    expect(parsed.gymSearchRadiusMeters).toBe(5000)
    expect(parsed.gymSearchMaxResults).toBe(20)
    expect(parsed.maxGymDistanceMeters).toBe(150)
    expect(parseAppConfig({ gym_search_radius_meters: '1.5' }).gymSearchRadiusMeters).toBe(5000)
    expect(parseAppConfig({ gym_search_radius_meters: {} }).gymSearchRadiusMeters).toBe(5000)
  })
})
