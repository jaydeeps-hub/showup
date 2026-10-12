import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { PLACE_SEARCH_DEBOUNCE_MS, PLACE_SEARCH_MIN_CHARACTERS } from '../../config/constants'
import {
  createSearchSession,
  getPlaceDetails,
  isMapsConfigured,
  searchPlaces,
  type PlaceSuggestion,
} from '../../services/mapsService'
import type { SelectedPlace } from '../../types'

type MapsStatus = 'not-configured' | 'loading' | 'ready' | 'load-failed'

interface GymSearchProps {
  /** Called with full place details once the user picks a suggestion. */
  onPlaceSelected: (place: SelectedPlace | null) => void
}

/** Search box backed by Google Maps Places autocomplete. */
export function GymSearch({ onPlaceSelected }: GymSearchProps) {
  const [mapsStatus, setMapsStatus] = useState<MapsStatus>(isMapsConfigured() ? 'loading' : 'not-configured')
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<PlaceSuggestion | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  // Load the Google Maps script (once) and start a search session.
  useEffect(() => {
    if (mapsStatus !== 'loading') return
    let cancelled = false
    createSearchSession()
      .then((token) => {
        if (cancelled) return
        sessionToken.current = token
        setMapsStatus('ready')
      })
      .catch((error: unknown) => {
        console.error('Google Maps failed to load', error)
        if (!cancelled) setMapsStatus('load-failed')
      })
    return () => {
      cancelled = true
    }
  }, [mapsStatus])

  // Ask Google for suggestions shortly after the user stops typing.
  useEffect(() => {
    const query = inputValue.trim()
    const showingSelection = selectedSuggestion !== null && inputValue === selectedSuggestion.primaryText
    if (mapsStatus !== 'ready' || query.length < PLACE_SEARCH_MIN_CHARACTERS || showingSelection) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const token = sessionToken.current
      if (!token) return
      setIsSearching(true)
      setErrorMessage(null)
      try {
        const results = await searchPlaces(query, token)
        if (!cancelled) setSuggestions(results)
      } catch (error) {
        console.error('Google Maps search failed', error)
        if (!cancelled) {
          setSuggestions([])
          setErrorMessage('Search failed. Check your internet connection and Google Maps API key, then try again.')
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, PLACE_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [inputValue, mapsStatus, selectedSuggestion])

  async function handleSelect(suggestion: PlaceSuggestion | null) {
    setSelectedSuggestion(suggestion)
    onPlaceSelected(null)
    if (!suggestion) return

    setIsLoadingDetails(true)
    setErrorMessage(null)
    try {
      onPlaceSelected(await getPlaceDetails(suggestion))
    } catch (error) {
      console.error('Google Maps place details failed', error)
      setErrorMessage('Could not load the details for that place. Please try again or pick another result.')
    } finally {
      setIsLoadingDetails(false)
      // Fetching details ends Google's billing session, so start a fresh one.
      createSearchSession()
        .then((token) => (sessionToken.current = token))
        .catch(() => setMapsStatus('load-failed'))
    }
  }

  if (mapsStatus === 'not-configured') {
    return (
      <Alert severity="warning">
        Google Maps is not set up yet. Copy <code>.env.example</code> to <code>.env</code>, add your key as{' '}
        <code>VITE_GOOGLE_MAPS_API_KEY</code>, then restart <code>npm run dev</code>. See the README for details.
      </Alert>
    )
  }

  if (mapsStatus === 'load-failed') {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => setMapsStatus('loading')}>
            Retry
          </Button>
        }
      >
        Google Maps could not be loaded. Check your internet connection, and that your API key is valid and allowed to
        use the Maps JavaScript API and Places API (New).
      </Alert>
    )
  }

  const queryTooShort = inputValue.trim().length < PLACE_SEARCH_MIN_CHARACTERS

  return (
    <Box>
      <Autocomplete
        options={queryTooShort ? [] : suggestions}
        value={selectedSuggestion}
        onChange={(_event, suggestion) => void handleSelect(suggestion)}
        inputValue={inputValue}
        onInputChange={(_event, value, reason) => {
          setInputValue(value)
          // Typing a new search clears the old choice so a stale gym can't be saved.
          if (reason === 'input' && selectedSuggestion) {
            setSelectedSuggestion(null)
            onPlaceSelected(null)
          }
        }}
        // Google already filters results; don't let MUI hide any of them.
        filterOptions={(options) => options}
        getOptionLabel={(option) => option.primaryText}
        isOptionEqualToValue={(option, value) => option.placeId === value.placeId}
        loading={mapsStatus === 'loading' || isSearching}
        loadingText={mapsStatus === 'loading' ? 'Loading Google Maps…' : 'Searching…'}
        noOptionsText={
          queryTooShort
            ? `Type at least ${PLACE_SEARCH_MIN_CHARACTERS} characters`
            : 'No places found. Try a different name or address.'
        }
        disabled={isLoadingDetails}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props
          return (
            <li key={key} {...optionProps}>
              <Box>
                <Typography variant="body1">{option.primaryText}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {option.secondaryText}
                </Typography>
              </Box>
            </li>
          )
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Gym name, address or landmark"
            helperText={isLoadingDetails ? 'Loading place details…' : ' '}
          />
        )}
      />
      {errorMessage && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {errorMessage}
        </Alert>
      )}
    </Box>
  )
}
