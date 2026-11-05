// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { GetSquadResult, RespondResult, ToggleResult } from '../../services/squadService'
import type { MascotContent, MascotImage, SquadMember, SquadRequest, SquadState } from '../../types'

/**
 * The Squad page with the search box empty (Phase 12, task 5): the header count, "Squad requests", "Your squad" with
 * the stats, "Sent requests", the empty combinations, loading and a failed load, and each action. The REAL screen,
 * hook, rows and toast are used; only the database calls (squadService) and the mascot content are faked.
 */

const mascot = vi.hoisted(() => ({ content: null as unknown as MascotContent }))
vi.mock('../../hooks/useMascot', () => ({ useMascotContent: () => mascot.content }))
vi.mock('../../services/appConfig', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/appConfig')>()
  return { ...real, loadAppConfig: vi.fn(async () => real.DEFAULT_APP_CONFIG) }
})
const api = vi.hoisted(() => ({
  getSquad: vi.fn(),
  respondSquadRequest: vi.fn(),
  cancelSquadRequest: vi.fn(),
  removeFromSquad: vi.fn(),
  searchPeople: vi.fn(),
  sendSquadRequest: vi.fn(),
}))
vi.mock('../../services/squadService', () => api)

const { SquadScreen } = await import('./SquadScreen')
const { squadBadgeStore, resetSquadBadgeStore } = await import('../../services/squadBadgeStore')

const image = (key: string): MascotImage => ({ kind: 'expression', url: `https://example.supabase.co/${key}.png`, alt: null, width: 180, height: 250, v: 1 })

const member = (username: string, totalShowups: number, weeksInARow: number, names: Partial<SquadMember> = {}): SquadMember => ({
  username,
  firstName: null,
  lastName: null,
  since: '2026-11-01T10:00:00+00:00',
  totalShowups,
  weeksInARow,
  ...names,
})
const request = (username: string, names: Partial<SquadRequest> = {}): SquadRequest => ({
  username,
  firstName: null,
  lastName: null,
  requestedAt: '2026-11-05T09:00:00+00:00',
  ...names,
})
function state(overrides: Partial<SquadState> = {}): SquadState {
  const squad = overrides.squad ?? []
  const incoming = overrides.incoming ?? []
  return { squadCount: squad.length, maxSize: 50, incomingCount: incoming.length, squad, incoming, outgoing: [], ...overrides }
}
const ok = (s: SquadState): GetSquadResult => ({ status: 'ok', squad: s })

function renderSquad() {
  return render(
    <ThemeProvider theme={theme}>
      <SquadScreen inviteBrowser={{ writeText: vi.fn(async () => {}), share: vi.fn(async () => {}), open: vi.fn() }} />
    </ThemeProvider>,
  )
}
const list = (name: string) => screen.getByRole('list', { name })
const rowOf = (listName: string, username: string) => within(list(listName)).getByText(`@${username}`).closest('li') as HTMLElement
/** Waits until the page has drawn its squad (the loader has gone). */
const loaded = async () => {
  await vi.waitFor(() => expect(screen.queryByText('Loading your squad…')).toBeNull())
}

beforeEach(() => {
  vi.clearAllMocks()
  resetSquadBadgeStore()
  mascot.content = { version: 1, images: { wave: image('wave'), smile: image('smile') }, messages: [] }
  api.getSquad.mockResolvedValue(ok(state()))
})
afterEach(() => cleanup())

// --- The header --------------------------------------------------------------------------------------------------

describe('the header count', () => {
  it.each([
    [0, '0 friends'],
    [1, '1 friend'],
    [3, '3 friends'],
  ])('%i squad-mates says "%s", from squadCount', async (count, text) => {
    const squad = Array.from({ length: count }, (_, i) => member(`m${i}`, 1, 0))
    api.getSquad.mockResolvedValue(ok(state({ squad, squadCount: count })))
    renderSquad()
    expect(await screen.findByText(text)).toBeTruthy()
  })

  it('uses squadCount, not the length of the list it received', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('a', 1, 1)], squadCount: 7 })))
    renderSquad()
    expect(await screen.findByText('7 friends')).toBeTruthy()
  })
})

// --- Loading and failure -----------------------------------------------------------------------------------------

describe('loading and a failed load', () => {
  it('shows the shared loader while the squad loads', async () => {
    api.getSquad.mockImplementation(() => new Promise(() => {}))
    renderSquad()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Loading your squad…')
    expect(status.querySelector('svg')).toBeTruthy() // the loader
  })

  it('a failed load says so, with Retry, which loads again', async () => {
    api.getSquad.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong. Try again.', code: null })
    api.getSquad.mockResolvedValueOnce(ok(state({ squad: [member('rahul_k', 3, 1)], squadCount: 1 })))
    const user = userEvent.setup()
    renderSquad()
    expect(await screen.findByRole('heading', { name: 'Couldn’t load your squad' })).toBeTruthy()
    expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('list', { name: 'Your squad' })).toBeTruthy()
    expect(api.getSquad).toHaveBeenCalledTimes(2)
  })
})

