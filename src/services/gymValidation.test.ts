import { describe, expect, it } from 'vitest'
import { isFitnessPlace } from './gymValidation'

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
