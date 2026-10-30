import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real Google loader is replaced so tests never make network or paid requests.
const fetchAutocompleteSuggestions = vi.hoisted(() => vi.fn())
const searchNearby = vi.hoisted(() => vi.fn())
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue({
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    Place: { searchNearby },
    SearchNearbyRankPreference: { DISTANCE: 'DISTANCE', POPULARITY: 'POPULARITY' },
  }),
}))
vi.mock('../config/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/constants')>()),
  GOOGLE_MAPS_API_KEY: 'test-key',
}))

const { getPlaceDetails, searchNearbyGyms, searchPlaces, sortNearestFirst } = await import('./mapsService')
const { ALLOWED_GYM_PLACE_TYPES } = await import('../config/constants')

const HERE = { lat: 12.9716, lng: 77.5946 }
const token = {} as google.maps.places.AutocompleteSessionToken

/** An object shaped like google.maps.places.Place, with only what the nearby search is asked for. */
function fakePlace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    displayName: 'Iron Gym',
    formattedAddress: '1 Main Road',
    location: { lat: () => 12.9716, lng: () => 77.6046 },
    types: ['gym', 'point_of_interest'],
    ...overrides,
  }
}

function fakePrediction(id: string, distanceMeters: number | null) {
  return {
    placeId: id,
    text: { text: `${id}, somewhere` },
    mainText: { text: id },
    secondaryText: { text: 'somewhere' },
    distanceMeters,
    toPlace: () => ({ fetchFields: vi.fn().mockResolvedValue({}) }),
  } as unknown as google.maps.places.PlacePrediction
}

beforeEach(() => {
  fetchAutocompleteSuggestions.mockReset()
  searchNearby.mockReset()
})

describe('searchNearbyGyms', () => {
  it('asks Google for gyms around the position, nearest first, within the radius and count, and nothing else', async () => {
    searchNearby.mockResolvedValue({ places: [] })
    await searchNearbyGyms(HERE, 3000, 12)

    expect(searchNearby).toHaveBeenCalledTimes(1)
    expect(searchNearby).toHaveBeenCalledWith({
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
      locationRestriction: { center: { lat: HERE.lat, lng: HERE.lng }, radius: 3000 },
      includedTypes: [...ALLOWED_GYM_PLACE_TYPES],
      rankPreference: 'DISTANCE',
      maxResultCount: 12,
    })
  })

  it('requests only the fields the screen needs (no ratings, photos, phone numbers or opening hours)', async () => {
    searchNearby.mockResolvedValue({ places: [] })
    await searchNearbyGyms(HERE, 5000, 20)
    const fields = searchNearby.mock.calls[0][0].fields as string[]
    expect([...fields].sort()).toEqual(['displayName', 'formattedAddress', 'id', 'location', 'types'])
  })

  it('uses the gym and fitness types the app accepts as a gym, whatever the search mode', async () => {
    searchNearby.mockResolvedValue({ places: [] })
    await searchNearbyGyms(HERE, 5000, 20)
    expect(searchNearby.mock.calls[0][0].includedTypes).toEqual(['gym', 'fitness_center', 'yoga_studio', 'sports_club', 'sports_complex', 'sports_activity_location', 'sports_coaching', 'swimming_pool', 'athletic_field', 'ice_skating_rink'])
  })

  it('turns each place into a result that already has its details, and works the distance out itself', async () => {
    searchNearby.mockResolvedValue({ places: [fakePlace()] })
    const [result] = await searchNearbyGyms(HERE, 5000, 20)

    expect(result.placeId).toBe('g1')
    expect(result.primaryText).toBe('Iron Gym')
    expect(result.secondaryText).toBe('1 Main Road')
    expect(result.prediction).toBeUndefined()
    expect(result.nearby).toEqual({
      place: { googlePlaceId: 'g1', name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 12.9716, longitude: 77.6046 },
      types: ['gym', 'point_of_interest'],
    })
    // 0.01 degrees of longitude at this latitude is about 1.08 km.
    expect(result.distanceMeters).toBeGreaterThan(1050)
    expect(result.distanceMeters).toBeLessThan(1110)
  })

  it('sorts by the distance it worked out, nearest first', async () => {
    searchNearby.mockResolvedValue({
      places: [
        fakePlace({ id: 'far', displayName: 'Far', location: { lat: () => 12.9716, lng: () => 77.7 } }),
        fakePlace({ id: 'near', displayName: 'Near', location: { lat: () => 12.9716, lng: () => 77.595 } }),
        fakePlace({ id: 'mid', displayName: 'Mid', location: { lat: () => 12.9716, lng: () => 77.62 } }),
      ],
    })
    expect((await searchNearbyGyms(HERE, 5000, 20)).map((r) => r.placeId)).toEqual(['near', 'mid', 'far'])
  })

  it('leaves out a place with no coordinates, since it cannot be saved or measured', async () => {
    searchNearby.mockResolvedValue({ places: [fakePlace({ id: 'nowhere', location: null }), fakePlace({ id: 'ok' })] })
    expect((await searchNearbyGyms(HERE, 5000, 20)).map((r) => r.placeId)).toEqual(['ok'])
  })

  it('falls back to the address when a place has no name, and to no types when there are none', async () => {
    searchNearby.mockResolvedValue({ places: [fakePlace({ displayName: null, types: undefined })] })
    const [result] = await searchNearbyGyms(HERE, 5000, 20)
    expect(result.primaryText).toBe('1 Main Road')
    expect(result.secondaryText).toBe('')
    expect(result.nearby?.place.name).toBe('1 Main Road')
    expect(result.nearby?.types).toEqual([])
  })

  it('returns an empty list when there are no gyms nearby', async () => {
    searchNearby.mockResolvedValue({ places: [] })
    expect(await searchNearbyGyms(HERE, 5000, 20)).toEqual([])
  })

  it('lets a failure from Google through, for the screen to report', async () => {
    searchNearby.mockRejectedValue(new Error('REQUEST_DENIED'))
    await expect(searchNearbyGyms(HERE, 5000, 20)).rejects.toThrow('REQUEST_DENIED')
  })
})

