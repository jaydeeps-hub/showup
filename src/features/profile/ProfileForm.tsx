import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Loader } from '../../components/Loader'
import { PROFILE_NAME_MAX_LENGTH } from '../../config/constants'
import type { ProfileEdits, SaveResult } from '../../types'
import {
  latestBirthDate,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormValues,
} from '../../utils/profileValidation'

interface ProfileFormProps {
  initialValues: ProfileFormValues
  /** Label for the submit button, e.g. "Continue" or "Save changes". */
  submitLabel: string
  /** Saves the edits. Resolves to `{ ok: false, message }` when saving failed. */
  onSave: (edits: ProfileEdits) => Promise<SaveResult>
  /** Called after a successful save. */
  onSaved?: () => void
  /** When set, a Cancel button is shown. */
  onCancel?: () => void
  /** Short text under the birthday field explaining why we ask. */
  birthdayHelp: string
  /** Optional extra content between the fields and the buttons (e.g. a read-only email). */
  children?: ReactNode
}

/**
 * Name + birthday form shared by onboarding and Manage Profile.
 *
 * Everything the user types lives in this component's own state, and a failed save never
 * clears it, so a network error or database error does not lose their changes. They can
 * simply press the button again to retry.
 */
export function ProfileForm(props: ProfileFormProps) {
  const { initialValues, submitLabel, onSave, onSaved, onCancel, birthdayHelp, children } = props
  const [values, setValues] = useState<ProfileFormValues>(initialValues)
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  // The latest selectable birth date (exactly 15 years before today), fixed when the form opens.
  const [latestBirthday] = useState(() => latestBirthDate(new Date()))

  function setField(field: keyof ProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    // Clear the old complaint about this field as soon as the user edits it.
    setErrors((current) => ({ ...current, [field]: undefined }))
    setJustSaved(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return // ignore a second press while the first save is in flight

    setSaveError(null)
    setJustSaved(false)
    const validation = validateProfileForm(values)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    setIsSaving(true)
    const result = await onSave(validation.edits)
    setIsSaving(false)

    if (result.ok) {
      setJustSaved(true)
      onSaved?.()
    } else {
      setSaveError(result.message) // the typed values stay exactly as they were
    }
  }

  return (
    <Stack component="form" onSubmit={(event) => void handleSubmit(event)} noValidate spacing={6}>
      <Stack spacing={2}>
        <TextField
          label="First name"
          value={values.firstName}
          onChange={(event) => setField('firstName', event.target.value)}
          error={Boolean(errors.firstName)}
          helperText={errors.firstName ?? ' '}
          autoComplete="given-name"
          disabled={isSaving}
          fullWidth
          required
          slotProps={{ htmlInput: { maxLength: PROFILE_NAME_MAX_LENGTH + 20 } }}
        />
        <TextField
          label="Last name"
          value={values.lastName}
          onChange={(event) => setField('lastName', event.target.value)}
          error={Boolean(errors.lastName)}
          helperText={errors.lastName ?? ' '}
          autoComplete="family-name"
          disabled={isSaving}
          fullWidth
          required
          slotProps={{ htmlInput: { maxLength: PROFILE_NAME_MAX_LENGTH + 20 } }}
        />
        <TextField
          label="Date of birth (optional)"
          type="date"
          value={values.dateOfBirth}
          onChange={(event) => setField('dateOfBirth', event.target.value)}
          error={Boolean(errors.dateOfBirth)}
          helperText={errors.dateOfBirth ?? birthdayHelp}
          autoComplete="bday"
          disabled={isSaving}
          fullWidth
          // Always keep the label above the field: a date input shows "dd/mm/yyyy" even when empty.
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: latestBirthday } }}
        />
      </Stack>

      {children}

      {saveError && (
        <Alert severity="error" role="alert">
          {saveError}
        </Alert>
      )}
      {justSaved && !onSaved && (
        <Alert severity="success" role="status">
          Your changes have been saved.
        </Alert>
      )}

      <Stack spacing={2}>
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={isSaving}
          aria-busy={isSaving}
          startIcon={isSaving ? <Loader color="currentColor" /> : undefined}
        >
          {isSaving ? 'Saving…' : saveError ? 'Try again' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="text" color="inherit" fullWidth onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
