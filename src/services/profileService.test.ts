import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake of the Supabase query builder: from().update().eq().select().maybeSingle().
// Every call is recorded so tests can check exactly what was sent to the database.
const calls = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('./supabaseClient', () => {
  const builder: Record<string, unknown> = {}
  calls.from.mockReturnValue(builder)
  calls.update.mockReturnValue(builder)
  calls.eq.mockReturnValue(builder)
  calls.select.mockReturnValue(builder)
  Object.assign(builder, {
    update: calls.update,
    eq: calls.eq,
    select: calls.select,
    maybeSingle: calls.maybeSingle,
  })
  return { supabase: { from: calls.from, rpc: calls.rpc }, isSupabaseConfigured: true }
})

const { fetchProfile, updatePlaceSearchMode, updateProfile } = await import('./profileService')

const row = {
  id: 'user-1',
  first_name: 'Asha',
  last_name: 'Rao',
  date_of_birth: '1990-05-17',
  is_admin: false,
  place_search_mode: 'fitness_only',
  created_at: '2026-10-17T10:00:00Z',
  updated_at: '2026-10-17T10:05:00Z',
}
const edits = { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' }

beforeEach(() => {
  calls.update.mockClear()
  calls.eq.mockClear()
  calls.select.mockClear()
  calls.from.mockClear()
  calls.maybeSingle.mockReset()
  calls.rpc.mockReset()
})

describe('updateProfile', () => {
  it('updates the existing row for this user and returns the saved profile', async () => {
    calls.maybeSingle.mockResolvedValue({ data: row, error: null })

    const result = await updateProfile('user-1', edits)

    expect(calls.from).toHaveBeenCalledWith('profiles')
    expect(calls.eq).toHaveBeenCalledWith('id', 'user-1')
    expect(result).toEqual({
      status: 'saved',
      profile: {
        id: 'user-1',
        firstName: 'Asha',
        lastName: 'Rao',
        dateOfBirth: '1990-05-17',
        isAdmin: false,
        placeSearchMode: 'fitness_only',
        createdAt: '2026-10-17T10:00:00Z',
        updatedAt: '2026-10-17T10:05:00Z',
      },
    })
  })

  it('sends only first_name, last_name and date_of_birth, never is_admin', async () => {
    calls.maybeSingle.mockResolvedValue({ data: row, error: null })

    // Even if a caller sneaks extra fields in, they must not reach the database.
    await updateProfile('user-1', { ...edits, isAdmin: true, is_admin: true, id: 'other' } as typeof edits)

    expect(calls.update).toHaveBeenCalledTimes(1)
    expect(Object.keys(calls.update.mock.calls[0][0] as object).sort()).toEqual([
      'date_of_birth',
      'first_name',
      'last_name',
    ])
  })

  it('saves a missing birthday as null', async () => {
    calls.maybeSingle.mockResolvedValue({ data: { ...row, date_of_birth: null }, error: null })
    await updateProfile('user-1', { ...edits, dateOfBirth: null })
    expect(calls.update.mock.calls[0][0]).toMatchObject({ date_of_birth: null })
  })

  it('does not insert: it only ever calls update on the profiles table', async () => {
    calls.maybeSingle.mockResolvedValue({ data: row, error: null })
    await updateProfile('user-1', edits)
    expect(calls.from).toHaveBeenCalledTimes(1)
    expect(calls.update).toHaveBeenCalledTimes(1)
  })

  it('reports a friendly message when the database rejects the values', async () => {
    calls.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'new row violates check constraint "profiles_first_name_valid"' },
    })
    const result = await updateProfile('user-1', edits)
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toMatch(/weren't accepted/)
      expect(result.message).not.toMatch(/constraint/) // no database jargon for the user
    }
  })

  it('reports a network problem clearly', async () => {
    calls.maybeSingle.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    const result = await updateProfile('user-1', edits)
    expect(result).toEqual({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
  })

  it('catches a thrown network error instead of crashing', async () => {
    calls.maybeSingle.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await updateProfile('user-1', edits)
    expect(result.status).toBe('error')
  })

  it('does not claim success when no row was updated (for example another user, or no profile)', async () => {
    calls.maybeSingle.mockResolvedValue({ data: null, error: null })
    const result = await updateProfile('user-1', edits)
    expect(result.status).toBe('error')
  })

  it('gives a generic message for other database errors', async () => {
    calls.maybeSingle.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for table profiles' } })
    const result = await updateProfile('user-1', edits)
    expect(result).toEqual({ status: 'error', message: "We couldn't save your changes. Please try again." })
  })
})

describe('fetchProfile', () => {
  it('returns not-found when there is no row', async () => {
    calls.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await fetchProfile('user-1')).toEqual({ status: 'not-found' })
  })
})

describe('placeSearchMode on a loaded profile', () => {
  const load = async (overrides: Record<string, unknown>) => {
    calls.maybeSingle.mockResolvedValue({ data: { ...row, ...overrides }, error: null })
    const result = await fetchProfile('user-1')
    return result.status === 'found' ? result.profile.placeSearchMode : null
  }

  it('is any_place only for an administrator whose stored mode is any_place', async () => {
    expect(await load({ is_admin: true, place_search_mode: 'any_place' })).toBe('any_place')
  })

  it('is fitness_only for an administrator on the default', async () => {
    expect(await load({ is_admin: true, place_search_mode: 'fitness_only' })).toBe('fitness_only')
  })

  it('is fitness_only for a regular user, even if any_place is somehow stored', async () => {
    expect(await load({ is_admin: false, place_search_mode: 'any_place' })).toBe('fitness_only')
  })

  it('is fitness_only for an unexpected stored value', async () => {
    expect(await load({ is_admin: true, place_search_mode: 'something-else' })).toBe('fitness_only')
  })
})

describe('updatePlaceSearchMode', () => {
  it('asks the database function to make the change and returns what the database confirms', async () => {
    calls.rpc.mockResolvedValue({ data: 'any_place', error: null })
    expect(await updatePlaceSearchMode('any_place')).toEqual({ status: 'saved', mode: 'any_place' })
    expect(calls.rpc).toHaveBeenCalledWith('set_place_search_mode', { new_mode: 'any_place' })
  })

  it('never writes the profiles table directly or touches is_admin', async () => {
    calls.rpc.mockResolvedValue({ data: 'fitness_only', error: null })
    await updatePlaceSearchMode('fitness_only')
    expect(calls.from).not.toHaveBeenCalled()
    expect(calls.update).not.toHaveBeenCalled()
  })

  it('reports that only administrators can do this when the database refuses', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Only administrators can search any place.' } })
    expect(await updatePlaceSearchMode('any_place')).toEqual({ status: 'error', message: 'Only administrators can search any place.' })
  })

  it('reports a network problem', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    const result = await updatePlaceSearchMode('any_place')
    expect(result).toEqual({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
  })

  it('catches a thrown error', async () => {
    calls.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await updatePlaceSearchMode('any_place')).status).toBe('error')
  })

  it('never reports any_place unless the database said so', async () => {
    calls.rpc.mockResolvedValue({ data: 'fitness_only', error: null })
    expect(await updatePlaceSearchMode('any_place')).toEqual({ status: 'saved', mode: 'fitness_only' })
  })
})
