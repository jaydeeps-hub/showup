import { describe, expect, it } from 'vitest'
import {
  formatBirthDate,
  getDisplayName,
  isProfileComplete,
  latestBirthDate,
  limitNameInput,
  toDateInputValue,
  validateProfileForm,
} from './profileValidation'
import { PROFILE_NAME_MAX_LENGTH } from '../config/constants'

// Fixed "today" so the tests give the same answer on any day.
const TODAY = new Date(2026, 9, 17) // 17 October 2026 (months are 0-based)

const valid = { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' }

describe('isProfileComplete (decides whether to show onboarding)', () => {
  it('is incomplete when the profile has no names', () => {
    expect(isProfileComplete({ firstName: null, lastName: null })).toBe(false)
  })
  it('is incomplete when only one name is present', () => {
    expect(isProfileComplete({ firstName: 'Asha', lastName: null })).toBe(false)
    expect(isProfileComplete({ firstName: null, lastName: 'Rao' })).toBe(false)
  })
  it('treats blank names as missing', () => {
    expect(isProfileComplete({ firstName: '  ', lastName: 'Rao' })).toBe(false)
  })
  it('is complete with both names, with or without a birthday', () => {
    expect(isProfileComplete({ firstName: 'Asha', lastName: 'Rao' })).toBe(true)
  })
})

describe('validateProfileForm', () => {
  it('accepts valid values and returns trimmed edits', () => {
    const result = validateProfileForm({ firstName: '  Asha ', lastName: ' Rao  ', dateOfBirth: '1990-05-17' }, TODAY)
    expect(result).toEqual({ ok: true, edits: { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' } })
  })

  it('requires a first and a last name', () => {
    const result = validateProfileForm({ ...valid, firstName: '   ', lastName: '' }, TODAY)
    expect(result).toEqual({
      ok: false,
      errors: { firstName: 'Enter your first name.', lastName: 'Enter your last name.' },
    })
  })

  it('rejects names longer than 25 characters, first and last, and accepts exactly 25', () => {
    expect(PROFILE_NAME_MAX_LENGTH).toBe(25)
    const first = validateProfileForm({ ...valid, firstName: 'x'.repeat(26) }, TODAY)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.errors).toEqual({ firstName: 'Use 25 characters or fewer.' })
    const last = validateProfileForm({ ...valid, lastName: 'x'.repeat(26) }, TODAY)
    expect(last.ok).toBe(false)
    if (!last.ok) expect(last.errors).toEqual({ lastName: 'Use 25 characters or fewer.' })
    expect(validateProfileForm({ ...valid, firstName: 'x'.repeat(25), lastName: 'y'.repeat(25) }, TODAY).ok).toBe(true)
  })

  it('counts spaces, but not the spaces around the name (they are trimmed before saving)', () => {
    expect(validateProfileForm({ ...valid, firstName: `  ${'x'.repeat(25)}  ` }, TODAY).ok).toBe(true)
    expect(validateProfileForm({ ...valid, firstName: `${'x'.repeat(12)} ${'y'.repeat(12)}` }, TODAY).ok).toBe(true) // 12 + space + 12 = 25
    expect(validateProfileForm({ ...valid, firstName: `${'x'.repeat(12)} ${'y'.repeat(13)}` }, TODAY).ok).toBe(false) // 12 + space + 13 = 26: the space counts
  })

  it('counts a letter with its vowel sign as one character, the same as the display rule', () => {
    expect(validateProfileForm({ ...valid, firstName: 'कि'.repeat(25) }, TODAY).ok).toBe(true) // 50 code points, 25 characters
    expect(validateProfileForm({ ...valid, firstName: 'कि'.repeat(26) }, TODAY).ok).toBe(false)
  })

  it('treats the birthday as optional and saves it as null', () => {
    const result = validateProfileForm({ ...valid, dateOfBirth: '' }, TODAY)
    expect(result).toEqual({ ok: true, edits: { firstName: 'Asha', lastName: 'Rao', dateOfBirth: null } })
  })

  it('rejects a birthday less than 15 years ago, including future dates', () => {
    // TODAY is 17 Oct 2026, so the latest allowed birthday is 17 Oct 2011.
    const tooYoung = validateProfileForm({ ...valid, dateOfBirth: '2011-10-18' }, TODAY)
    expect(tooYoung).toEqual({ ok: false, errors: { dateOfBirth: 'Birthday must be at least 15 years ago.' } })
    expect(validateProfileForm({ ...valid, dateOfBirth: '2026-10-17' }, TODAY).ok).toBe(false) // today
    expect(validateProfileForm({ ...valid, dateOfBirth: '2026-10-18' }, TODAY).ok).toBe(false) // tomorrow
    expect(validateProfileForm({ ...valid, dateOfBirth: '2999-01-01' }, TODAY).ok).toBe(false) // far future
  })

  it('accepts exactly 15 years ago, and rejects the day after', () => {
    expect(validateProfileForm({ ...valid, dateOfBirth: '2011-10-17' }, TODAY).ok).toBe(true)
    expect(validateProfileForm({ ...valid, dateOfBirth: '2011-10-16' }, TODAY).ok).toBe(true)
    expect(validateProfileForm({ ...valid, dateOfBirth: '2011-10-18' }, TODAY).ok).toBe(false)
  })

  it.each(['not-a-date', '2026-13-01', '2026-02-30', '1990-5-17', '17/05/1990', '2026-00-10'])(
    'rejects the invalid date "%s"',
    (dateOfBirth) => {
      expect(validateProfileForm({ ...valid, dateOfBirth }, TODAY)).toEqual({
        ok: false,
        errors: { dateOfBirth: 'Enter a valid date.' },
      })
    },
  )

  it('accepts 29 February in a leap year but not otherwise', () => {
    expect(validateProfileForm({ ...valid, dateOfBirth: '2000-02-29' }, TODAY).ok).toBe(true)
    expect(validateProfileForm({ ...valid, dateOfBirth: '2001-02-29' }, TODAY).ok).toBe(false)
  })

  it('rejects dates before 1900 (the database rejects them too)', () => {
    expect(validateProfileForm({ ...valid, dateOfBirth: '1899-12-31' }, TODAY).ok).toBe(false)
    expect(validateProfileForm({ ...valid, dateOfBirth: '1900-01-01' }, TODAY).ok).toBe(true)
  })

  it('never includes is_admin in what it returns', () => {
    const result = validateProfileForm({ ...valid, isAdmin: true } as typeof valid, TODAY)
    expect(result.ok && Object.keys(result.edits).sort()).toEqual(['dateOfBirth', 'firstName', 'lastName'])
  })
})

describe('limitNameInput (what a name field holds after typing or pasting)', () => {
  const full = 'a'.repeat(25)

  it('lets text up to 25 characters through unchanged', () => {
    expect(limitNameInput('Asha', '')).toBe('Asha')
    expect(limitNameInput(full, full.slice(0, 24))).toBe(full)
  })

  it('refuses a 26th character: a full field stays exactly as it was', () => {
    expect(limitNameInput(`${full}b`, full)).toBe(full)
    expect(limitNameInput(`b${full}`, full)).toBe(full) // typed at the start: still refused, nothing pushed out
  })

  it('cuts a long paste into an empty or short field to 25 characters', () => {
    expect(limitNameInput('x'.repeat(60), '')).toBe('x'.repeat(25))
    expect(limitNameInput(`ab${'x'.repeat(60)}`, 'ab')).toBe(`ab${'x'.repeat(23)}`)
  })

  it('counts a letter with its vowel sign as one, so a Hindi name is not stopped at half', () => {
    const hindi = 'कि'.repeat(25) // 50 code points, 25 characters
    expect(limitNameInput(hindi, 'कि'.repeat(24))).toBe(hindi)
    expect(limitNameInput(`${hindi}कि`, hindi)).toBe(hindi)
    expect(Array.from(limitNameInput('कि'.repeat(40), '')).length).toBe(50) // 25 whole characters, none split
  })

  it('lets a Hindi name of 25 characters be edited in place: the text is returned as typed, not rebuilt', () => {
    // 24 letters with a vowel sign, then a plain consonant: 25 characters, 49 code units. Typing "क" in front of it makes 26.
    const name = 'कि'.repeat(24) + 'क'
    expect(limitNameInput(name, 'कि'.repeat(24))).toBe(name) // 25 characters: the 49 code units must not count as "too long"
    expect(limitNameInput(`${name}क`, name)).toBe(name) // 26 characters: refused
    // Replacing a selection with text of the same length is allowed even when the field is full.
    const swapped = 'कि'.repeat(23) + 'का' + 'क'
    expect(limitNameInput(swapped, name)).toBe(swapped)
  })

  it('lets a name saved longer than 25 be shortened bit by bit, but never made longer', () => {
    const old = 'x'.repeat(40)
    expect(limitNameInput('x'.repeat(39), old)).toBe('x'.repeat(39)) // Backspace: allowed, not snapped to 25
    expect(limitNameInput('x'.repeat(41), old)).toBe(old) // one more: refused
  })
})

describe('toDateInputValue', () => {
  it('formats a date as YYYY-MM-DD with zero padding', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('latestBirthDate (the newest selectable birthday)', () => {
  it('is the same day and month exactly 15 years ago', () => {
    expect(latestBirthDate(new Date(2026, 9, 17))).toBe('2011-10-17')
    expect(latestBirthDate(new Date(2026, 0, 1))).toBe('2011-01-01')
    expect(latestBirthDate(new Date(2026, 11, 31))).toBe('2011-12-31')
  })

  it('moves forward with today, so the limit is never a fixed date', () => {
    expect(latestBirthDate(new Date(2030, 4, 5))).toBe('2015-05-05')
  })

  it('uses 28 February when today is 29 February and 15 years ago had no leap day', () => {
    // 2028 is a leap year, 2013 is not.
    expect(latestBirthDate(new Date(2028, 1, 29))).toBe('2013-02-28')
    // 2032 -> 2017, also not a leap year.
    expect(latestBirthDate(new Date(2032, 1, 29))).toBe('2017-02-28')
  })

  it('keeps 29 February when 15 years ago did have one', () => {
    // 2024 is a leap year; 2039 - 15 = 2024.
    expect(latestBirthDate(new Date(2039, 1, 28))).toBe('2024-02-28')
  })

  it('never allows a date later than the one the form validates against', () => {
    for (const today of [new Date(2026, 9, 17), new Date(2028, 1, 29), new Date(2026, 11, 31)]) {
      const limit = latestBirthDate(today)
      expect(validateProfileForm({ firstName: 'A', lastName: 'B', dateOfBirth: limit }, today).ok).toBe(true)
    }
  })
})

describe('getDisplayName (the name shown on the home page)', () => {
  it('shows the saved first and last name', () => {
    expect(getDisplayName({ firstName: 'Asha', lastName: 'Rao' }, 'Google Name')).toBe('Asha Rao')
  })

  it('does not use the Google account name when a saved name exists', () => {
    expect(getDisplayName({ firstName: 'Asha', lastName: 'Rao' }, 'Some Other Person')).not.toMatch(/Other/)
  })

  it('trims the saved names', () => {
    expect(getDisplayName({ firstName: '  Asha ', lastName: ' Rao ' }, 'x')).toBe('Asha Rao')
  })

  it('uses whichever saved name exists if only one is present', () => {
    expect(getDisplayName({ firstName: 'Asha', lastName: null }, 'x')).toBe('Asha')
    expect(getDisplayName({ firstName: null, lastName: 'Rao' }, 'x')).toBe('Rao')
  })

  it('falls back only when there is no profile or no saved name', () => {
    expect(getDisplayName(null, 'Google Name')).toBe('Google Name')
    expect(getDisplayName({ firstName: null, lastName: null }, 'Google Name')).toBe('Google Name')
    expect(getDisplayName({ firstName: '  ', lastName: '' }, 'Google Name')).toBe('Google Name')
  })
})

describe('formatBirthDate', () => {
  it('formats a saved date for reading', () => {
    expect(formatBirthDate('1990-05-17')).toBe('17 May 1990')
  })
  it('returns null for missing or unreadable values', () => {
    expect(formatBirthDate(null)).toBeNull()
    expect(formatBirthDate('')).toBeNull()
    expect(formatBirthDate('nonsense')).toBeNull()
  })
})
