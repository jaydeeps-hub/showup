import { describe, expect, it } from 'vitest'
import { isProfileComplete, toDateInputValue, validateProfileForm } from './profileValidation'

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

  it('rejects names longer than 100 characters', () => {
    const result = validateProfileForm({ ...valid, firstName: 'x'.repeat(101) }, TODAY)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.firstName).toMatch(/100 characters/)
  })

  it('treats the birthday as optional and saves it as null', () => {
    const result = validateProfileForm({ ...valid, dateOfBirth: '' }, TODAY)
    expect(result).toEqual({ ok: true, edits: { firstName: 'Asha', lastName: 'Rao', dateOfBirth: null } })
  })

  it('rejects a birthday in the future', () => {
    const result = validateProfileForm({ ...valid, dateOfBirth: '2026-10-18' }, TODAY)
    expect(result).toEqual({ ok: false, errors: { dateOfBirth: "Birthday can't be in the future." } })
    const farFuture = validateProfileForm({ ...valid, dateOfBirth: '2999-01-01' }, TODAY)
    expect(farFuture.ok).toBe(false)
  })

  it("accepts today's date", () => {
    expect(validateProfileForm({ ...valid, dateOfBirth: '2026-10-17' }, TODAY).ok).toBe(true)
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

describe('toDateInputValue', () => {
  it('formats a date as YYYY-MM-DD with zero padding', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