// --- The sections ------------------------------------------------------------------------------------------------

describe('"Squad requests · N"', () => {
  beforeEach(() => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('karan_m', { firstName: 'Karan', lastName: 'Mehta' }), request('sana_92')] })))
  })

  it('has the heading with the count, and a card per request with the avatar, @username and name', async () => {
    renderSquad()
    await loaded()
    expect(screen.getByRole('heading', { name: 'Squad requests · 2' })).toBeTruthy()
    const card = rowOf('Squad requests · 2', 'karan_m')
    expect(card.textContent).toContain('Karan Mehta')
    expect(card.querySelector('img')!.getAttribute('src')).toContain('smile.png')
  })

  it('has Accept (blue) and Reject on each card', async () => {
    renderSquad()
    await loaded()
    const card = rowOf('Squad requests · 2', 'karan_m')
    const accept = within(card).getByRole('button', { name: 'Accept @karan_m' })
    const reject = within(card).getByRole('button', { name: 'Reject @karan_m' })
    expect(accept.textContent).toBe('Accept')
    expect(reject.textContent).toBe('Reject')
    expect(getComputedStyle(accept).backgroundColor.replace(/\s/g, '')).toBe('rgb(43,80,217)') // accentPrimary
    expect(getComputedStyle(reject).backgroundColor.replace(/\s/g, '')).not.toBe('rgb(43,80,217)')
  })

  it('shows no stats for someone who asked (they are not a squad-mate yet)', async () => {
    renderSquad()
    await loaded()
    expect(within(rowOf('Squad requests · 2', 'karan_m')).queryByTestId('member-stats')).toBeNull()
  })
})

describe('"Your squad"', () => {
  it('a row per member, in the order the server sends them', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('zed', 1, 0), member('amy', 9, 3), member('bob', 2, 1)] })))
    renderSquad()
    await loaded()
    const names = within(list('Your squad')).getAllByText(/^@/).map((node) => node.textContent)
    expect(names).toEqual(['@zed', '@amy', '@bob'])
  })

  it('shows "<total> showups" and "<n> weeks in a row", with the plurals right', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('rahul_k', 128, 12), member('neha_runs', 1, 1)] })))
    renderSquad()
    await loaded()
    const rahul = within(rowOf('Your squad', 'rahul_k')).getByTestId('member-stats')
    expect(within(rahul).getByLabelText('128 showups')).toBeTruthy()
    expect(within(rahul).getByLabelText('12 weeks in a row')).toBeTruthy()
    const neha = within(rowOf('Your squad', 'neha_runs')).getByTestId('member-stats')
    expect(within(neha).getByLabelText('1 showup')).toBeTruthy()
    expect(within(neha).getByLabelText('1 week in a row')).toBeTruthy()
  })

  it('shows each chip only when its number is above 0', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('only_showups', 5, 0), member('only_weeks', 0, 2), member('none_yet', 0, 0)] })))
    renderSquad()
    await loaded()
    const showupsOnly = rowOf('Your squad', 'only_showups')
    expect(within(showupsOnly).getByLabelText('5 showups')).toBeTruthy()
    expect(within(showupsOnly).queryByLabelText(/in a row/)).toBeNull()
    const weeksOnly = rowOf('Your squad', 'only_weeks')
    expect(within(weeksOnly).getByLabelText('2 weeks in a row')).toBeTruthy()
    expect(within(weeksOnly).queryByLabelText(/showups?$/)).toBeNull()
    expect(within(rowOf('Your squad', 'none_yet')).queryByTestId('member-stats')).toBeNull() // no empty box either
  })

  it('has no "Remove from squad" button yet', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('rahul_k', 3, 1)] })))
    renderSquad()
    await loaded()
    expect(within(rowOf('Your squad', 'rahul_k')).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })
})

describe('"Sent requests"', () => {
  it('a row per request you sent, with a Cancel button', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('a', 1, 0)], outgoing: [request('priya_fit', { firstName: 'Priya' })] })))
    renderSquad()
    await loaded()
    expect(screen.getByRole('heading', { name: 'Sent requests' })).toBeTruthy()
    const row = rowOf('Sent requests', 'priya_fit')
    expect(within(row).getByRole('button', { name: 'Cancel request to @priya_fit' }).textContent).toBe('Cancel')
    expect(row.textContent).toContain('Priya')
  })

  it('comes after "Your squad"', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('a', 1, 0)], outgoing: [request('b')] })))
    renderSquad()
    await loaded()
    const yours = screen.getByRole('heading', { name: 'Your squad' })
    const sent = screen.getByRole('heading', { name: 'Sent requests' })
    expect(Boolean(yours.compareDocumentPosition(sent) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })
})

