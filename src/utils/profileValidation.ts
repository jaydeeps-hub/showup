import { EARLIEST_DATE_OF_BIRTH, PROFILE_NAME_MAX_LENGTH } from '../config/constants'
import type { Profile, ProfileEdits } from '../types'

/** What the form holds while the user types: plain strings straight from the inputs. */
export interface ProfileFormValues {
  firstName: string
  lastName: string
  /** `YYYY-MM-DD` from a date input, or an empty string. */
  dateOfBirth: string
}

export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>

export type ProfileValidation = { ok: true; edits: ProfileEdits } | { ok: false; errors: ProfileFormErrors }

/** Formats a date as `YYYY-MM-DD` in the user's own time zone (what a date input uses). */
export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** True for a real calendar date written as `YYYY-MM-DD` (so "2026-02-30" is rejected). */
function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function validateName(value: string, label: string): string | null {
  const name = value.trim()
  if (name === '') return `Enter your ${label}.`
  if (name.length > PROFILE_NAME_MAX_LENGTH) return `Use ${PROFILE_NAME_MAX_LENGTH} characters or fewer.`
  return null
}

function validateDateOfBirth(value: string, today: Date): string | null {
  if (value === '') return null // optional
  if (!isRealCalendarDate(value)) return 'Enter a valid date.'
  // Both sides are zero-padded YYYY-MM-DD, so comparing them as text compares them as dates.
  if (value > toDateInputValue(today)) return "Birthday can't be in the future."
  if (value < EARLIEST_DATE_OF_BIRTH) return 'Enter a valid date.'
  return null
}

/**
 * Checks the form and, if it is fine, returns the cleaned values to save.
 * Names are required. The birthday is optional, but if given it must be a real date
 * that is not in the future. `today` is a parameter so tests can fix the date.
 */
export function validateProfileForm(values: ProfileFormValues, today: Date = new Date()): ProfileValidation {
  const errors: ProfileFormErrors = {}
  const firstNameError = validateName(values.firstName, 'first name')
  const lastNameError = validateName(values.lastName, 'last name')
  const dateError = validateDateOfBirth(values.dateOfBirth, today)
  if (firstNameError) errors.firstName = firstNameError
  if (lastNameError) errors.lastName = lastNameError
  if (dateError) errors.dateOfBirth = dateError

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    edits: {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      dateOfBirth: values.dateOfBirth === '' ? null : values.dateOfBirth,
    },
  }
}

/**
 * A profile is complete once it has a first and last name. The birthday is optional,
 * so it does not count. Incomplete profiles are sent to onboarding.
 */
export function isProfileComplete(profile: Pick<Profile, 'firstName' | 'lastName'>): boolean {
  return (profile.firstName ?? '').trim() !== '' && (profile.lastName ?? '').trim() !== ''
}

export function profileToFormValues(profile: Pick<Profile, 'firstName' | 'lastName' | 'dateOfBirth'>): ProfileFormValues {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    dateOfBirth: profile.dateOfBirth ?? '',
  }
}
