import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Loader } from '../../components/Loader'
import { NAME_BACKSTOP_FACTOR, PROFILE_NAME_MAX_LENGTH } from '../../config/constants'
import { tokens } from '../../design-system/tokens'
import type { ProfileEdits, SaveResult } from '../../types'
import {
  hasNameText,
  latestBirthDate,
  limitNameInput,
  NAME_REQUIRED_MESSAGE,
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
  /** Short text under the birthday field. */
  birthdayHelp: string
  /** Optional extra content between the fields and the button. */
  children?: ReactNode
}

/** The field label row: the label on the left and, when given, a muted tag ("Optional") on the right. */
function FieldLabel({ htmlFor, children, tag }: { htmlFor: string; children: ReactNode; tag?: string }) {
  return (
    <Box
      component="label"
      htmlFor={htmlFor}
      sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500, mb: 2, color: tokens.color.textPrimary }}
    >
      <span>{children}</span>
      {tag && <Box component="span" sx={{ color: tokens.color.textSecondary, fontWeight: 400 }}>{tag}</Box>}
    </Box>
  )
}

/** The text box of the design: 54px tall, surface fill, 1.5px line border, blue halo on focus, red border when bad. */
const inputSx = (bad: boolean) => ({
  width: '100%',
  height: tokens.size.control,
  boxSizing: 'border-box',
  borderRadius: `${tokens.radius.control}px`,
  backgroundColor: tokens.color.surface1,
  border: `1.5px solid ${bad ? tokens.color.error : tokens.color.border}`,
  color: tokens.color.textPrimary,
  font: `400 16px ${tokens.font.body}`,
  px: '16px',
  transition: 'border-color 0.15s',
  // The browser's own date picker and autofill colours follow the dark theme.
  colorScheme: 'dark',
  '&::placeholder': { color: tokens.color.textSubtle, opacity: 1 },
  '&:focus': {
    outline: 'none',
    borderColor: bad ? tokens.color.error : tokens.color.accentPrimary,
    boxShadow: bad ? `0 0 0 3px ${tokens.color.error}40` : '0 0 0 3px rgba(43, 80, 217, 0.28)',
  },
  '&:disabled': { backgroundColor: tokens.color.surface2, color: tokens.color.textDisabled },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
})

/**
 * Extra rules for the date box only. On phones (iPhone Safari above all) a date input draws its own native control, which
 * has its own minimum width and ignores `width: 100%`, so it can run past the edge of the screen. Taking the browser's
 * own drawing away (`appearance: none`), letting it shrink (`min-width: 0`), capping it at its container, and giving it a
 * block layout with the same fixed height as the other fields keeps it exactly as wide as they are. The picker still
 * opens when the field is tapped.
 */
const dateInputSx = {
  appearance: 'none',
  WebkitAppearance: 'none',
  display: 'block',
  minWidth: 0,
  maxWidth: '100%',
  minHeight: tokens.size.control,
  textAlign: 'left',
  // Safari puts the date text in its own inner box; without this it centres the text and can add its own padding.
  '&::-webkit-date-and-time-value': { textAlign: 'left', minHeight: '1.2em', margin: 0 },
  '&::-webkit-datetime-edit': { padding: 0 },
} as const

/**
 * The "What should we call you?" form of onboarding: first name, last name and an optional date of birth, and a
 * Continue button pushed to the bottom of the screen.
 *
 * Checks, as in the design:
 *   - an empty first or last name is flagged when the field loses focus (red border and an inline message), and
 *     the flag goes away as soon as the person types;
 *   - Continue stays off until both names have some text;
 *   - Enter in First name moves to Last name, and Enter in Last name moves to Date of birth.
 * What is SAVED is still decided by `validateProfileForm`, so the length limits, the age rule and the date checks
 * apply exactly as before.
 *
 * Everything typed lives in this component's own state, and a failed save never clears it, so a network or
 * database error does not lose anything. Pressing the button again retries.
 */
