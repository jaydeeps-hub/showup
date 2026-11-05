// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { RespondResult, SearchPeopleResult, SendRequestResult } from '../../services/squadService'
import type { MascotContent, MascotImage, SearchResult } from '../../types'

/**
 * The people search on the Squad page (Phase 12, task 4). The REAL screen, search hook, rows and toast are used. Only
 * the database calls (squadService) and the mascot content are faked, so a test chooses what the server answers.
 */

const mascot = vi.hoisted(() => ({ content: null as unknown as MascotContent }))
vi.mock('../../hooks/useMascot', () => ({ useMascotContent: () => mascot.content }))
vi.mock('../../services/appConfig', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/appConfig')>()
  return { ...real, loadAppConfig: vi.fn(async () => real.DEFAULT_APP_CONFIG) }
})
// Since task 5 the page also loads its squad; here it is empty, so these tests stay about the search.
const squad = vi.hoisted(() => ({ searchPeople: vi.fn(), sendSquadRequest: vi.fn(), respondSquadRequest: vi.fn(), getSquad: vi.fn() }))
vi.mock('../../services/squadService', () => squad)

const { SquadScreen } = await import('./SquadScreen')

const image = (key: string): MascotImage => ({ kind: 'expression', url: `https://example.supabase.co/${key}.png`, alt: null, width: 180, height: 250, v: 1 })

const person = (username: string, relation: SearchResult['relation'], names: Partial<SearchResult> = {}): SearchResult => ({
  username,
  firstName: null,
  lastName: null,
  relation,
  ...names,
})
const found = (query: string, results: SearchResult[]): SearchPeopleResult => ({ status: 'ok', query, results })

function renderSquad() {
  return render(
    <ThemeProvider theme={theme}>
      <SquadScreen inviteBrowser={{ writeText: vi.fn(async () => {}), share: vi.fn(async () => {}), open: vi.fn() }} />
    </ThemeProvider>,
  )
}
const box = () => screen.getByRole('searchbox', { name: 'Search people on Showup' }) as HTMLInputElement
const results = () => screen.getByRole('list', { name: 'People on Showup' })
const rowOf = (username: string) => within(results()).getByText(`@${username}`).closest('li') as HTMLElement
/** Types into the box and lets the 450 ms pause run out, so the search is answered. */
async function searchFor(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(box(), text)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(460)
  })
}
const setup = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.clearAllMocks()
  mascot.content = { version: 1, images: { wave: image('wave'), smile: image('smile') }, messages: [] }
  squad.searchPeople.mockImplementation(async (query: string) => found(query, []))
  squad.getSquad.mockResolvedValue({ status: 'ok', squad: { squadCount: 0, maxSize: 50, incomingCount: 0, squad: [], incoming: [], outgoing: [] } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the search box', () => {
  it('sits under the header with the design’s settings', () => {
    renderSquad()
    const input = box()
    expect(input.type).toBe('search')
    expect(input.placeholder).toBe('Search by username or name')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('none')
    expect(input.getAttribute('enterkeyhint')).toBe('search')
    expect(screen.getByTestId('squad-search-slot').contains(input)).toBe(true)
  })

  it('shows the ✕ only when there is text, and the ✕ empties the box and puts the cursor back in it', async () => {
    const user = setup()
    renderSquad()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    await user.type(box(), 'ra')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box().value).toBe('')
    expect(document.activeElement).toBe(box())
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('clearing the box brings back the page it showed before (the empty state)', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    expect(screen.queryByRole('heading', { name: 'Your squad is empty' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('heading', { name: 'Your squad is empty' })).toBeTruthy()
  })
})

describe('what is sent', () => {
  it('a 1-letter query sends nothing, and the page stays as it was', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'r')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(squad.searchPeople).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Your squad is empty' })).toBeTruthy()
  })

  it('a leading "@" is fine: it is not counted and not sent', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, '@r')
    expect(squad.searchPeople).not.toHaveBeenCalled() // "@r" is one letter
    await searchFor(user, 'a')
    expect(squad.searchPeople).toHaveBeenCalledWith('ra')
  })

  it('sends once, after the pause, for what was typed', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'rahul')
    expect(squad.searchPeople).toHaveBeenCalledTimes(1)
    expect(squad.searchPeople).toHaveBeenCalledWith('rahul')
  })
})