describe('searchPlaces with a device position', () => {
  it('biases toward the position and asks for distances', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] })
    await searchPlaces('iron', token, HERE, 5000)
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: 'iron',
      sessionToken: token,
      origin: { lat: HERE.lat, lng: HERE.lng },
      locationBias: { center: { lat: HERE.lat, lng: HERE.lng }, radius: 5000 },
    })
  })

  it('uses Google\'s largest bias circle when no radius is given', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] })
    await searchPlaces('iron', token, HERE)
    expect(fetchAutocompleteSuggestions.mock.calls[0][0].locationBias.radius).toBe(50_000)
  })

  it('does not restrict the results: it is a nudge, not a filter', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] })
    await searchPlaces('iron', token, HERE, 5000)
    const request = fetchAutocompleteSuggestions.mock.calls[0][0]
    expect('locationRestriction' in request).toBe(false)
    expect('includedPrimaryTypes' in request).toBe(false)
  })

  it('with no position, sends exactly what it always did', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] })
    await searchPlaces('iron', token)
    expect(fetchAutocompleteSuggestions.mock.calls[0][0]).toEqual({ input: 'iron', sessionToken: token })
    expect('origin' in fetchAutocompleteSuggestions.mock.calls[0][0]).toBe(false)
  })

  it('carries Google\'s distance and sorts nearest first', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [{ placePrediction: fakePrediction('far', 4200) }, { placePrediction: fakePrediction('near', 640) }, { placePrediction: fakePrediction('mid', 1800) }],
    })
    const results = await searchPlaces('gym', token, HERE, 5000)
    expect(results.map((r) => [r.placeId, r.distanceMeters])).toEqual([['near', 640], ['mid', 1800], ['far', 4200]])
  })

  it('puts a result Google gave no distance for last, in the order Google gave them', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [{ placePrediction: fakePrediction('a', null) }, { placePrediction: fakePrediction('b', 900) }, { placePrediction: fakePrediction('c', null) }],
    })
    const results = await searchPlaces('gym', token, HERE, 5000)
    expect(results.map((r) => r.placeId)).toEqual(['b', 'a', 'c'])
    expect(results[1].distanceMeters).toBeUndefined()
  })

  it('without a position, keeps Google\'s order and adds no distance', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [{ placePrediction: fakePrediction('z', 5) }, { placePrediction: fakePrediction('a', 1) }],
    })
    const results = await searchPlaces('gym', token)
    expect(results.map((r) => r.placeId)).toEqual(['z', 'a'])
    expect(results.every((r) => r.distanceMeters === undefined)).toBe(true)
  })
})

describe('getPlaceDetails for a nearby result', () => {
  it('returns the details it already has, without asking Google again', async () => {
    const nearby = { place: { googlePlaceId: 'g1', name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 1, longitude: 2 }, types: ['gym'] }
    await expect(getPlaceDetails({ placeId: 'g1', primaryText: 'Iron Gym', secondaryText: '', nearby })).resolves.toBe(nearby)
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled()
  })

  it('throws, rather than crashing, for a result with neither', async () => {
    await expect(getPlaceDetails({ placeId: 'x', primaryText: 'x', secondaryText: '' })).rejects.toThrow(/no details/)
  })
})

describe('sortNearestFirst', () => {
  it('orders by distance, missing last, and keeps the original order for ties', () => {
    const rows = [{ id: 'a', distanceMeters: 5 }, { id: 'b' }, { id: 'c', distanceMeters: 5 }, { id: 'd', distanceMeters: 1 }, { id: 'e' }]
    expect(sortNearestFirst(rows).map((r) => r.id)).toEqual(['d', 'a', 'c', 'b', 'e'])
  })

  it('does not change the list it is given', () => {
    const rows = [{ id: 'a', distanceMeters: 9 }, { id: 'b', distanceMeters: 1 }]
    sortNearestFirst(rows)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