export function ProfileForm(props: ProfileFormProps) {
  const { initialValues, submitLabel, onSave, onSaved, birthdayHelp, children } = props
  const [values, setValues] = useState<ProfileFormValues>(initialValues)
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  // The latest selectable birth date (exactly 15 years before today, the app's rule), fixed when the form opens.
  const [latestBirthday] = useState(() => latestBirthDate(new Date()))
  const lastNameInput = useRef<HTMLInputElement>(null)
  const birthdayInput = useRef<HTMLInputElement>(null)

  function setField(field: keyof ProfileFormValues, value: string) {
    // A name field never holds more than PROFILE_NAME_MAX_LENGTH characters, typed or pasted.
    const isName = field === 'firstName' || field === 'lastName'
    setValues((current) => ({ ...current, [field]: isName ? limitNameInput(value, current[field]) : value }))
    // Clear the old complaint about this field as soon as the person edits it.
    setErrors((current) => ({ ...current, [field]: undefined }))
    setJustSaved(false)
  }

  /** On leaving a name field: flag it if it is empty. */
  function checkName(field: 'firstName' | 'lastName') {
    if (!hasNameText(values[field])) setErrors((current) => ({ ...current, [field]: NAME_REQUIRED_MESSAGE[field] }))
  }

  /** Enter moves on to the next field instead of submitting. */
  function handleEnter(event: KeyboardEvent<HTMLInputElement>, field: 'firstName' | 'lastName') {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    // The refs are only read here, when a key is pressed, never while drawing the screen.
    ;(field === 'firstName' ? lastNameInput : birthdayInput).current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return // ignore a second press while the first save is in flight
    if (!hasNameText(values.firstName) || !hasNameText(values.lastName)) return // Continue is off in this case

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

  const canContinue = hasNameText(values.firstName) && hasNameText(values.lastName)
  // The browser's own limit is only a backstop for a huge paste. It counts code units, which are never fewer than the
  // characters a person sees, so it cannot cut a name short; limitNameInput (in setField) enforces the real limit.
  const nameLimit = { maxLength: PROFILE_NAME_MAX_LENGTH * NAME_BACKSTOP_FACTOR }

  return (
    <Box
      component="form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => void handleSubmit(event)}
      noValidate
      // A column that fills the screen, so Continue can be pushed to the bottom.
      sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ mt: '20px' }}>
        <FieldLabel htmlFor="onboarding-first-name">First name</FieldLabel>
        <Box
          component="input"
          id="onboarding-first-name"
          value={values.firstName}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setField('firstName', event.target.value)}
          onBlur={() => checkName('firstName')}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => handleEnter(event, 'firstName')}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Jay"
          disabled={isSaving}
          required
          aria-invalid={Boolean(errors.firstName)}
          aria-describedby="onboarding-first-name-error"
          maxLength={nameLimit.maxLength}
          sx={inputSx(Boolean(errors.firstName))}
        />
        <FieldError id="onboarding-first-name-error">{errors.firstName}</FieldError>
      </Box>

      <Box sx={{ mt: '20px' }}>
        <FieldLabel htmlFor="onboarding-last-name">Last name</FieldLabel>
        <Box
          component="input"
          id="onboarding-last-name"
          ref={lastNameInput}
          value={values.lastName}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setField('lastName', event.target.value)}
          onBlur={() => checkName('lastName')}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => handleEnter(event, 'lastName')}
          autoComplete="family-name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Mehta"
          disabled={isSaving}
          required
          aria-invalid={Boolean(errors.lastName)}
          aria-describedby="onboarding-last-name-error"
          maxLength={nameLimit.maxLength}
          sx={inputSx(Boolean(errors.lastName))}
        />
        <FieldError id="onboarding-last-name-error">{errors.lastName}</FieldError>
      </Box>

      <Box sx={{ mt: '20px' }}>
        <FieldLabel htmlFor="onboarding-birthday" tag="Optional">
          Date of birth
        </FieldLabel>
        <Box
          component="input"
          id="onboarding-birthday"
          ref={birthdayInput}
          type="date"
          value={values.dateOfBirth}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setField('dateOfBirth', event.target.value)}
          autoComplete="bday"
          disabled={isSaving}
          aria-invalid={Boolean(errors.dateOfBirth)}
          aria-describedby="onboarding-birthday-help"
          max={latestBirthday}
          sx={{ ...inputSx(Boolean(errors.dateOfBirth)), ...dateInputSx }}
        />
        {errors.dateOfBirth && <FieldError id="onboarding-birthday-error">{errors.dateOfBirth}</FieldError>}
        <Box id="onboarding-birthday-help" sx={{ color: tokens.color.textSecondary, fontSize: 13, mt: '6px' }}>
          {birthdayHelp}
        </Box>
      </Box>

      {children}

      <Box sx={{ minHeight: 24 }} />

      {saveError && (
        <Alert severity="error" role="alert" sx={{ mt: 5 }}>
          {saveError}
        </Alert>
      )}
      {justSaved && !onSaved && (
        <Alert severity="success" role="status" sx={{ mt: 5 }}>
          Your changes have been saved.
        </Alert>
      )}

      <Button
        type="submit"
        variant="contained"
        size="large"
        fullWidth
        disabled={isSaving || !canContinue}
        aria-busy={isSaving}
        startIcon={isSaving ? <Loader color="currentColor" /> : undefined}
        // Pushed to the bottom of the screen (margin-top auto), with some room above it when the screen is short.
        sx={{ mt: 'auto', minHeight: tokens.size.control }}
      >
        {isSaving ? 'Saving…' : saveError ? 'Try again' : submitLabel}
      </Button>
    </Box>
  )
}

/**
 * The red message under a field (`role="alert"`, so it is read out when it appears). The element is always in the
 * page so the field can point at it, but it only has the alert role while it has a message: an empty alert would
 * count as an alert on the page when nothing is wrong. It takes no room when empty.
 */
function FieldError({ id, children }: { id: string; children?: string }) {
  return (
    <Box id={id} role={children ? 'alert' : undefined} sx={{ color: tokens.color.error, fontSize: 13, mt: children ? '6px' : 0 }}>
      {children}
    </Box>
  )
}
