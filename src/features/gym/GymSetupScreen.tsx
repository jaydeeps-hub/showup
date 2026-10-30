import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { Loader } from '../../components/Loader'
import { OnboardingStepHeader } from '../../components/OnboardingStepHeader'
import type { PlaceSearchMode, SaveResult, SelectedPlace } from '../../types'
import { GymSearch } from './GymSearch'
import { GymScreenBack } from './GymScreenBack'

/** How long "<gym> saved" is shown before the app moves on, in milliseconds (the design waits 700 ms). */
export const GYM_SAVED_PAUSE_MS = 700

interface GymSetupScreenProps {
  /** Saves the gym. Resolves to `{ ok: false, message }` when it could not be saved. */
  onSave: (place: SelectedPlace) => Promise<SaveResult>
  /** Called as soon as the gym is saved, with its name, so the app can show "<name> saved" (it outlives this screen). */
  onSaved: (gymName: string) => void
  /**
   * Called a moment after the gym is saved, to move on: to the next step, or back to Profile. The screen stays until
   * this is called.
   */
  onDone: () => void
  /** The back arrow. In first-time setup there is no earlier step to go back to, so this is left out and no arrow shows. */
  onBack?: () => void
  /**
   * True when this is the gym step of onboarding (a progress bar and "2 of 3"), false when it was opened from Profile
   * to change the gym (just a back arrow, no progress bar).
   */
  isOnboarding: boolean
  /** Which places the search may offer. Defaults to fitness places only. */
  searchMode?: PlaceSearchMode
}

/**
 * "Where do you work out?" The gym screen. It has two uses: step 2 of 3 of onboarding (a back arrow, a 66% progress
 * bar and "2 of 3") and "Change gym" from Profile (a back arrow back to Profile, no progress bar). Both have no tab
 * bar and no mascot.
 *
 * The search and the Save logic are unchanged. After a successful save it shows "<name> saved" and then calls
 * `onDone`.
 */
export function GymSetupScreen({ onSave, onSaved, onDone, onBack, isOnboarding, searchMode }: GymSetupScreenProps) {
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // So a screen that goes away before the pause ends does not call onDone afterwards.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function handleSave() {
    if (!selectedPlace || isSaving || saved) return // ignore a second press while saving
    setSaveError(null)
    setIsSaving(true)
    const result = await onSave(selectedPlace)
    setIsSaving(false)
    // On failure stay here, keep the choice, and show why.
    if (!result.ok) {
      setSaveError(result.message)
      return
    }
    setSaved(true)
    onSaved(selectedPlace.name)
    timer.current = setTimeout(onDone, GYM_SAVED_PAUSE_MS)
  }

  return (
    <Container
      component="main"
      maxWidth="sm"
      // As tall as the screen, with the results as the one part that scrolls, so Save gym is always within reach.
      sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', px: 6, pt: '56px', pb: '28px', overflow: 'hidden' }}
    >
      {isOnboarding ? (
        // Step 2 of 3. The details are already saved and there is no screen to go back to, so no arrow here.
        <OnboardingStepHeader step={2} onBack={onBack} />
      ) : (
        <GymScreenBack onBack={onBack ?? onDone} disabled={isSaving || saved} />
      )}

      <Typography variant="h1" component="h1" sx={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.01em', m: '0 0 8px', flex: 'none' }}>
        Where do you work out?
      </Typography>

      <GymSearch onPlaceSelected={(place) => {
        setSelectedPlace(place)
        setSaveError(null)
      }} searchMode={searchMode} />

      {saveError && (
        <Alert severity="error" role="alert" sx={{ mt: 3 }}>
          {saveError}
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        disabled={!selectedPlace || isSaving || saved}
        aria-busy={isSaving}
        onClick={() => void handleSave()}
        startIcon={isSaving ? <Loader color="currentColor" /> : undefined}
        sx={{ mt: 4, minHeight: 54 }}
      >
        {isSaving ? 'Saving…' : saveError ? 'Try again' : 'Save gym'}
      </Button>
    </Container>
  )
}
