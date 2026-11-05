import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { UsernameField } from '../../components/UsernameField'
import { NAME_BACKSTOP_FACTOR, PROFILE_NAME_MAX_LENGTH } from '../../config/constants'
import { useUsernameCheck } from '../../hooks/useUsernameCheck'
import { saveUsername } from '../../services/usernameService'
import type { ProfileEdits, SaveResult } from '../../types'
import {
  latestBirthDate,
  limitNameInput,
  nameCharactersError,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormValues,
} from '../../utils/profileValidation'
import { usernameCannotBeRemovedMessage, usernameSaveStep } from '../../utils/username'
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
  /** The person's current username, or null (everyone from before Phase 11 has none). */
  username: string | null
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
 * The Profile page's edit view: username, first name, last name and date of birth, then whatever the screen
 * passes in, then the Cancel / Save bar pinned above the tab bar.
 *
 * Everything the user types lives in this component's own state, and a failed save never clears it,
 * so they can press Save changes again to retry. Names are checked when Save is pressed.
 */
export function ProfileEditForm({ initialValues, username: ownUsername, onSave, onSaved, onCancel, children }: ProfileEditFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(initialValues)
  // Starts with their current username (accepted at once, "This is your username"), or empty with the default hint.
  const [username, setUsername] = useState(ownUsername ?? '')
  // What set_username said on Save, shown in place of the live hint until the username is edited.
  const [usernameSaveError, setUsernameSaveError] = useState<string | null>(null)
  const usernameCheck = useUsernameCheck(username, ownUsername)
  const usernameInput = useRef<HTMLInputElement>(null)
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
    // A name field never holds more than PROFILE_NAME_MAX_LENGTH characters, typed or pasted.
    const isName = field === 'firstName' || field === 'lastName'
    const next = isName ? limitNameInput(value, values[field]) : value
    setValues((current) => ({ ...current, [field]: next }))
    // Clear the old complaint about this field as soon as the user edits it. A character that is not allowed in a name
    // is flagged straight away, while typing.
    setErrors((current) => ({ ...current, [field]: isName ? nameCharactersError(next) ?? undefined : undefined }))
  }

  function setUsernameField(cleaned: string) {
    setUsername(cleaned)
    setUsernameSaveError(null) // an edit replaces the old refusal with the live check
    setSaveError(null)
  }

  /** On leaving a name field: flag a character that is not allowed. (An empty first name is flagged on Save.) */
  function checkName(field: 'firstName' | 'lastName') {
    const message = nameCharactersError(values[field])
    if (message) setErrors((current) => ({ ...current, [field]: message }))
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

    // A username that cannot be used (or is still being checked) stops the save, with the cursor in its field. An
    // empty field is fine for someone who never had a username, so they can still save their other changes.
    const step = usernameSaveStep(username, ownUsername, usernameCheck.status)
    if (step === 'blocked') {
      // An emptied field is the one block with no red hint of its own (empty shows the grey default), so say why.
      // The other blocks already say why under the field (a rule, taken, could not check, "Checking…").
      if (username === '' && ownUsername) setUsernameSaveError(usernameCannotBeRemovedMessage(ownUsername))
      usernameInput.current?.focus()
      return
    }

    setIsSaving(true)
    // A changed username goes FIRST. If the database refuses it, say why under the field and save nothing else.
    // An unchanged one is not sent at all.
    if (step === 'changed') {
      const usernameResult = await saveUsername(username)
      if (usernameResult.status === 'error') {
        setIsSaving(false)
        setUsernameSaveError(usernameResult.message)
        // Someone took it in the meantime: ask again, so the hint can offer a free alternative ("Try @...").
        if (usernameResult.taken) usernameCheck.recheck()
        usernameInput.current?.focus()
        return
      }
    }

    // The rest. Its reply is the saved row, read again with the username, so the header and the details list show
    // the new username straight away.
    const result = await onSave(validation.edits)
    setIsSaving(false)

    if (result.ok) onSaved()
    else setSaveError(result.message) // the typed values stay exactly as they were
  }

  const describedBy = (field: keyof ProfileFormValues, id: string) => (errors[field] ? `${id}-error` : undefined)
  // After a refused save, the refusal is shown until the person edits the username. A "taken" refusal makes way for
  // the fresh check's answer as soon as it is back, because that one can offer an alternative.
  const usernameHint =
    usernameSaveError !== null && usernameCheck.status !== 'error'
      ? { status: 'error' as const, text: usernameSaveError }
      : { status: usernameCheck.status, text: usernameCheck.hint }

  return (
    <Stack component="form" onSubmit={(event) => void handleSubmit(event)} noValidate spacing={5}>
      <UsernameField
        id="profile-username"
        value={username}
        onChange={setUsernameField}
        status={usernameHint.status}
        hint={usernameHint.text}
        disabled={isSaving}
        onEnter={() => firstNameInput.current?.focus()}
        inputRef={usernameInput}
      />

      <Field id="profile-first-name" label="First name" error={errors.firstName}>
        <TextField
          id="profile-first-name"
          value={values.firstName}
          onChange={(event) => setField('firstName', event.target.value)}
          onBlur={() => checkName('firstName')}
          error={Boolean(errors.firstName)}
          autoComplete="given-name"
          disabled={isSaving}
          fullWidth
          inputRef={firstNameInput}
          slotProps={{
            htmlInput: {
              maxLength: PROFILE_NAME_MAX_LENGTH * NAME_BACKSTOP_FACTOR,
              'aria-describedby': describedBy('firstName', 'profile-first-name'),
            },
          }}
        />
      </Field>

      <Field id="profile-last-name" label="Last name" hint="Optional" error={errors.lastName}>
        <TextField
          id="profile-last-name"
          value={values.lastName}
          onChange={(event) => setField('lastName', event.target.value)}
          onBlur={() => checkName('lastName')}
          error={Boolean(errors.lastName)}
          autoComplete="family-name"
          disabled={isSaving}
          fullWidth
          slotProps={{
            htmlInput: {
              maxLength: PROFILE_NAME_MAX_LENGTH * NAME_BACKSTOP_FACTOR,
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
