import Alert from '@mui/material/Alert'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import { useState } from 'react'
import type { PlaceSearchMode, SaveResult } from '../../types'

interface PlaceSearchModeSettingProps {
  /** The mode currently saved in the database. */
  mode: PlaceSearchMode
  onChange: (mode: PlaceSearchMode) => Promise<SaveResult>
}

/**
 * Administrator-only choice between "Fitness places only" and "Any place" for the gym search.
 * The change is saved to Supabase straight away. The screen shows the new value only after the
 * database has confirmed it, and shows an error (keeping the old value) if it has not.
 */
export function PlaceSearchModeSetting({ mode, onChange }: PlaceSearchModeSettingProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(next: PlaceSearchMode) {
    if (isSaving || next === mode) return
    setError(null)
    setIsSaving(true)
    const result = await onChange(next)
    setIsSaving(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <FormControl component="fieldset" disabled={isSaving} fullWidth>
      <FormLabel component="legend" sx={{ color: 'text.primary', fontWeight: 600, mb: 1 }}>
        Gym search (administrator)
      </FormLabel>
      <RadioGroup
        value={mode}
        onChange={(event) => void handleChange(event.target.value as PlaceSearchMode)}
        aria-label="Which places the gym search offers"
      >
        <FormControlLabel value="fitness_only" control={<Radio />} label="Fitness places only" />
        <FormControlLabel value="any_place" control={<Radio />} label="Any place" />
      </RadioGroup>
      <FormHelperText>
        {isSaving ? 'Saving…' : 'Applies when you choose or change your gym. Other users always see fitness places only.'}
      </FormHelperText>
      {error && (
        <Alert severity="error" role="alert" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </FormControl>
  )
}
