import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { GymSummary } from '../../components/GymSummary'
import { ScreenLayout } from '../../components/ScreenLayout'
import { PRIMARY_GYM_LABEL } from '../../config/constants'
import type { PlaceSearchMode, SelectedPlace } from '../../types'
import { GymSearch } from './GymSearch'

interface GymSetupScreenProps {
  onSave: (place: SelectedPlace) => void
  /** Present only when the user already has a gym and is changing it. */
  onCancel?: () => void
  /** Which places the search may offer. Defaults to fitness places only. */
  searchMode?: PlaceSearchMode
}

export function GymSetupScreen({ onSave, onCancel, searchMode }: GymSetupScreenProps) {
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)

  return (
    <ScreenLayout>
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography variant="h1" component="h1">
            Where do you work out?
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Search for your gym and save its location to start showing up.
          </Typography>
        </Stack>

        <GymSearch onPlaceSelected={setSelectedPlace} searchMode={searchMode} />

        {selectedPlace && (
          <GymSummary
            label={`Selected as ${PRIMARY_GYM_LABEL}`}
            name={selectedPlace.name}
            address={selectedPlace.formattedAddress}
          />
        )}

        <Stack spacing={2}>
          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={!selectedPlace}
            onClick={() => selectedPlace && onSave(selectedPlace)}
          >
            Save as {PRIMARY_GYM_LABEL}
          </Button>
          {onCancel && (
            <Button variant="text" color="inherit" fullWidth onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      </Stack>
    </ScreenLayout>
  )
}
