import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { GymSummary } from '../../components/GymSummary'
import { ScreenLayout } from '../../components/ScreenLayout'
import { PRIMARY_GYM_LABEL } from '../../config/constants'
import type { SelectedPlace } from '../../types'
import { GymSearch } from './GymSearch'

interface GymSetupScreenProps {
  onSave: (place: SelectedPlace) => void
  /** Present only when the user already has a gym and is changing it. */
  onCancel?: () => void
}

export function GymSetupScreen({ onSave, onCancel }: GymSetupScreenProps) {
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)

  return (
    <ScreenLayout>
      <Stack spacing={3}>
        <div>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
            Where do you work out?
          </Typography>
          <Typography color="text.secondary">Search for your gym and save its location to start showing up.</Typography>
        </div>

        <GymSearch onPlaceSelected={setSelectedPlace} />

        {selectedPlace && (
          <GymSummary
            label={`Selected as ${PRIMARY_GYM_LABEL}`}
            name={selectedPlace.name}
            address={selectedPlace.formattedAddress}
          />
        )}

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
          <Button variant="text" fullWidth onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Stack>
    </ScreenLayout>
  )
}
