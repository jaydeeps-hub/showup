import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { ALLOWED_GYM_PLACE_TYPES, GOOGLE_MAPS_API_KEY } from '../config/constants'
import type { SelectedPlace } from '../types'
import { haversineMeters, type LatLng } from '../utils/distance'

/**
 * Talks to the Google Maps JavaScript API, using Places API (New):
 * - AutocompleteSuggestion: suggestions while the user types (optionally biased toward the device position)
 * - Place.searchNearby: the gyms around the device position, nearest first ("Gyms near me")
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
  /**
   * Kept so we can turn the suggestion into a full Place later. A result of the nearby search has no prediction:
   * it already carries its own details (`nearby`), so choosing it needs no second request.
   */
  prediction?: google.maps.places.PlacePrediction
  /** Set on a result of the nearby search: the place's details, ready to use. */
  nearby?: PlaceDetails
  /** Straight-line distance from the device in metres, worked out in the app. Only set when a position was given. */
  distanceMeters?: number
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

/**
 * Typed search. With a device `position` the search is biased toward it (`locationBias` is only a nudge, so
 * places farther away still appear) and asks Google for each result's distance (`origin`), and the results are
 * sorted nearest first. A result Google gives no distance for goes last. With no position the request is exactly
 * what it always was.
 */
export async function searchPlaces(
  input: string,
  sessionToken: google.maps.places.AutocompleteSessionToken,
  position?: LatLng,
  biasRadiusMeters?: number,
): Promise<PlaceSuggestion[]> {
  const { AutocompleteSuggestion } = await loadPlacesLibrary()
  const request: google.maps.places.AutocompleteRequest = { input, sessionToken }
  if (position) {
    request.origin = { lat: position.lat, lng: position.lng }
    request.locationBias = { center: { lat: position.lat, lng: position.lng }, radius: biasRadiusMeters ?? DEFAULT_BIAS_RADIUS_METERS }
  }
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request)

  const results = suggestions.flatMap((suggestion): PlaceSuggestion[] => {
    const prediction = suggestion.placePrediction
    if (!prediction) return []
    return [
      {
        placeId: prediction.placeId,
        primaryText: prediction.mainText?.text ?? prediction.text.text,
        secondaryText: prediction.secondaryText?.text ?? '',
        prediction,
        ...(position && typeof prediction.distanceMeters === 'number' ? { distanceMeters: prediction.distanceMeters } : {}),
      },
    ]
  })
  return position ? sortNearestFirst(results) : results
}

/** The area a typed search is nudged toward when none is given: Google's own ceiling for a bias circle. */
const DEFAULT_BIAS_RADIUS_METERS = 50_000

/** Nearest first; a result with no distance goes after the ones that have one, in the order Google gave them. */
export function sortNearestFirst<T extends { distanceMeters?: number }>(results: readonly T[]): T[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const da = a.result.distanceMeters ?? Number.POSITIVE_INFINITY
      const db = b.result.distanceMeters ?? Number.POSITIVE_INFINITY
      return da === db ? a.index - b.index : da - db
    })
    .map(({ result }) => result)
}

/**
 * The gyms around the device, nearest first ("Gyms near me" with an empty search box). Google's own ranking by
 * distance is used and each distance is then worked out here from the place's coordinates, so no second request is
 * needed. Only gym-type places are asked for, for everyone: a person who may search any place still sees gyms in
 * this list, and finds other places by typing.
 *
 * Only the fields the screen needs are requested (id, name, address, coordinates, and the types the gym check
 * uses), which keeps the request in the cheaper billing tier.
 */
export async function searchNearbyGyms(position: LatLng, radiusMeters: number, maxResults: number): Promise<PlaceSuggestion[]> {
  const { Place, SearchNearbyRankPreference } = await loadPlacesLibrary()
  const { places } = await Place.searchNearby({
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
    locationRestriction: { center: { lat: position.lat, lng: position.lng }, radius: radiusMeters },
    includedTypes: NEARBY_GYM_TYPES,
    rankPreference: SearchNearbyRankPreference.DISTANCE,
    maxResultCount: maxResults,
  })

  const results = places.flatMap((place): PlaceSuggestion[] => {
    if (!place.location) return [] // no coordinates: cannot be saved or measured
    const latitude = place.location.lat()
    const longitude = place.location.lng()
    const name = place.displayName ?? ''
    const address = place.formattedAddress ?? ''
    return [
      {
        placeId: place.id,
        primaryText: name || address,
        secondaryText: name ? address : '',
        distanceMeters: haversineMeters(position, { lat: latitude, lng: longitude }),
        nearby: {
          place: { googlePlaceId: place.id || null, name: name || address, formattedAddress: address, latitude, longitude },
          types: place.types ?? [],
        },
      },
    ]
  })
  // Google already ranked by distance; sorting again by the distance worked out here keeps the list and the
  // numbers shown on it consistent with each other.
  return sortNearestFirst(results)
}

/** The kinds of place the nearby list asks for: the same gym and fitness types the app accepts as a gym. */
const NEARBY_GYM_TYPES = ALLOWED_GYM_PLACE_TYPES.slice(0, 50)

export interface PlaceDetails {
  place: SelectedPlace
  /** Google's categories for the place, e.g. ["gym", "point_of_interest"]. Used for checking, not saved. */
  types: string[]
}

/**
 * Fetches the details we need for a gym. Throws if Google has no coordinates. A result of the nearby search
 * already has its details, so it is returned as it is, with no second request.
 */
export async function getPlaceDetails(suggestion: PlaceSuggestion): Promise<PlaceDetails> {
  if (suggestion.nearby) return suggestion.nearby
  if (!suggestion.prediction) throw new Error('This result has no details to load.')
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
