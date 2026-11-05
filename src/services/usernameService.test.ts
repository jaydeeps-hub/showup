import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The username RPCs, with Supabase faked: what is sent, how the reply is read, and what each error says. */

const calls = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('./supabaseClient', () => ({ supabase: { rpc: calls.rpc, from: calls.from }, isSupabaseConfigured: true }))

const { checkUsername, saveUsername, parseUsernameCheck, describeSaveUsernameError } = await import('./usernameService')

beforeEach(() => {
  calls.rpc.mockReset()
  calls.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('checkUsername', () => {
  it('calls is_username_available with the value', async () => {
    calls.rpc.mockResolvedValue({ data: { username: 'jay', available: true, reason: null, suggestion: null }, error: null })
    await checkUsername('jay')
    expect(calls.rpc).toHaveBeenCalledWith('is_username_available', { p_username: 'jay' })
  })

  it('reads a free name', async () => {
    calls.rpc.mockResolvedValue({ data: { username: 'jay', available: true, reason: null, suggestion: null }, error: null })
    expect(await checkUsername('jay')).toEqual({ status: 'ok', check: { username: 'jay', available: true, reason: null, suggestion: null } })
  })

  it('reads a taken name with its suggestion', async () => {
    calls.rpc.mockResolvedValue({ data: { username: 'jay', available: false, reason: 'taken', suggestion: 'jay_22' }, error: null })
    expect(await checkUsername('jay')).toEqual({ status: 'ok', check: { username: 'jay', available: false, reason: 'taken', suggestion: 'jay_22' } })
  })

  it('reads the person’s own name', async () => {
    calls.rpc.mockResolvedValue({ data: { username: 'jay', available: true, reason: 'own', suggestion: null }, error: null })
    const result = await checkUsername('jay')
    expect(result.status === 'ok' && result.check.reason).toBe('own')
  })

  it('uses the database’s cleaned value, not what was sent', async () => {
    calls.rpc.mockResolvedValue({ data: { username: 'jay', available: true, reason: null, suggestion: null }, error: null })
    const result = await checkUsername(' JAY ')
    expect(result.status === 'ok' && result.check.username).toBe('jay')
  })

  it('is an error, never "taken", when the database refuses the call', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'not_signed_in' } })
    expect(await checkUsername('jay')).toEqual({ status: 'error' })
  })

  it('is an error when the network fails (the call throws)', async () => {
    calls.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await checkUsername('jay')).toEqual({ status: 'error' })
  })

  it('is an error when the reply is not in the expected form', async () => {
    for (const data of [null, 'yes', [], { available: true }, { username: 'jay' }, { username: 'jay', available: 'true' }]) {
      calls.rpc.mockResolvedValue({ data, error: null })
      expect(await checkUsername('jay')).toEqual({ status: 'error' })
    }
  })
})

describe('parseUsernameCheck', () => {
  it('accepts every reason the database can give', () => {
    for (const reason of [null, 'own', 'empty', 'too_short', 'too_long', 'invalid_format', 'taken']) {
      expect(parseUsernameCheck({ username: 'x', available: false, reason, suggestion: null })?.reason).toBe(reason)
    }
  })

  it('refuses a reason it does not know, rather than guessing', () => {
    expect(parseUsernameCheck({ username: 'x', available: false, reason: 'banned', suggestion: null })).toBeNull()
  })

  it('treats a missing reason as none, and an empty or odd suggestion as none', () => {
    expect(parseUsernameCheck({ username: 'x', available: true })).toEqual({ username: 'x', available: true, reason: null, suggestion: null })
    expect(parseUsernameCheck({ username: 'x', available: false, reason: 'taken', suggestion: '' })?.suggestion).toBeNull()
    expect(parseUsernameCheck({ username: 'x', available: false, reason: 'taken', suggestion: 5 })?.suggestion).toBeNull()
  })
})

describe('saveUsername', () => {
  it('calls set_username with the value, and never writes to the profiles table', async () => {
    calls.rpc.mockResolvedValue({ data: { username: 'jay', changed: true }, error: null })
    await saveUsername('jay')
    expect(calls.rpc).toHaveBeenCalledWith('set_username', { p_username: 'jay' })
    expect(calls.from).not.toHaveBeenCalled()
  })

  it('reads a change and a no-change', async () => {
    calls.rpc.mockResolvedValue({ data: { username: 'jay', changed: true }, error: null })
    expect(await saveUsername('jay')).toEqual({ status: 'saved', username: 'jay', changed: true })
    calls.rpc.mockResolvedValue({ data: { username: 'jay', changed: false }, error: null })
    expect(await saveUsername('jay')).toEqual({ status: 'saved', username: 'jay', changed: false })
  })

  it('reports a taken name as taken, so the screen can check again for a suggestion', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'username_taken' } })
    expect(await saveUsername('jay')).toEqual({ status: 'error', message: '@jay is taken', taken: true })
  })

  it('is the generic message, not "taken", when the network fails', async () => {
    calls.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await saveUsername('jay')).toEqual({ status: 'error', message: 'Something went wrong. Try again.', taken: false })
  })

  it('is the generic message when the reply is not in the expected form', async () => {
    for (const data of [null, true, { username: 'jay' }, { changed: true }]) {
      calls.rpc.mockResolvedValue({ data, error: null })
      expect(await saveUsername('jay')).toEqual({ status: 'error', message: 'Something went wrong. Try again.', taken: false })
    }
  })
})

describe('describeSaveUsernameError (set_username’s errors, which start with their code)', () => {
  it.each([
    ['username_taken', '@jay is taken', true],
    ['username_cooldown: 12 day(s) left', 'You can change your username again in 12 day(s).', false],
    ['username_cooldown: 1 day(s) left', 'You can change your username again in 1 day(s).', false],
    ['invalid_username: too_short', 'Use at least 3 characters', false],
    ['invalid_username: too_long', 'Use at most 20 characters', false],
    ['invalid_username: invalid_format', 'Start with a letter, then use letters, numbers or underscores', false],
    ['invalid_username: empty', 'Friends find you with this. 3–20 letters, numbers or underscores.', false],
    ['invalid_username: something_new', 'Something went wrong. Try again.', false], // a reason this app does not know
    ['not_signed_in', 'Something went wrong. Try again.', false],
    ['profile_not_found', 'Something went wrong. Try again.', false],
    ['username_locked: use set_username()', 'Something went wrong. Try again.', false], // the guard
    ['Failed to fetch', 'Something went wrong. Try again.', false],
    ['', 'Something went wrong. Try again.', false],
  ])('%j says %j', (message, text, taken) => {
    expect(describeSaveUsernameError({ message }, 'jay')).toEqual({ message: text, taken })
  })

  it('reads the code only at the start, so a code mentioned inside other text is not mistaken for it', () => {
    expect(describeSaveUsernameError({ message: 'unexpected: username_taken happened' }, 'jay')).toEqual({ message: 'Something went wrong. Try again.', taken: false })
  })

  it('copes with an error that has no message', () => {
    expect(describeSaveUsernameError({}, 'jay')).toEqual({ message: 'Something went wrong. Try again.', taken: false })
  })
})