describe('the states', () => {
  it('while searching: the loader row "Finding people…"', async () => {
    squad.searchPeople.mockImplementation(() => new Promise(() => {}))
    const user = setup()
    renderSquad()
    await user.type(box(), 'ra')
    expect(screen.getByRole('status').textContent).toBe('Finding people…')
    expect(screen.queryByRole('heading', { name: 'Your squad is empty' })).toBeNull()
  })

  it('results: "People on Showup", a row per person with the smile avatar, @username in bold and the name, and NO stats', async () => {
    squad.searchPeople.mockResolvedValue(found('ra', [person('rahul_k', 'none', { firstName: 'Rahul', lastName: 'Kapoor' })]))
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    expect(screen.getByRole('heading', { name: 'People on Showup' })).toBeTruthy()
    const row = rowOf('rahul_k')
    expect(within(row).getByText('@rahul_k').tagName).toBe('B')
    expect(row.textContent).toContain('Rahul Kapoor')
    expect(row.querySelector('img')!.getAttribute('src')).toContain('smile.png')
    expect(row.textContent).not.toMatch(/showup|weeks? in a row/i) // no stats for a stranger
  })

  it('a person with no name shows only the username', async () => {
    squad.searchPeople.mockResolvedValue(found('gy', [person('gymbro_91', 'none')]))
    const user = setup()
    renderSquad()
    await searchFor(user, 'gy')
    expect(rowOf('gymbro_91').textContent).toContain('@gymbro_91')
    expect(rowOf('gymbro_91').querySelectorAll('span[title]')).toHaveLength(0)
  })

  it('cuts a long name with ShortText (the whole name is the tooltip)', async () => {
    const long = { firstName: 'Bartholomew-Maximilian', lastName: 'Featherstonehaugh' }
    squad.searchPeople.mockResolvedValue(found('ba', [person('bart', 'none', long)]))
    const user = setup()
    renderSquad()
    await searchFor(user, 'ba')
    const name = rowOf('bart').querySelector('span[title]') as HTMLElement
    expect(name.getAttribute('title')).toBe('Bartholomew-Maximilian Featherstonehaugh')
    expect(name.querySelector('[aria-hidden="true"]')!.textContent).toMatch(/\.\.\.$/)
  })

  it('nothing found: "No one found for “q”", the help line, and Invite friends opens the invite sheet', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'zzz')
    expect(screen.getByRole('heading', { name: 'No one found for “zzz”' })).toBeTruthy()
    expect(screen.getByText('Check the username, or invite them to join Showup.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Invite friends' }))
    expect(screen.getByRole('dialog', { name: 'Invite friends to Showup' })).toBeTruthy()
  })

  it('nothing found: a long query is cut with ShortText', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'a'.repeat(40))
    const heading = screen.getByRole('heading', { level: 2, name: /No one found for/ })
    expect(heading.querySelector('[aria-hidden="true"]')!.textContent).toBe(`${'a'.repeat(25)}...`)
  })

  it('a failed search: "Couldn’t search right now" and Retry, which searches again', async () => {
    squad.searchPeople.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong. Try again.', code: null })
    squad.searchPeople.mockResolvedValueOnce(found('ra', [person('rahul_k', 'none')]))
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    expect(screen.getByRole('heading', { name: 'Couldn’t search right now' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(460)
    })
    expect(rowOf('rahul_k')).toBeTruthy()
    expect(squad.searchPeople).toHaveBeenCalledTimes(2)
  })
})

describe('the right side of each row, by relation', () => {
  beforeEach(() => {
    squad.searchPeople.mockResolvedValue(
      found('a', [person('a_none', 'none'), person('a_requested', 'requested'), person('a_incoming', 'incoming'), person('a_squad', 'squad')]),
    )
  })

  it('none: a "Request" button', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'aa')
    expect(within(rowOf('a_none')).getByRole('button', { name: 'Send squad request to @a_none' }).textContent).toBe('Request')
  })

  it('requested: "Requested", muted, and NOT a button', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'aa')
    const row = rowOf('a_requested')
    expect(within(row).queryByRole('button')).toBeNull()
    expect(within(row).getByText('Requested')).toBeTruthy()
  })

  it('incoming: an "Accept" button', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'aa')
    expect(within(rowOf('a_incoming')).getByRole('button', { name: 'Accept @a_incoming' }).textContent).toBe('Accept')
  })

  it('squad: "In squad", muted, and NOT a button', async () => {
    const user = setup()
    renderSquad()
    await searchFor(user, 'aa')
    const row = rowOf('a_squad')
    expect(within(row).queryByRole('button')).toBeNull()
    expect(within(row).getByText('In squad')).toBeTruthy()
  })
})

