import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { GymSummary } from '../../components/GymSummary'
import { Loader } from '../../components/Loader'
import { ScreenLayout } from '../../components/ScreenLayout'
import { PRIMARY_GYM_LABEL } from '../../config/constants'
import type { PlaceSearchMode, SaveResult, SelectedPlace } from '../../types'
import { GymSearch } from './GymSearch'

interface GymSetupScreenProps {
  /** Saves the gym. Resolves to `{ ok: false, message }` when it could not be saved. */
  onSave: (place: SelectedPlace) => Promise<SaveResult>
  /** Present only when the user already has a gym and is changing it. */
  onCancel?: () => void
  /** Which places the search may offer. Defaults to fitness places only. */
  searchMode?: PlaceSearchMode
}

export function GymSetupScreen({ onSave, onCancel, searchMode }: GymSetupScreenProps) {
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    if (!selectedPlace || isSaving) return // ignore a second press while saving
    setSaveError(null)
    setIsSaving(true)
    const result = await onSave(selectedPlace)
    setIsSaving(false)
    // On success the app moves on by itself; on failure stay here, keep the choice, and show why.
    if (!result.ok) setSaveError(result.message)
  }

  return (
    <ScreenLayout>
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography variant="h1" component="h1">
            Where do you work out?
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Search for your gym and save its location to start showing up.
          </Typography>
        </Stack>

        <GymSearch
          onPlaceSelected={(place) => {
            setSelectedPlace(place)
            setSaveError(null)
          }}
          searchMode={searchMode}
        />

        {selectedPlace && (
          <GymSummary
            label={`Selected as ${PRIMARY_GYM_LABEL}`}
            name={selectedPlace.name}
            address={selectedPlace.formattedAddress}
          />
        )}

        {saveError && (
          <Alert severity="error" role="alert">
            {saveError}
          </Alert>
        )}

        <Stack spacing={2}>
          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={!selectedPlace || isSaving}
            aria-busy={isSaving}
            onClick={() => void handleSave()}
            startIcon={isSaving ? <Loader color="currentColor" /> : undefined}
          >
            {isSaving ? 'Saving…' : saveError ? 'Try again' : `Save as ${PRIMARY_GYM_LABEL}`}
          </Button>
          {onCancel && (
            <Button variant="text" color="inherit" fullWidth onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
          )}
        </Stack>
      </Stack>
    </ScreenLayout>
  )
}
