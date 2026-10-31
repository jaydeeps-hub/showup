import CheckRounded from '@mui/icons-material/CheckRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useEffect, useRef, useState } from 'react'
import { Loader } from '../../components/Loader'
import { NearMeToggle } from '../../components/NearMeToggle'
import { NEAR_ME_SEARCH_DEBOUNCE_MS, PLACE_SEARCH_DEBOUNCE_MS, PLACE_SEARCH_MIN_CHARACTERS } from '../../config/constants'
import { tokens } from '../../design-system/tokens'
import { useNearMe } from '../../hooks/useNearMe'
import { typedSearchCache, useNearbyGyms } from '../../hooks/useNearMeSearch'
import { getCachedAppConfig } from '../../services/appConfig'
import {
  createSearchSession,
  getPlaceDetails,
  isMapsConfigured,
  searchPlaces,
  type PlaceSuggestion,
} from '../../services/mapsService'
import { isPlaceAllowed } from '../../services/gymValidation'
import type { PlaceSearchMode, SelectedPlace } from '../../types'
import { formatDistance } from '../../utils/distance'
import { truncateText } from '../../utils/truncateText'

type MapsStatus = 'not-configured' | 'loading' | 'ready' | 'load-failed'

interface GymSearchProps {
  /** Called with full place details once the user picks a result. */
  onPlaceSelected: (place: SelectedPlace | null) => void
  /**
   * Which places may be chosen. Defaults to the restrictive `fitness_only`, so forgetting to pass
   * it can never widen the search.
   */
  searchMode?: PlaceSearchMode
}

/** The words of the states the list can be in (the design's loading, error and empty messages). */
const LOADING_TEXT = 'Finding gyms…'
const ERROR_TITLE = 'Couldn’t load gyms'
const ERROR_BODY = 'Check your connection and try again.'
const EMPTY_BODY = 'Check the spelling, or try the gym’s area instead.'

/**
 * The gym search of the Add gym screen: the design's search box (a search icon, a clear ✕ when there is text), the
 * "Gyms near me" toggle, and the results as a radiogroup of rows with a check on the chosen one. The list also
 * shows the design's loading, error and "no results" states.
 *
 * The search itself is unchanged: Google Places autocomplete after a short pause and a minimum number of characters,
 * one billing session per search, the near-me search and bias, and the check that the chosen place may be saved under
 * the person's search mode.
 */
