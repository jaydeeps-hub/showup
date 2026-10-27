import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_CONFIG, parseAppConfig } from './appConfig'

describe('parseAppConfig', () => {
  it('uses the defaults for an empty answer', () => {
    expect(parseAppConfig({})).toEqual(DEFAULT_APP_CONFIG)
  })

  it.each([null, undefined, 'text', 42, []])('uses the defaults for a non-object answer (%s)', (raw) => {
    expect(parseAppConfig(raw)).toEqual(DEFAULT_APP_CONFIG)
  })

  it('reads every setting from the text the database sends', () => {
    expect(
      parseAppConfig({
        max_gym_distance_meters: '150',
        calendar_start_month: '2026-03',
        pause_passes_per_month: '2',
        pause_max_weeks_ahead: '4',
        mascot_almost_seconds: '240',
      }),
    ).toEqual({
      maxGymDistanceMeters: 150,
      calendarStartMonth: '2026-03',
      pausePassesPerMonth: 2,
      pauseMaxWeeksAhead: 4,
      mascotAlmostSeconds: 240,
    })
  })

  it('removed settings are gone: min_stay_minutes is neither read nor returned', () => {
    const parsed = parseAppConfig({ min_stay_minutes: '15' }) as unknown as Record<string, unknown>
    expect('minStayMinutes' in parsed).toBe(false)
  })
})

describe('mascotAlmostSeconds (config.mascot_almost_seconds)', () => {
  it('defaults to 180 seconds, the value in the database', () => {
    expect(DEFAULT_APP_CONFIG.mascotAlmostSeconds).toBe(180)
    expect(parseAppConfig({}).mascotAlmostSeconds).toBe(180)
  })

  it('reads a number sent as text, as the database sends every value', () => {
    expect(parseAppConfig({ mascot_almost_seconds: '90' }).mascotAlmostSeconds).toBe(90)
  })

  it('reads a real number too', () => {
    expect(parseAppConfig({ mascot_almost_seconds: 60 }).mascotAlmostSeconds).toBe(60)
  })

  it('accepts 0, meaning "almost" never shows', () => {
    expect(parseAppConfig({ mascot_almost_seconds: '0' }).mascotAlmostSeconds).toBe(0)
  })

  it.each(['', '  ', 'soon', '1.5', '-5', '12abc', null, undefined, {}, true])('falls back to 180 for the unusable value %j', (value) => {
    expect(parseAppConfig({ mascot_almost_seconds: value }).mascotAlmostSeconds).toBe(180)
  })

  it('trims spaces around a number', () => {
    expect(parseAppConfig({ mascot_almost_seconds: ' 120 ' }).mascotAlmostSeconds).toBe(120)
  })

  it('does not disturb the other settings when it is bad', () => {
    const parsed = parseAppConfig({ mascot_almost_seconds: 'nope', max_gym_distance_meters: '75' })
    expect(parsed.maxGymDistanceMeters).toBe(75)
    expect(parsed.mascotAlmostSeconds).toBe(180)
  })
})

describe('other settings the app reads', () => {
  it('needs a distance of at least 1 metre (0 would reject everyone)', () => {
    expect(parseAppConfig({ max_gym_distance_meters: '0' }).maxGymDistanceMeters).toBe(100)
    expect(parseAppConfig({ max_gym_distance_meters: '1' }).maxGymDistanceMeters).toBe(1)
  })

  it('accepts only a real YYYY-MM for the calendar start', () => {
    expect(parseAppConfig({ calendar_start_month: '2026-13' }).calendarStartMonth).toBe('2026-06')
    expect(parseAppConfig({ calendar_start_month: 'June' }).calendarStartMonth).toBe('2026-06')
    expect(parseAppConfig({ calendar_start_month: '2025-12' }).calendarStartMonth).toBe('2025-12')
  })
})
