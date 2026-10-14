import { beforeEach, describe, expect, it, vi } from 'vitest'

// Replace the real Google loader so tests never make network or paid requests.
// mapsService caches the loaded library, so every test shares this one fake.
const fetchAutocompleteSuggestions = vi.hoisted(() => vi.fn())
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue({ AutocompleteSuggestion: { fetchAutocompleteSuggestions } }),
}))
vi.mock('../config/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/constants')>()),
  GOOGLE_MAPS_API_KEY: 'test-key',
}))

const { getPlaceDetails, searchPlaces } = await import('./mapsService')

/** Builds an object shaped like google.maps.places.PlacePrediction. */
function fakePrediction(place: Record<string, unknown>) {
  return {
    placeId: 'place-123',
    text: { text: 'Iron Gym, 5 Main Road' },
    mainText: { text: 'Iron Gym' },
    secondaryText: { text: '5 Main Road' },
    toPlace: () => ({ ...place, fetchFields: vi.fn().mockResolvedValue({}) }),
  } as unknown as google.maps.places.PlacePrediction
}

describe('mapsService', () => {
  beforeEach(() => {
    fetchAutocompleteSuggestions.mockReset()
  })

  it('turns Google autocomplete results into suggestions', async () => {
    const prediction = fakePrediction({})
    fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [{ placePrediction: prediction }, { placePrediction: null }],
    })

    const token = {} as google.maps.places.AutocompleteSessionToken
    const suggestions = await searchPlaces('iron gym', token)

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({ input: 'iron gym', sessionToken: token })
    expect(suggestions).toEqual([
      { placeId: 'place-123', primaryText: 'Iron Gym', secondaryText: '5 Main Road', prediction },
    ])
  })

  it('returns an empty list when Google finds nothing', async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] })

    await expect(searchPlaces('zzzz', {} as google.maps.places.AutocompleteSessionToken)).resolves.toEqual([])
  })

  it('extracts name, address, coordinates and types from place details', async () => {
    const prediction = fakePrediction({
      id: 'place-123',
      displayName: 'Iron Gym',
      formattedAddress: '5 Main Road, Springfield',
      location: { lat: () => 10.5, lng: () => 20.25 },
      types: ['gym', 'point_of_interest'],
    })

    const details = await getPlaceDetails({ placeId: 'place-123', primaryText: 'Iron Gym', secondaryText: '', prediction })

    expect(details).toEqual({
      place: {
        googlePlaceId: 'place-123',
        name: 'Iron Gym',
        formattedAddress: '5 Main Road, Springfield',
        latitude: 10.5,
        longitude: 20.25,
      },
      types: ['gym', 'point_of_interest'],
    })
  })

  it('returns no types when Google provides none', async () => {
    const prediction = fakePrediction({ id: 'place-9', location: { lat: () => 1, lng: () => 2 } })

    const details = await getPlaceDetails({ placeId: 'place-9', primaryText: 'Home', secondaryText: '', prediction })

    expect(details.types).toEqual([])
  })

  it('throws if Google returns no coordinates', async () => {
    const prediction = fakePrediction({ id: 'place-123', displayName: 'Iron Gym', location: null })

    await expect(
      getPlaceDetails({ placeId: 'place-123', primaryText: 'Iron Gym', secondaryText: '', prediction }),
    ).rejects.toThrow(/coordinates/)
  })
})
