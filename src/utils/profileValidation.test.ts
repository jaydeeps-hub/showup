import { describe, expect, it } from 'vitest'
import {
  formatBirthDate,
  getDisplayName,
  hasOnlyNameCharacters,
  isProfileComplete,
  latestBirthDate,
  limitNameInput,
  NAME_CHARACTERS_MESSAGE,
  nameCharactersError,
  toDateInputValue,
  validateProfileForm,
} from './profileValidation'
import { PROFILE_NAME_MAX_LENGTH } from '../config/constants'

// Fixed "today" so the tests give the same answer on any day.
const TODAY = new Date(2026, 9, 17) // 17 October 2026 (months are 0-based)

const valid = { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' }

describe('isProfileComplete (decides whether to show onboarding)', () => {
  it('is incomplete when the profile has no first name', () => {
    expect(isProfileComplete({ firstName: null })).toBe(false)
  })
  it('treats a blank first name as missing', () => {
    expect(isProfileComplete({ firstName: '  ' })).toBe(false)
  })
  it('is complete with a first name alone: the last name and the birthday are optional', () => {
    expect(isProfileComplete({ firstName: 'Asha' })).toBe(true)
  })
  it('does not look at the last name at all: a last name without a first name is still incomplete', () => {
    // The type only takes a first name, so this is checked through a wider object the way the app's Profile is passed.
    const profile = { firstName: null, lastName: 'Rao' }
    expect(isProfileComplete(profile)).toBe(false)
    expect(isProfileComplete({ ...profile, firstName: 'Asha' })).toBe(true)
  })
})

describe('validateProfileForm', () => {
  it('accepts valid values and returns trimmed edits', () => {
    const result = validateProfileForm({ firstName: '  Asha ', lastName: ' Rao  ', dateOfBirth: '1990-05-17' }, TODAY)
    expect(result).toEqual({ ok: true, edits: { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' } })
  })

  it('requires a first name, and only a first name', () => {
    const result = validateProfileForm({ ...valid, firstName: '   ', lastName: '' }, TODAY)
    expect(result).toEqual({ ok: false, errors: { firstName: 'Enter your first name.' } }) // no complaint about the last name
  })

  it('treats the last name as optional: empty or spaces is accepted and saved as null (never an empty string)', () => {
    for (const lastName of ['', '   ', '\t']) {
      const result = validateProfileForm({ ...valid, lastName }, TODAY)
      expect(result).toEqual({ ok: true, edits: { firstName: 'Asha', lastName: null, dateOfBirth: '1990-05-17' } })
    }
  })

  it('still saves a last name when one is given, trimmed', () => {
    expect(validateProfileForm({ ...valid, lastName: '  Rao ' }, TODAY)).toEqual({
      ok: true,
      edits: { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' },
    })
  })

  it('treats the birthday and the last name the same way: both optional, both saved as null when left out', () => {
    expect(validateProfileForm({ firstName: 'Asha', lastName: '', dateOfBirth: '' }, TODAY)).toEqual({
      ok: true,
      edits: { firstName: 'Asha', lastName: null, dateOfBirth: null },
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

/** Written with escapes on purpose: an invisible mark or a look-alike letter cannot hide in the source. */
const cp = (...codes: number[]) => String.fromCodePoint(...codes)

const REAL_NAMES: Record<string, string[]> = {
  'plain Latin': ['Asha', 'Jay', 'Mehta', 'Ng'],
  'apostrophe, hyphen, full stop, spaces': ["O'Brien", 'O’Brien', 'd’Artagnan', 'Mary-Jane', 'Al-Rashid', 'J.R.', 'St. John', 'de la Cruz', 'Mary Ann'],
  'accented Latin': ['José', 'Zoë', 'Müller', 'Łukasz', 'Nguyễn', 'Đặng', 'Ñandú', 'İsmail', 'Åsa', 'Søren', 'Æthelred'],
  'a letter plus a separate accent': ['é', 'José'],
  'Hindi': ['आशा', 'कृष्णा', 'श्रीनिवासन्'],
  'Kannada, Tamil, Malayalam': ['ಕೃಷ್ಣ', 'தமிழ்', 'മലയാളം', 'ക്ഷ'],
  'Gujarati, Punjabi, Bengali, Telugu, Odia': ['ગુજરાતી', 'ਪੰਜਾਬੀ', 'বাংলা', 'తెలుగు', 'ଓଡ଼ିଆ'],
  'Arabic, Persian, Hebrew': ['محمد', 'فاطمة', 'پریا', 'יוסף'],
  'Greek and Cyrillic': ['Αλέξανδρος', 'Иван'],
  'Chinese, Japanese, Korean, Thai': ['田中', '李小龍', 'さくら', 'カタカナ', '김민준', 'ภูมิ'],
  'a zero-width joiner between letters (Persian, Indic)': ['a‌b'],
}

const REFUSED: Record<string, string[]> = {
  'numbers': ['Asha1', '123', 'A1', '1990'],
  'number-like symbols': ['²', '½', '⁵', '①'],
  'emoji': [cp(0x1f600), `Asha${cp(0x1f600)}`, cp(0x1f3cb, 0xfe0f), '❤', '☺', 'a️', 'a⃣', '1️⃣'],
  'decorative symbols': ['♥', '★', '☆', '✓', '©', '™', '♪', '→', '•'],
  'special characters': ['@', '#', '$', '%', '&', '*', '_', '+', '=', '/', '\\', '|', '<', '>', '(', ')', '[', ']', '{', '}', ',', ';', ':', '!', '?', '"', '`', '~', '^', '—', '–', '…'],
  'decorative look-alike letters': [
    cp(0x1d4d0, 0x1d4fc, 0x1d4f1, 0x1d4ea), // bold script
    cp(0x1d552, 0x1d564, 0x1d559, 0x1d552), // double-struck
    cp(0x1d400, 0x1d42c, 0x1d421, 0x1d41a), // bold
    'Ａｓｈａ', // full-width
    'ﬁna', // a ligature
    'ⓐⓑⓒ', // circled
    cp(0x1f150), // a negative-circled letter
  ],
  // Zalgo text piles many marks on one letter. (A few marks spread over several letters is allowed: Indic scripts do that.)
  'stacked marks ("zalgo")': ['S̷̸̲̈́҉͆a', 'á̂̃̄̅̆̇', `Asha${'̶'.repeat(20)}`],
  'invisible and control characters': ['​', '‍', '́', 'Asha\u0000', 'Asha‮'],
  'nothing real in it': ['', ' ', '   ', '-', '.', '--', "'"],
}

describe('hasOnlyNameCharacters (letters, spaces, apostrophe, hyphen, full stop)', () => {
  for (const [group, names] of Object.entries(REAL_NAMES)) {
    it(`accepts real names: ${group}`, () => {
      const rejected = names.filter((name) => !hasOnlyNameCharacters(name))
      expect(rejected.map((name) => [...name].map((c) => c.codePointAt(0)!.toString(16)))).toEqual([])
    })
  }

  for (const [group, values] of Object.entries(REFUSED)) {
    it(`refuses ${group}`, () => {
      const accepted = values.filter((value) => hasOnlyNameCharacters(value))
      expect(accepted.map((value) => [...value].map((c) => c.codePointAt(0)!.toString(16)))).toEqual([])
    })
  }

  it('refuses one bad character anywhere in an otherwise good name', () => {
    for (const bad of ['Asha1', '1Asha', 'As1ha', 'Asha!', '!Asha', `Asha ${cp(0x1f600)}`, 'Asha @ Rao']) expect(hasOnlyNameCharacters(bad)).toBe(false)
  })

  it('allows up to five marks on one letter (Indic scripts stack several), and no more', () => {
    expect(hasOnlyNameCharacters(`a${'́'.repeat(5)}`)).toBe(true)
    expect(hasOnlyNameCharacters(`a${'́'.repeat(6)}`)).toBe(false)
  })
})

describe('nameCharactersError', () => {
  it('gives the simple message for a bad name', () => {
    expect(NAME_CHARACTERS_MESSAGE).toBe('Special characters are not allowed.')
    expect(nameCharactersError('Asha1')).toBe('Special characters are not allowed.')
    expect(nameCharactersError(`Asha${cp(0x1f600)}`)).toBe('Special characters are not allowed.')
  })

  it('gives nothing for a good name, and nothing for an empty one (an empty name is a different rule)', () => {
    expect(nameCharactersError('Asha')).toBeNull()
    expect(nameCharactersError('')).toBeNull()
    expect(nameCharactersError('   ')).toBeNull()
  })

  it('ignores the spaces around a name', () => {
    expect(nameCharactersError('  Asha  ')).toBeNull()
  })
})

describe('validateProfileForm: characters in the names', () => {
  it('refuses a first name and a last name with a special character, each with the simple message', () => {
    expect(validateProfileForm({ ...valid, firstName: 'Asha1' }, TODAY)).toEqual({ ok: false, errors: { firstName: 'Special characters are not allowed.' } })
    expect(validateProfileForm({ ...valid, lastName: `Rao${cp(0x1f600)}` }, TODAY)).toEqual({ ok: false, errors: { lastName: 'Special characters are not allowed.' } })
    expect(validateProfileForm({ ...valid, firstName: '@', lastName: '#' }, TODAY)).toEqual({
      ok: false,
      errors: { firstName: 'Special characters are not allowed.', lastName: 'Special characters are not allowed.' },
    })
  })

  it('checks the characters before the length, so a long name with a digit gets the character message', () => {
    expect(validateProfileForm({ ...valid, firstName: `${'x'.repeat(30)}1` }, TODAY)).toEqual({
      ok: false,
      errors: { firstName: 'Special characters are not allowed.' },
    })
  })

  it('does not say a name is empty because it is full of symbols: an all-symbol first name gets the characters message', () => {
    expect(validateProfileForm({ ...valid, firstName: '!!!' }, TODAY)).toEqual({ ok: false, errors: { firstName: 'Special characters are not allowed.' } })
  })

  it('accepts real names from many scripts in both fields', () => {
    for (const names of Object.values(REAL_NAMES)) {
      for (const name of names) {
        if ([...name].length > 25) continue
        expect(validateProfileForm({ ...valid, firstName: name, lastName: name }, TODAY).ok).toBe(true)
      }
    }
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