export function GymSearch({ onPlaceSelected, searchMode = 'fitness_only' }: GymSearchProps) {
  const [mapsStatus, setMapsStatus] = useState<MapsStatus>(isMapsConfigured() ? 'loading' : 'not-configured')
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  // Bumped by Retry so the same search runs again.
  const [retryCount, setRetryCount] = useState(0)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  // The result the person last picked, while its details are on the way. If they change the text first, this is
  // cleared, and the details are then ignored.
  const pendingPick = useRef<string | null>(null)
  // "Gyms near me": the toggle, and (in memory only) where the device is.
  const nearMe = useNearMe()
  const nearbyGyms = useNearbyGyms(nearMe.position, nearMe.on && inputValue.trim() === '')

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

  // Ask Google for results shortly after the user stops typing.
  useEffect(() => {
    const query = inputValue.trim()
    if (mapsStatus !== 'ready' || query.length < PLACE_SEARCH_MIN_CHARACTERS) return

    let cancelled = false
    const position = nearMe.on ? nearMe.position : null
    const timer = setTimeout(async () => {
      const token = sessionToken.current
      if (!token) return
      // The same words at about the same place, within five minutes, are not asked of Google again.
      const cached = position ? typedSearchCache.get(query, position) : undefined
      if (cached) {
        setSuggestions(cached)
        setSearchFailed(false)
        setIsSearching(false) // an earlier, now-cancelled search may have left this on
        return
      }
      setIsSearching(true)
      setSearchFailed(false)
      try {
        const results = position
          ? await searchPlaces(query, token, position, getCachedAppConfig().gymSearchRadiusMeters)
          : await searchPlaces(query, token)
        if (position) typedSearchCache.set(query, position, results)
        if (!cancelled) setSuggestions(results)
      } catch (error) {
        console.error('Google Maps search failed', error)
        if (!cancelled) {
          setSuggestions([])
          setSearchFailed(true)
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, nearMe.on ? NEAR_ME_SEARCH_DEBOUNCE_MS : PLACE_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [inputValue, mapsStatus, nearMe.on, nearMe.position, retryCount])

  /** The choice no longer matches what the list shows, so it is dropped (a stale gym can't be saved). */
  function dropSelection() {
    // A details request that is still on its way must not bring the choice back once it lands.
    pendingPick.current = null
    if (selectedId !== null) setSelectedId(null)
    onPlaceSelected(null)
  }

  /** What is typed changed. */
  function handleInput(value: string) {
    setInputValue(value)
    setErrorMessage(null)
    dropSelection()
    // The old rows belong to the old text, and a failure belongs to the old search: show "Finding gyms…" until the new
    // text has been answered (the pause before asking counts as waiting).
    setSuggestions([])
    setSearchFailed(false)
    setIsSearching(value.trim().length >= PLACE_SEARCH_MIN_CHARACTERS)
  }

  /** The toggle or the position changed, so the rows are about to be different ones. */
  function handleNearMeToggle(wantOn: boolean) {
    dropSelection()
    nearMe.toggle(wantOn)
  }

  async function handleSelect(suggestion: PlaceSuggestion) {
    if (isLoadingDetails) return
    setSelectedId(suggestion.placeId)
    onPlaceSelected(null)
    pendingPick.current = suggestion.placeId

    setIsLoadingDetails(true)
    setErrorMessage(null)
    try {
      const { place, types } = await getPlaceDetails(suggestion)
      // The person changed the text, the toggle or the choice while this was loading: this answer is stale.
      if (pendingPick.current !== suggestion.placeId) return
      if (isPlaceAllowed(types, searchMode)) {
        onPlaceSelected(place)
      } else {
        setSelectedId(null)
        setErrorMessage(
          `Not a gym. "${place.name}" isn't listed on Google Maps as a gym, fitness centre or sports facility. Please select another place.`,
        )
      }
    } catch (error) {
      console.error('Google Maps place details failed', error)
      if (pendingPick.current === suggestion.placeId) {
        setSelectedId(null)
        setErrorMessage('Could not load the details for that place. Please try again or pick another result.')
      }
    } finally {
      setIsLoadingDetails(false)
      // Fetching details ends Google's billing session, so start a fresh one. A nearby result had no details
      // request (and no session), so the current token is still good.
      if (!suggestion.nearby) {
        // The suggestions kept for next time belong to the session that just ended; do not offer them again.
        typedSearchCache.clear()
        createSearchSession()
          .then((token) => (sessionToken.current = token))
          .catch(() => setMapsStatus('load-failed'))
      }
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

  const query = inputValue.trim()
  const queryTooShort = query.length < PLACE_SEARCH_MIN_CHARACTERS
  // With the toggle on and nothing typed, the list is the gyms around the device. Typing switches to the usual search.
  const showingNearby = nearMe.on && nearMe.position !== null && query === ''
  const showDistances = nearMe.on && nearMe.position !== null
  const rows = showingNearby ? nearbyGyms.results : queryTooShort ? [] : suggestions

  // Which of the design's states the list is in.
  const loading = mapsStatus === 'loading' || (showingNearby ? nearbyGyms.loading : !queryTooShort && isSearching)
  const failed = showingNearby ? nearbyGyms.failed : !queryTooShort && searchFailed
  const prompt = !showingNearby && queryTooShort // nothing to look for yet

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <SearchBox
        value={inputValue}
        onChange={handleInput}
        disabled={isLoadingDetails}
        onClear={() => handleInput('')}
      />

      <NearMeToggle on={nearMe.on} status={nearMe.status} onChange={handleNearMeToggle} disabled={isLoadingDetails} />

      {/* The part that scrolls. The heading, the messages and the Retry button are not radios, so they sit outside the group. */}
      <Box aria-busy={loading} sx={{ mt: '16px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', pb: '8px' }}>
        {loading ? (
          <LoadingState />
        ) : failed ? (
          <MessageState title={ERROR_TITLE} body={ERROR_BODY} action={{ label: 'Retry', onClick: showingNearby ? nearbyGyms.retry : () => setRetryCount((n) => n + 1) }} />
        ) : prompt ? (
          <Box sx={{ color: tokens.color.textSecondary, fontSize: 14, textAlign: 'center', mt: 4 }}>
            Type at least {PLACE_SEARCH_MIN_CHARACTERS} characters to search
          </Box>
        ) : rows.length === 0 ? (
          <MessageState
            title={showingNearby ? 'No gyms found near you' : `No gyms found for “${truncateText(query.replace(/[<>]/g, ''))}”`}
            body={showingNearby ? 'Try searching by name or area.' : EMPTY_BODY}
          />
        ) : (
          <>
            <Box sx={{ fontSize: 13, color: tokens.color.textSecondary, mt: '16px' }}>{showDistances ? 'Near you, closest first' : 'Results'}</Box>
            <Box role="radiogroup" aria-label="Gym results" sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rows.map((row) => (
                <ResultRow
                  key={row.placeId}
                  suggestion={row}
                  selected={row.placeId === selectedId}
                  showDistance={showDistances}
                  disabled={isLoadingDetails}
                  onSelect={() => void handleSelect(row)}
                />
              ))}
            </Box>
          </>
        )}
      </Box>

      {isLoadingDetails && (
        <Box sx={{ mt: 2, flex: 'none' }}>
          <LoadingLine text="Loading place details…" size={14} />
        </Box>
      )}
      {errorMessage && (
        <Alert severity="error" sx={{ mt: 2, flex: 'none' }}>
          {errorMessage}
        </Alert>
      )}
    </Box>
  )
}

/** The search box: an icon on the left and, once something is typed, a ✕ on the right that clears it. */
function SearchBox({ value, onChange, onClear, disabled }: { value: string; onChange: (value: string) => void; onClear: () => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Box sx={{ position: 'relative', flex: 'none' }}>
      <SearchRounded aria-hidden sx={{ position: 'absolute', left: 16, top: 17, fontSize: 20, color: tokens.color.textSecondary, pointerEvents: 'none' }} />
      <Box
        component="input"
        ref={inputRef}
        type="search"
        role="searchbox"
        aria-label="Search gyms"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search by gym name or area"
        value={value}
        disabled={disabled}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        sx={{
          width: '100%',
          height: tokens.size.control,
          boxSizing: 'border-box',
          borderRadius: `${tokens.radius.control}px`,
          backgroundColor: tokens.color.surface1,
          border: `1.5px solid ${tokens.color.border}`,
          color: tokens.color.textPrimary,
          font: `400 16px ${tokens.font.body}`,
          pl: '46px',
          pr: '46px',
          transition: 'border-color 0.15s',
          '&::placeholder': { color: tokens.color.textSubtle, opacity: 1 },
          // The browser's own clear button would sit on top of ours.
          '&::-webkit-search-cancel-button': { display: 'none' },
          '&:focus': { outline: 'none', borderColor: tokens.color.accentPrimary, boxShadow: '0 0 0 3px rgba(43, 80, 217, 0.28)' },
          '&:disabled': { backgroundColor: tokens.color.surface2 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      />
      {value !== '' && (
        <Box
          component="button"
          type="button"
          disabled={disabled}
          aria-label="Clear search"
          onClick={() => {
            onClear()
            inputRef.current?.focus()
          }}
          sx={{
            position: 'absolute',
            right: 6,
            top: 5,
            width: 44,
            height: 44,
            border: 0,
            background: 'none',
            color: tokens.color.textSecondary,
            fontSize: 18,
            cursor: 'pointer',
            borderRadius: `${tokens.radius.small}px`,
            '&:focus-visible': { outline: `2px solid ${tokens.color.focusRing}` },
          }}
        >
          ✕
        </Box>
      )}
    </Box>
  )
}

/** One result: the name and address, the distance when sorted by distance, and a check on the chosen one. */
function ResultRow({
  suggestion,
  selected,
  showDistance,
  disabled,
  onSelect,
}: {
  suggestion: PlaceSuggestion
  selected: boolean
  showDistance: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <Box
      component="button"
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        width: '100%',
        minHeight: 64,
        p: '10px 14px',
        borderRadius: `${tokens.radius.control}px`,
        backgroundColor: selected ? tokens.color.accentTint : tokens.color.surface1,
        border: `1.5px solid ${selected ? tokens.color.accentPrimary : 'transparent'}`,
        color: tokens.color.textPrimary,
        textAlign: 'left',
        font: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        '&:hover': { backgroundColor: selected ? tokens.color.accentTint : tokens.color.surface2 },
        '&:focus-visible': { outline: `2px solid ${tokens.color.focusRing}`, outlineOffset: 2 },
      }}
    >
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Box component="span" sx={{ display: 'block', fontWeight: 600, fontSize: 16 }}>
          {suggestion.primaryText}
        </Box>
        <Box component="span" sx={{ display: 'block', fontSize: 13, color: tokens.color.textSecondary }}>
          {suggestion.secondaryText}
        </Box>
      </Box>
      {showDistance && suggestion.distanceMeters !== undefined && (
        <Box component="span" sx={{ flex: 'none', fontSize: 13, color: tokens.color.textSecondary }}>
          {formatDistance(suggestion.distanceMeters)}
        </Box>
      )}
      {/* A tick as well as the blue tint, so the choice is not shown by colour alone. */}
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 24,
          height: 24,
          flex: 'none',
          borderRadius: '50%',
          border: `1.5px solid ${selected ? tokens.color.accentPrimary : '#3A3F4B'}`,
          backgroundColor: selected ? tokens.color.accentPrimary : 'transparent',
          color: tokens.color.onAccent,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {selected && <CheckRounded sx={{ fontSize: 15 }} />}
      </Box>
    </Box>
  )
}

/** The shared loader followed by a short status text. */
function LoadingLine({ text, size = 16 }: { text: string; size?: number }) {
  return (
    <Box component="span" role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, color: tokens.color.textSecondary, fontSize: 14 }}>
      <Loader size={size} />
      {text}
    </Box>
  )
}

/** "Finding gyms…" and three placeholder rows where the results will be. */
function LoadingState() {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'center', py: '10px' }}>
        <LoadingLine text={LOADING_TEXT} />
      </Box>
      {[0, 1, 2].map((index) => (
        <Box
          key={index}
          data-testid="gym-skeleton"
          aria-hidden
          sx={{
            height: 64,
            flex: 'none',
            borderRadius: `${tokens.radius.control}px`,
            background: `linear-gradient(90deg, ${tokens.color.surface1}, ${tokens.color.surface2}, ${tokens.color.surface1})`,
            backgroundSize: '200% 100%',
            animation: 'gym-shimmer 1.2s linear infinite',
            '@keyframes gym-shimmer': { to: { backgroundPosition: '-200% 0' } },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
      ))}
    </>
  )
}

/** A centred title and line of help, optionally with a button (the design's `.msg`). */
function MessageState({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <Box sx={{ m: 'auto 0', textAlign: 'center', px: '12px' }}>
      <Box component="b" sx={{ display: 'block', font: `700 18px ${tokens.font.display}`, mb: '6px' }}>
        {title}
      </Box>
      <Box component="p" sx={{ color: tokens.color.textSecondary, fontSize: 14, m: 0 }}>
        {body}
      </Box>
      {action && (
        <Button
          variant="contained"
          color="inherit"
          onClick={action.onClick}
          sx={{ mt: '8px', minHeight: 46, px: '22px', backgroundColor: tokens.color.surface2, color: tokens.color.textPrimary, '&:hover': { backgroundColor: tokens.color.surface2 } }}
        >
          {action.label}
        </Button>
      )}
    </Box>
  )
}
