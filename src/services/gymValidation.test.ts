import { describe, expect, it } from 'vitest'
import { isFitnessPlace, isPlaceAllowed } from './gymValidation'

describe('isFitnessPlace', () => {
  it.each([
    [['gym', 'health', 'point_of_interest', 'establishment']],
    [['fitness_center', 'establishment']],
    [['yoga_studio']],
    [['swimming_pool', 'sports_activity_location']],
  ])('accepts a fitness place with types %j', (types) => {
    expect(isFitnessPlace(types)).toBe(true)
  })

  it.each([
    [['street_address']],
    [['premise']],
    [['restaurant', 'food', 'point_of_interest', 'establishment']],
    [['locality', 'political']],
    [['park', 'point_of_interest']],
    [[]],
  ])('rejects a non-fitness place with types %j', (types) => {
    expect(isFitnessPlace(types)).toBe(false)
  })
})

describe('isPlaceAllowed (search mode rules)', () => {
  const gym = ['gym', 'point_of_interest']
  const home = ['street_address']
  const noTypes: string[] = []

  it('defaults to fitness places only when no mode is given', () => {
    expect(isPlaceAllowed(gym)).toBe(true)
    expect(isPlaceAllowed(home)).toBe(false)
  })

  it('in fitness_only mode accepts fitness places and rejects everything else', () => {
    expect(isPlaceAllowed(gym, 'fitness_only')).toBe(true)
    expect(isPlaceAllowed(home, 'fitness_only')).toBe(false)
    expect(isPlaceAllowed(['restaurant', 'food'], 'fitness_only')).toBe(false)
    expect(isPlaceAllowed(noTypes, 'fitness_only')).toBe(false)
  })

  it('in any_place mode accepts any place, even one with no types', () => {
    expect(isPlaceAllowed(gym, 'any_place')).toBe(true)
    expect(isPlaceAllowed(home, 'any_place')).toBe(true)
    expect(isPlaceAllowed(noTypes, 'any_place')).toBe(true)
  })

  it('treats an unexpected mode as the restrictive one', () => {
    expect(isPlaceAllowed(home, 'ANY_PLACE' as never)).toBe(false)
    expect(isPlaceAllowed(home, undefined)).toBe(false)
    expect(isPlaceAllowed(home, null as never)).toBe(false)
  })
})