// --- The empty combinations --------------------------------------------------------------------------------------

describe('what shows for each combination', () => {
  it('nothing at all: task 2’s empty state, and none of the sections', async () => {
    renderSquad()
    expect(await screen.findByRole('heading', { name: 'Your squad is empty' })).toBeTruthy()
    for (const name of ['Your squad', 'Sent requests']) expect(screen.queryByRole('heading', { name })).toBeNull()
    expect(screen.queryByRole('heading', { name: /Squad requests/ })).toBeNull()
  })

  it('no squad but requests waiting: the requests, then "No one in your squad yet…"', async () => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('karan_m')] })))
    renderSquad()
    await loaded()
    expect(screen.getByRole('heading', { name: 'Squad requests · 1' })).toBeTruthy()
    const line = screen.getByText('No one in your squad yet. Accept a request or search for people.')
    expect(Boolean(screen.getByRole('heading', { name: 'Squad requests · 1' }).compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(screen.queryByRole('heading', { name: 'Your squad is empty' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Your squad' })).toBeNull()
  })

  it('no squad, only requests you sent: the line, then "Sent requests"', async () => {
    api.getSquad.mockResolvedValue(ok(state({ outgoing: [request('priya_fit')] })))
    renderSquad()
    await loaded()
    expect(screen.getByText('No one in your squad yet. Accept a request or search for people.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sent requests' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Your squad is empty' })).toBeNull()
  })

  it('a squad and nothing waiting: only "Your squad", no requests heading and no "No one…" line', async () => {
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('rahul_k', 1, 0)] })))
    renderSquad()
    await loaded()
    expect(screen.getByRole('heading', { name: 'Your squad' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Squad requests/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sent requests' })).toBeNull()
    expect(screen.queryByText(/No one in your squad yet/)).toBeNull()
  })

  it('everything at once: requests, then the squad, then sent requests', async () => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('i')], squad: [member('s', 1, 1)], outgoing: [request('o')] })))
    renderSquad()
    await loaded()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(headings).toEqual(['Squad requests · 1', 'Your squad', 'Sent requests'])
  })
})

// --- The actions -------------------------------------------------------------------------------------------------

describe('Accept', () => {
  beforeEach(() => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('karan_m')] })))
  })

  it('accepts, toasts "@x joined your squad" and refreshes the page', async () => {
    api.respondSquadRequest.mockResolvedValue({ status: 'squad' } satisfies RespondResult)
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    api.getSquad.mockResolvedValue(ok(state({ squad: [member('karan_m', 0, 0)] })))
    await user.click(screen.getByRole('button', { name: 'Accept @karan_m' }))
    expect(api.respondSquadRequest).toHaveBeenCalledWith('karan_m', true, 50)
    expect(await screen.findByText('@karan_m joined your squad')).toBeTruthy()
    expect(await screen.findByRole('list', { name: 'Your squad' })).toBeTruthy() // the page shows the database again
    expect(api.getSquad).toHaveBeenCalledTimes(2)
  })

  it('an error shows its text, and the page is still refreshed', async () => {
    api.respondSquadRequest.mockResolvedValue({ status: 'error', message: 'Their squad is full.', code: 'their_squad_full' } satisfies RespondResult)
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Accept @karan_m' }))
    expect(await screen.findByText('Their squad is full.')).toBeTruthy()
    await vi.waitFor(() => expect(api.getSquad).toHaveBeenCalledTimes(2))
  })
})

describe('Reject', () => {
  beforeEach(() => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('sana_92')] })))
  })

  it('declines, toasts "Request rejected" in the warning style, and refreshes', async () => {
    api.respondSquadRequest.mockResolvedValue({ status: 'declined' } satisfies RespondResult)
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    api.getSquad.mockResolvedValue(ok(state()))
    await user.click(screen.getByRole('button', { name: 'Reject @sana_92' }))
    expect(api.respondSquadRequest).toHaveBeenCalledWith('sana_92', false, 50)
    const toast = await screen.findByText('Request rejected')
    expect(toast.closest('.MuiAlert-root')!.className).toMatch(/MuiAlert-filledWarning|colorWarning/)
    expect(await screen.findByRole('heading', { name: 'Your squad is empty' })).toBeTruthy()
  })

  it('an error shows its text', async () => {
    api.respondSquadRequest.mockResolvedValue({ status: 'error', message: 'That request is no longer there.', code: 'no_request' } satisfies RespondResult)
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Reject @sana_92' }))
    expect(await screen.findByText('That request is no longer there.')).toBeTruthy()
  })
})

