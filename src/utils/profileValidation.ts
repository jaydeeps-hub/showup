import { EARLIEST_DATE_OF_BIRTH, MINIMUM_AGE_YEARS, PROFILE_NAME_MAX_LENGTH } from '../config/constants'
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

/**
 * The latest birth date allowed: the same day and month, MINIMUM_AGE_YEARS years ago, as
 * `YYYY-MM-DD`. For 29 February when that year has no leap day, the limit is 28 February, which
 * is earlier, so it is never looser than "exactly 15 years".
 */
export function latestBirthDate(today: Date): string {
  const year = today.getFullYear() - MINIMUM_AGE_YEARS
  const month = today.getMonth()
  const sameDay = new Date(year, month, today.getDate())
  // 29 February in a non-leap year rolls over into March; day 0 of the next month is the last day of this one.
  return toDateInputValue(sameDay.getMonth() === month ? sameDay : new Date(year, month + 1, 0))
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
  if (value > latestBirthDate(today)) return `Birthday must be at least ${MINIMUM_AGE_YEARS} years ago.`
  if (value < EARLIEST_DATE_OF_BIRTH) return 'Enter a valid date.'
  return null
}

/**
 * Checks the form and, if it is fine, returns the cleaned values to save.
 * Names are required. The birthday is optional, but if given it must be a real date
 * at least 15 years ago. `today` is a parameter so tests can fix the date.
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

/**
 * The name to show for the user: their saved first and last name. Falls back to `fallback`
 * (for example the Google account name) only while the profile is not available.
 */
export function getDisplayName(profile: Pick<Profile, 'firstName' | 'lastName'> | null, fallback: string): string {
  const name = [profile?.firstName, profile?.lastName]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' ')
  return name === '' ? fallback : name
}

/** Formats `YYYY-MM-DD` for reading, for example "17 May 1990". Returns null if missing or unreadable. */
export function formatBirthDate(value: string | null): string | null {
  if (!value || !isRealCalendarDate(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
