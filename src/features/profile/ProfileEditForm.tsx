import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { PROFILE_NAME_MAX_LENGTH } from '../../config/constants'
import type { ProfileEdits, SaveResult } from '../../types'
import {
  latestBirthDate,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormValues,
} from '../../utils/profileValidation'
import { ProfileActionBar } from './ProfileActionBar'

interface FieldProps {
  id: string
  label: string
  /** Small muted text beside the label, for example "Optional". */
  hint?: string
  error?: string
  children: ReactNode
}

/** A label above its input, with the error (if any) under the input. */
function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <Box>
      <Box
        component="label"
        htmlFor={id}
        sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, fontSize: 14, fontWeight: 500 }}
      >
        {label}
        {hint && (
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
            {hint}
          </Box>
        )}
      </Box>
      {children}
      {error && (
        <Typography id={`${id}-error`} role="alert" sx={{ mt: 1.5, fontSize: 13, color: 'error.main' }}>
          {error}
        </Typography>
      )}
    </Box>
  )
}

interface ProfileEditFormProps {
  initialValues: ProfileFormValues
  /** Saves the edits. Resolves to `{ ok: false, message }` when saving failed. */
  onSave: (edits: ProfileEdits) => Promise<SaveResult>
  /** Called after a successful save. */
  onSaved: () => void
  /** Cancel: leave without saving. Everything typed is thrown away. */
  onCancel: () => void
  /** The rest of the form under the three fields (the gym and the weekly goal). */
  children?: ReactNode
}

/**
 * The Profile page's edit view: first name, last name and date of birth, then whatever the screen
 * passes in, then the Cancel / Save bar pinned above the tab bar.
 *
 * Everything the user types lives in this component's own state, and a failed save never clears it,
 * so they can press Save changes again to retry. Names are checked when Save is pressed.
 */
export function ProfileEditForm({ initialValues, onSave, onSaved, onCancel, children }: ProfileEditFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(initialValues)
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The latest selectable birth date (exactly 15 years before today), fixed when the form opens.
  const [latestBirthday] = useState(() => latestBirthDate(new Date()))
  const firstNameInput = useRef<HTMLInputElement>(null)

  // The pencil that opened this view is gone, so put the cursor in the first field.
  useEffect(() => {
    firstNameInput.current?.focus()
  }, [])

  function setField(field: keyof ProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    // Clear the old complaint about this field as soon as the user edits it.
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return // ignore a second press while the first save is in flight

    setSaveError(null)
    const validation = validateProfileForm(values)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    setIsSaving(true)
    const result = await onSave(validation.edits)
    setIsSaving(false)

    if (result.ok) onSaved()
    else setSaveError(result.message) // the typed values stay exactly as they were
  }

  const describedBy = (field: keyof ProfileFormValues, id: string) => (errors[field] ? `${id}-error` : undefined)

  return (
    <Stack component="form" onSubmit={(event) => void handleSubmit(event)} noValidate spacing={5}>
      <Field id="profile-first-name" label="First name" error={errors.firstName}>
        <TextField
          id="profile-first-name"
          value={values.firstName}
          onChange={(event) => setField('firstName', event.target.value)}
          error={Boolean(errors.firstName)}
          autoComplete="given-name"
          disabled={isSaving}
          fullWidth
          inputRef={firstNameInput}
          slotProps={{
            htmlInput: {
              maxLength: PROFILE_NAME_MAX_LENGTH + 20,
              'aria-describedby': describedBy('firstName', 'profile-first-name'),
            },
          }}
        />
      </Field>

      <Field id="profile-last-name" label="Last name" error={errors.lastName}>
        <TextField
          id="profile-last-name"
          value={values.lastName}
          onChange={(event) => setField('lastName', event.target.value)}
          error={Boolean(errors.lastName)}
          autoComplete="family-name"
          disabled={isSaving}
          fullWidth
          slotProps={{
            htmlInput: {
              maxLength: PROFILE_NAME_MAX_LENGTH + 20,
              'aria-describedby': describedBy('lastName', 'profile-last-name'),
            },
          }}
        />
      </Field>

      <Field id="profile-birthday" label="Date of birth" hint="Optional" error={errors.dateOfBirth}>
        <TextField
          id="profile-birthday"
          type="date"
          value={values.dateOfBirth}
          onChange={(event) => setField('dateOfBirth', event.target.value)}
          error={Boolean(errors.dateOfBirth)}
          autoComplete="bday"
          disabled={isSaving}
          fullWidth
          slotProps={{
            htmlInput: { max: latestBirthday, 'aria-describedby': describedBy('dateOfBirth', 'profile-birthday') },
          }}
        />
      </Field>

      {children}

      {saveError && (
        <Alert severity="error" role="alert">
          {saveError}
        </Alert>
      )}

      <ProfileActionBar isSaving={isSaving} onCancel={onCancel} />
    </Stack>
  )
}
