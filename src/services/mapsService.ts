import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { GOOGLE_MAPS_API_KEY } from '../config/constants'
import type { SelectedPlace } from '../types'

/**
 * Talks to the Google Maps JavaScript API, using Places API (New):
 * - AutocompleteSuggestion: suggestions while the user types
 * - Place.fetchFields: name, address and coordinates for the chosen place
 *
 * Components never call `google.maps` directly; they go through this file.
 */

export class MapsConfigurationError extends Error {
  constructor() {
    super('VITE_GOOGLE_MAPS_API_KEY is not set.')
    this.name = 'MapsConfigurationError'
  }
}

export interface PlaceSuggestion {
  placeId: string
  primaryText: string
  secondaryText: string
  /** Kept so we can turn the suggestion into a full Place later. */
  prediction: google.maps.places.PlacePrediction
}

export function isMapsConfigured(): boolean {
  return GOOGLE_MAPS_API_KEY.length > 0
}

let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null
let optionsSet = false

/** Loads the Google Maps script once and returns the Places library. */
export function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (!isMapsConfigured()) {
    return Promise.reject(new MapsConfigurationError())
  }
  if (!optionsSet) {
    setOptions({ key: GOOGLE_MAPS_API_KEY, v: 'weekly' })
    optionsSet = true
  }
  if (!placesLibraryPromise) {
    placesLibraryPromise = importLibrary('places').catch((error: unknown) => {
      // Allow a later retry (e.g. after the network comes back).
      placesLibraryPromise = null
      throw error
    })
  }
  return placesLibraryPromise
}

/**
 * A session token groups the typing and the final selection into one billable
 * Google "session". Create a new one each time the user starts a new search.
 */
export async function createSearchSession(): Promise<google.maps.places.AutocompleteSessionToken> {
  const { AutocompleteSessionToken } = await loadPlacesLibrary()
  return new AutocompleteSessionToken()
}

export async function searchPlaces(
  input: string,
  sessionToken: google.maps.places.AutocompleteSessionToken,
): Promise<PlaceSuggestion[]> {
  const { AutocompleteSuggestion } = await loadPlacesLibrary()
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken })

  return suggestions.flatMap((suggestion) => {
    const prediction = suggestion.placePrediction
    if (!prediction) return []
    return [
      {
        placeId: prediction.placeId,
        primaryText: prediction.mainText?.text ?? prediction.text.text,
        secondaryText: prediction.secondaryText?.text ?? '',
        prediction,
      },
    ]
  })
}

export interface PlaceDetails {
  place: SelectedPlace
  /** Google's categories for the place, e.g. ["gym", "point_of_interest"]. Used for checking, not saved. */
  types: string[]
}

/** Fetches the details we need for a gym. Throws if Google has no coordinates. */
export async function getPlaceDetails(suggestion: PlaceSuggestion): Promise<PlaceDetails> {
  const place = suggestion.prediction.toPlace()
  await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'] })

  if (!place.location) {
    throw new Error('Google Maps did not return coordinates for this place.')
  }

  return {
    place: {
      googlePlaceId: place.id || null,
      name: place.displayName ?? suggestion.primaryText,
      formattedAddress: place.formattedAddress ?? suggestion.secondaryText,
      latitude: place.location.lat(),
      longitude: place.location.lng(),
    },
    types: place.types ?? [],
  }
}
