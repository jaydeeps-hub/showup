// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckUsernameResult } from '../services/usernameService'

/**
 * The live check under a username field: the instant rule, the person's own name, the 500 ms pause, the database's
 * answer, and the guard that ignores an answer for a value that is no longer in the box. The service is faked and the
 * clock is fake, so every step is checked exactly.
 */

const service = vi.hoisted(() => ({ checkUsername: vi.fn() }))
vi.mock('../services/usernameService', () => ({ checkUsername: service.checkUsername }))

const { useUsernameCheck, USERNAME_CHECK_DEBOUNCE_MS } = await import('./useUsernameCheck')

const free = (username: string): CheckUsernameResult => ({ status: 'ok', check: { username, available: true, reason: null, suggestion: null } })
const taken = (username: string, suggestion: string | null): CheckUsernameResult => ({
  status: 'ok',
  check: { username, available: false, reason: 'taken', suggestion },
})

/** A reply the test releases when it chooses, to put replies out of order. */
function deferred() {
  let resolve!: (value: CheckUsernameResult) => void
  const promise = new Promise<CheckUsernameResult>((r) => (resolve = r))
  return { promise, resolve }
}

function render(value: string, own: string | null = null) {
  return renderHook(({ value, own }) => useUsernameCheck(value, own), { initialProps: { value, own } })
}