describe('Cancel', () => {
  beforeEach(() => {
    api.getSquad.mockResolvedValue(ok(state({ outgoing: [request('priya_fit')] })))
  })

  it('cancels, toasts "Request cancelled" in the warning style, and refreshes', async () => {
    api.cancelSquadRequest.mockResolvedValue({ status: 'ok', done: true } satisfies ToggleResult)
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    api.getSquad.mockResolvedValue(ok(state()))
    await user.click(screen.getByRole('button', { name: 'Cancel request to @priya_fit' }))
    expect(api.cancelSquadRequest).toHaveBeenCalledWith('priya_fit')
    const toast = await screen.findByText('Request cancelled')
    expect(toast.closest('.MuiAlert-root')!.className).toMatch(/MuiAlert-filledWarning|colorWarning/)
    expect(await screen.findByRole('heading', { name: 'Your squad is empty' })).toBeTruthy()
  })

  it('an error shows its text', async () => {
    api.cancelSquadRequest.mockResolvedValue({ status: 'error', message: 'Something went wrong. Try again.', code: null } satisfies ToggleResult)
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Cancel request to @priya_fit' }))
    expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy()
  })
})

describe('buttons are disabled while their call runs', () => {
  it('a double tap on Accept answers only once, and the other buttons wait too', async () => {
    let finish!: (value: RespondResult) => void
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('a'), request('b')], outgoing: [request('c')] })))
    api.respondSquadRequest.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    const accept = screen.getByRole('button', { name: 'Accept @a' }) as HTMLButtonElement
    await user.click(accept)
    expect(accept.disabled).toBe(true)
    expect(accept.getAttribute('aria-busy')).toBe('true')
    for (const name of ['Reject @a', 'Accept @b', 'Reject @b', 'Cancel request to @c']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    accept.click()
    expect(api.respondSquadRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish({ status: 'squad' }))
    expect(api.respondSquadRequest).toHaveBeenCalledTimes(1)
  })

  it('the loader shows on the button that was pressed (Reject), not on Accept', async () => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('a')] })))
    api.respondSquadRequest.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Reject @a' }))
    expect(screen.getByRole('button', { name: 'Reject @a' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: 'Accept @a' }).getAttribute('aria-busy')).toBe('false')
  })

  it('a double tap on Cancel cancels only once', async () => {
    let finish!: (value: ToggleResult) => void
    api.getSquad.mockResolvedValue(ok(state({ outgoing: [request('c')] })))
    api.cancelSquadRequest.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    const cancel = screen.getByRole('button', { name: 'Cancel request to @c' }) as HTMLButtonElement
    await user.click(cancel)
    cancel.click()
    expect(api.cancelSquadRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish({ status: 'ok', done: true }))
  })
})

describe('the tab badge is kept in step', () => {
  it('a loaded squad puts its incoming count in the badge store', async () => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('a'), request('b'), request('c')] })))
    renderSquad()
    await loaded()
    expect(squadBadgeStore.getSnapshot()).toBe(3)
  })

  it('after an Accept the refreshed count reaches the badge', async () => {
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('a'), request('b')] })))
    api.respondSquadRequest.mockResolvedValue({ status: 'squad' })
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    expect(squadBadgeStore.getSnapshot()).toBe(2)
    api.getSquad.mockResolvedValue(ok(state({ incoming: [request('b')], squad: [member('a', 0, 0)] })))
    await user.click(screen.getByRole('button', { name: 'Accept @a' }))
    await vi.waitFor(() => expect(squadBadgeStore.getSnapshot()).toBe(1))
  })

  it('a Request or Accept from the search refreshes the page too', async () => {
    api.searchPeople.mockResolvedValue({ status: 'ok', query: 'ra', results: [{ username: 'rahul_k', firstName: null, lastName: null, relation: 'none' }] })
    api.sendSquadRequest.mockResolvedValue({ status: 'requested' })
    const user = userEvent.setup()
    renderSquad()
    await loaded()
    await user.type(screen.getByRole('searchbox', { name: 'Search people on Showup' }), 'ra')
    await user.click(await screen.findByRole('button', { name: 'Send squad request to @rahul_k' }, { timeout: 3000 }))
    await vi.waitFor(() => expect(api.getSquad).toHaveBeenCalledTimes(2))
  })
})
