// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Quick Start bookkeeping hook, through a tiny component. The database call is faked; the browser's
 * real localStorage (jsdom) is used, so the "remember for next launch" part is exercised for real.
 */
const db = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../services/supabaseClient', () => ({ supabase: { rpc: db.rpc }, isSupabaseConfigured: true }))

const { useQuickStart } = await import('./useQuickStart')
const { QUICKSTART_PENDING_KEY_PREFIX } = await import('../services/quickStartService')

const KEY = (userId: string) => `${QUICKSTART_PENDING_KEY_PREFIX}${userId}`

function Probe({ userId }: { userId: string }) {
  const { finishPending, finish } = useQuickStart(userId)
  return (
    <>
      <p>pending={String(finishPending)}</p>
      <button type="button" onClick={() => void finish()}>
        finish
      </button>
    </>
  )
}

beforeEach(() => {
  localStorage.clear()
  db.rpc.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useQuickStart', () => {
  it('starts with nothing pending and does not call the database', async () => {
    db.rpc.mockResolvedValue({ data: true, error: null })
    render(<Probe userId="u1" />)
    await act(async () => {})
    expect(screen.getByText('pending=false')).toBeTruthy()
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('finishing records it with the database and leaves nothing pending', async () => {
    db.rpc.mockResolvedValue({ data: true, error: null })
    render(<Probe userId="u1" />)
    await act(async () => screen.getByRole('button', { name: 'finish' }).click())
    expect(db.rpc).toHaveBeenCalledWith('complete_quickstart')
    expect(screen.getByText('pending=false')).toBeTruthy()
    expect(localStorage.getItem(KEY('u1'))).toBeNull()
  })

  it('when the database cannot be told, finishing still completes and a reminder is kept', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    render(<Probe userId="u1" />)
    await act(async () => screen.getByRole('button', { name: 'finish' }).click())
    expect(screen.getByText('pending=true')).toBeTruthy()
    expect(localStorage.getItem(KEY('u1'))).toBe('1')
  })

  it('does not throw into the screen when the call rejects outright', async () => {
    db.rpc.mockRejectedValue(new Error('boom'))
    render(<Probe userId="u1" />)
    await act(async () => screen.getByRole('button', { name: 'finish' }).click())
    expect(screen.getByText('pending=true')).toBeTruthy()
  })

  it('on the next launch it sees the reminder at once, then retries and clears it', async () => {
    localStorage.setItem(KEY('u1'), '1')
    let release: (value: { data: boolean; error: null }) => void = () => {}
    db.rpc.mockReturnValue(new Promise((resolve) => (release = resolve)))

    render(<Probe userId="u1" />)
    // Before the retry has answered, the reminder is already known (no flash of "show the Quick Start again").
    expect(screen.getByText('pending=true')).toBeTruthy()
    expect(db.rpc).toHaveBeenCalledTimes(1)

    await act(async () => release({ data: true, error: null }))
    expect(screen.getByText('pending=false')).toBeTruthy()
    expect(localStorage.getItem(KEY('u1'))).toBeNull()
  })

  it('on the next launch, a retry that fails again keeps the reminder', async () => {
    localStorage.setItem(KEY('u1'), '1')
    db.rpc.mockResolvedValue({ data: null, error: { message: 'still offline' } })
    render(<Probe userId="u1" />)
    await act(async () => {})
    expect(screen.getByText('pending=true')).toBeTruthy()
    expect(localStorage.getItem(KEY('u1'))).toBe('1')
  })

  it('one account\'s reminder is never shown to another account on the same device', async () => {
    localStorage.setItem(KEY('alice'), '1')
    db.rpc.mockResolvedValue({ data: true, error: null })
    const view = render(<Probe userId="bob" />)
    await act(async () => {})
    expect(screen.getByText('pending=false')).toBeTruthy()
    expect(db.rpc).not.toHaveBeenCalled() // bob has nothing to retry

    view.rerender(<Probe userId="alice" />)
    expect(screen.getByText('pending=true')).toBeTruthy()
  })

  it('switching to another account does not carry over what the first one learned', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } })
    const view = render(<Probe userId="alice" />)
    await act(async () => screen.getByRole('button', { name: 'finish' }).click())
    expect(screen.getByText('pending=true')).toBeTruthy()

    view.rerender(<Probe userId="bob" />)
    expect(screen.getByText('pending=false')).toBeTruthy()
  })
})