describe('Request', () => {
  beforeEach(() => {
    squad.searchPeople.mockResolvedValue(found('ra', [person('rahul_k', 'none')]))
  })

  it('sends the request; on "requested" the row says "Requested" and the toast "Request sent to @x"', async () => {
    squad.sendSquadRequest.mockResolvedValue({ status: 'requested' } satisfies SendRequestResult)
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    await user.click(screen.getByRole('button', { name: 'Send squad request to @rahul_k' }))
    expect(squad.sendSquadRequest).toHaveBeenCalledWith('rahul_k', 50) // the squad's size limit, from get_squad
    // The row changes once the database's answer is in (wait for it: the answer arrives after the tap).
    expect(await within(rowOf('rahul_k')).findByText('Requested', {}, { timeout: 3000 })).toBeTruthy()
    expect(within(rowOf('rahul_k')).queryByRole('button')).toBeNull()
    expect(await screen.findByText('Request sent to @rahul_k')).toBeTruthy()
  })

  it('on "squad" (they had already asked you): the row says "In squad" and the toast "@x joined your squad"', async () => {
    squad.sendSquadRequest.mockResolvedValue({ status: 'squad' } satisfies SendRequestResult)
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    await user.click(screen.getByRole('button', { name: 'Send squad request to @rahul_k' }))
    expect(await within(rowOf('rahul_k')).findByText('In squad', {}, { timeout: 3000 })).toBeTruthy()
    expect(await screen.findByText('@rahul_k joined your squad')).toBeTruthy()
  })

  it.each([
    ['already_requested', 'Request already sent.'],
    ['request_cooldown', 'You can ask again in 3 day(s).'],
    ['username_required', 'Set a username on Profile first.'],
    ['too_many_requests', 'You have too many requests waiting. Cancel some first.'],
    ['network', 'Something went wrong. Try again.'],
  ])('an error (%s) shows its text in the toast and leaves the row as it was', async (code, message) => {
    squad.sendSquadRequest.mockResolvedValue({ status: 'error', message, code } satisfies SendRequestResult)
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    await user.click(screen.getByRole('button', { name: 'Send squad request to @rahul_k' }))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(within(rowOf('rahul_k')).getByRole('button', { name: 'Send squad request to @rahul_k' })).toBeTruthy()
  })

  it('is disabled while its call runs, so a double tap sends only once', async () => {
    let finish!: (value: SendRequestResult) => void
    squad.sendSquadRequest.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    const button = screen.getByRole('button', { name: 'Send squad request to @rahul_k' }) as HTMLButtonElement
    await user.click(button)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    button.click() // a second tap while the first is still running
    expect(squad.sendSquadRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish({ status: 'requested' }))
    expect(squad.sendSquadRequest).toHaveBeenCalledTimes(1)
  })

  it('while one request runs, the other rows’ buttons wait too (one call at a time)', async () => {
    squad.searchPeople.mockResolvedValue(found('aa', [person('a_one', 'none'), person('a_two', 'none')]))
    squad.sendSquadRequest.mockImplementation(() => new Promise(() => {}))
    const user = setup()
    renderSquad()
    await searchFor(user, 'aa')
    await user.click(screen.getByRole('button', { name: 'Send squad request to @a_one' }))
    expect((screen.getByRole('button', { name: 'Send squad request to @a_two' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('the change in place lasts only for that search: a new search shows the database’s relations', async () => {
    squad.sendSquadRequest.mockResolvedValue({ status: 'requested' })
    const user = setup()
    renderSquad()
    await searchFor(user, 'ra')
    await user.click(screen.getByRole('button', { name: 'Send squad request to @rahul_k' }))
    expect(await within(rowOf('rahul_k')).findByText('Requested', {}, { timeout: 3000 })).toBeTruthy()
    // A different search, whose answer still says "none" for rahul_k (the database is the judge).
    squad.searchPeople.mockResolvedValue(found('rah', [person('rahul_k', 'none')]))
    await searchFor(user, 'h')
    expect(within(rowOf('rahul_k')).getByRole('button', { name: 'Send squad request to @rahul_k' })).toBeTruthy()
  })
})

describe('Accept', () => {
  beforeEach(() => {
    squad.searchPeople.mockResolvedValue(found('ka', [person('karan_m', 'incoming')]))
  })

  it('accepts with respondSquadRequest(username, true); the row says "In squad" and the toast "@x joined your squad"', async () => {
    squad.respondSquadRequest.mockResolvedValue({ status: 'squad' } satisfies RespondResult)
    const user = setup()
    renderSquad()
    await searchFor(user, 'ka')
    await user.click(screen.getByRole('button', { name: 'Accept @karan_m' }))
    expect(squad.respondSquadRequest).toHaveBeenCalledWith('karan_m', true, 50)
    expect(await within(rowOf('karan_m')).findByText('In squad', {}, { timeout: 3000 })).toBeTruthy()
    expect(await screen.findByText('@karan_m joined your squad')).toBeTruthy()
  })

  it.each([
    ['no_request', 'That request is no longer there.'],
    ['their_squad_full', 'Their squad is full.'],
    ['squad_full', 'Your squad is full.'],
  ])('an error (%s) shows its text and leaves Accept there', async (code, message) => {
    squad.respondSquadRequest.mockResolvedValue({ status: 'error', message, code } satisfies RespondResult)
    const user = setup()
    renderSquad()
    await searchFor(user, 'ka')
    await user.click(screen.getByRole('button', { name: 'Accept @karan_m' }))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(within(rowOf('karan_m')).getByRole('button', { name: 'Accept @karan_m' })).toBeTruthy()
  })

  it('a double tap accepts only once', async () => {
    let finish!: (value: RespondResult) => void
    squad.respondSquadRequest.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const user = setup()
    renderSquad()
    await searchFor(user, 'ka')
    const button = screen.getByRole('button', { name: 'Accept @karan_m' }) as HTMLButtonElement
    await user.click(button)
    button.click()
    expect(squad.respondSquadRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish({ status: 'squad' }))
    expect(squad.respondSquadRequest).toHaveBeenCalledTimes(1)
  })
})