/** Lets the pause run out and any reply be applied. */
async function waitOut(ms = USERNAME_CHECK_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  service.checkUsername.mockReset()
  service.checkUsername.mockImplementation(async (value: string) => free(value))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('no request needed', () => {
  it('empty: idle, with the default hint', async () => {
    const { result } = render('')
    expect(result.current).toMatchObject({ status: 'idle', hint: 'Friends find you with this. 3–20 letters, numbers or underscores.' })
    await waitOut(2000)
    expect(service.checkUsername).not.toHaveBeenCalled()
  })

  it.each([
    ['ab', 'Use at least 3 characters'],
    ['1abc', 'Start with a letter, then use letters, numbers or underscores'],
    ['_abc', 'Start with a letter, then use letters, numbers or underscores'],
  ])('a rule that fails (%j): an error at once, and no request at all', async (value, hint) => {
    const { result } = render(value)
    expect(result.current).toMatchObject({ status: 'error', hint })
    await waitOut(2000)
    expect(service.checkUsername).not.toHaveBeenCalled()
  })

  it('their own username: ok, "This is your username", and no request', async () => {
    const { result } = render('jay', 'jay')
    expect(result.current).toMatchObject({ status: 'ok', hint: 'This is your username' })
    await waitOut(2000)
    expect(service.checkUsername).not.toHaveBeenCalled()
  })

  it('a person with no username yet: nothing counts as their own, so the name is checked', async () => {
    const { result } = render('jay', null)
    expect(result.current.status).toBe('checking')
    await waitOut()
    expect(service.checkUsername).toHaveBeenCalledWith('jay')
  })
})

describe('the pause before asking', () => {
  it('shows "Checking @v…" straight away, but does not ask until 500 ms have passed', async () => {
    const { result } = render('jay')
    expect(result.current).toMatchObject({ status: 'checking', hint: 'Checking @jay…' })
    await waitOut(USERNAME_CHECK_DEBOUNCE_MS - 1)
    expect(service.checkUsername).not.toHaveBeenCalled()
    await waitOut(1)
    expect(service.checkUsername).toHaveBeenCalledTimes(1)
  })

  it('waits 500 ms, as the prototype does', () => {
    expect(USERNAME_CHECK_DEBOUNCE_MS).toBe(500)
  })

  it('typing quickly asks only once, for the last value', async () => {
    const { rerender } = render('jay')
    for (const value of ['jay_', 'jay_m', 'jay_me', 'jay_meh']) {
      await waitOut(200) // each key arrives before the pause is over
      rerender({ value, own: null })
    }
    await waitOut()
    expect(service.checkUsername).toHaveBeenCalledTimes(1)
    expect(service.checkUsername).toHaveBeenCalledWith('jay_meh')
  })

  it('typing a value that fails the rule cancels the pending request', async () => {
    const { result, rerender } = render('jay')
    await waitOut(200)
    rerender({ value: 'ja', own: null }) // Backspace: now too short
    expect(result.current.status).toBe('error')
    await waitOut(2000)
    expect(service.checkUsername).not.toHaveBeenCalled()
  })
})

describe('the answer', () => {
  it('free: ok, "✓ @v is available"', async () => {
    const { result } = render('jay')
    await waitOut()
    expect(result.current).toMatchObject({ status: 'ok', hint: '✓ @jay is available' })
  })

  it('taken with a suggestion: error, "@v is taken. Try @suggestion"', async () => {
    service.checkUsername.mockResolvedValue(taken('jay', 'jay_22'))
    const { result } = render('jay')
    await waitOut()
    expect(result.current).toMatchObject({ status: 'error', hint: '@jay is taken. Try @jay_22' })
  })

  it('taken with no suggestion: the "Try" part is left out', async () => {
    service.checkUsername.mockResolvedValue(taken('jay', null))
    const { result } = render('jay')
    await waitOut()
    expect(result.current).toMatchObject({ status: 'error', hint: '@jay is taken' })
  })

  it('a reserved name looks the same as a taken one (the database says "taken" for both)', async () => {
    service.checkUsername.mockResolvedValue(taken('admin', 'admin_22'))
    const { result } = render('admin')
    await waitOut()
    expect(result.current).toMatchObject({ status: 'error', hint: '@admin is taken. Try @admin_22' })
  })

  it('the database says it is their own: ok, "This is your username"', async () => {
    service.checkUsername.mockResolvedValue({ status: 'ok', check: { username: 'jay', available: true, reason: 'own', suggestion: null } })
    const { result } = render('jay', null) // the app did not know it yet; the database did
    await waitOut()
    expect(result.current).toMatchObject({ status: 'ok', hint: 'This is your username' })
  })

  it('a rule the database applies that the device did not: its words', async () => {
    service.checkUsername.mockResolvedValue({ status: 'ok', check: { username: 'jay', available: false, reason: 'invalid_format', suggestion: null } })
    const { result } = render('jay')
    await waitOut()
    expect(result.current).toMatchObject({ status: 'error', hint: 'Start with a letter, then use letters, numbers or underscores' })
  })

  it('a network failure: "Couldn’t check right now", and NOT ok', async () => {
    service.checkUsername.mockResolvedValue({ status: 'error' })
    const { result } = render('jay')
    await waitOut()
    expect(result.current).toMatchObject({ status: 'error', hint: 'Couldn’t check right now' })
  })

  it('a reply that says "not available" with no reason: not ok, rather than let the name through', async () => {
    service.checkUsername.mockResolvedValue({ status: 'ok', check: { username: 'jay', available: false, reason: null, suggestion: null } })
    const { result } = render('jay')
    await waitOut()
    expect(result.current).toMatchObject({ status: 'error', hint: 'Couldn’t check right now' })
  })
})

describe('stale answers are ignored', () => {
  it('an answer for an earlier value is dropped when the box has moved on', async () => {
    const first = deferred()
    service.checkUsername.mockImplementationOnce(() => first.promise)
    const { result, rerender } = render('jay')
    await waitOut() // asks for "jay"; the reply is held back
    expect(service.checkUsername).toHaveBeenCalledWith('jay')

    rerender({ value: 'jaya', own: null }) // the person keeps typing
    expect(result.current).toMatchObject({ status: 'checking', hint: 'Checking @jaya…' })

    await act(async () => {
      first.resolve(taken('jay', 'jay_22')) // the OLD answer finally arrives
    })
    expect(result.current).toMatchObject({ status: 'checking', hint: 'Checking @jaya…' }) // not "@jay is taken"

    await waitOut() // now "jaya" is asked about
    expect(result.current).toMatchObject({ status: 'ok', hint: '✓ @jaya is available' })
  })

  it('a slow answer for an old value cannot overwrite a newer answer that came back first', async () => {
    const slow = deferred()
    service.checkUsername.mockImplementationOnce(() => slow.promise) // "jay": slow and taken
    service.checkUsername.mockImplementationOnce(async () => free('jaya')) // "jaya": fast and free
    const { result, rerender } = render('jay')
    await waitOut()
    rerender({ value: 'jaya', own: null })
    await waitOut()
    expect(result.current).toMatchObject({ status: 'ok', hint: '✓ @jaya is available' })

    await act(async () => {
      slow.resolve(taken('jay', null))
    })
    expect(result.current).toMatchObject({ status: 'ok', hint: '✓ @jaya is available' })
  })

  it('going back to an earlier value does not reuse its old answer: it is checked again', async () => {
    service.checkUsername.mockResolvedValueOnce(taken('jay', null))
    const { result, rerender } = render('jay')
    await waitOut()
    expect(result.current.status).toBe('error')

    rerender({ value: 'jaya', own: null })
    await waitOut()
    rerender({ value: 'jay', own: null }) // back to "jay": someone may have freed it meanwhile
    expect(result.current).toMatchObject({ status: 'checking', hint: 'Checking @jay…' })
    await waitOut()
    expect(service.checkUsername).toHaveBeenCalledTimes(3)
  })

  it('an answer that arrives after the field is gone does nothing (no update on an unmounted hook)', async () => {
    const late = deferred()
    service.checkUsername.mockImplementationOnce(() => late.promise)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render('jay')
    await waitOut()
    unmount()
    await act(async () => {
      late.resolve(free('jay'))
    })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('recheck', () => {
  it('asks again for the same value, at once showing "Checking…" (used after a save was refused as taken)', async () => {
    const { result } = render('jay')
    await waitOut()
    expect(result.current.status).toBe('ok')

    service.checkUsername.mockResolvedValueOnce(taken('jay', 'jay_22'))
    act(() => result.current.recheck())
    expect(result.current).toMatchObject({ status: 'checking', hint: 'Checking @jay…' })
    await waitOut()
    expect(result.current).toMatchObject({ status: 'error', hint: '@jay is taken. Try @jay_22' })
    expect(service.checkUsername).toHaveBeenCalledTimes(2)
  })
})
