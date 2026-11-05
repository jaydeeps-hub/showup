// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { MascotContent, MascotImage } from '../../types'
import type { InviteBrowser } from '../../utils/invite'

/**
 * The Squad tab, task 2: the empty page and the invite sheet. The REAL screen, sheet and toast are used. Only the
 * outside world is faked: the mascot content, the app config and the browser's clipboard, share sheet and new tab.
 * No squad database call exists yet, so none can be made.
 */

const mascot = vi.hoisted(() => ({ content: null as unknown as MascotContent }))
vi.mock('../../hooks/useMascot', () => ({ useMascotContent: () => mascot.content }))
const config = vi.hoisted(() => ({ inviteUrl: 'https://showup.app' }))
vi.mock('../../services/appConfig', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/appConfig')>()
  return {
    ...real,
    getCachedAppConfig: () => ({ ...real.DEFAULT_APP_CONFIG, inviteUrl: config.inviteUrl }),
    loadAppConfig: vi.fn(async () => ({ ...real.DEFAULT_APP_CONFIG, inviteUrl: config.inviteUrl })),
  }
})
// The database. Since task 5 the page loads its squad (`get_squad`); here it is always empty, so these tests keep
// showing the empty state they were written for.
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../services/supabaseClient', () => ({ supabase: { rpc, from: vi.fn() }, isSupabaseConfigured: true }))

const { SquadScreen } = await import('./SquadScreen')
const { friendsText } = await import('../../utils/squad')

const image = (key: string, overrides: Partial<MascotImage> = {}): MascotImage => ({
  kind: 'expression',
  url: `https://example.supabase.co/${key}.png`,
  alt: null,
  width: 180,
  height: 250,
  v: 1,
  ...overrides,
})
const MESSAGE = 'Join me on Showup. Show up for yourself and keep each other going: https://showup.app'

let fakeBrowser: InviteBrowser & { writeText: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }
function makeBrowser(overrides: Partial<InviteBrowser> = {}) {
  fakeBrowser = { writeText: vi.fn(async () => {}), share: vi.fn(async () => {}), open: vi.fn(), ...overrides } as typeof fakeBrowser
  return fakeBrowser
}

function renderSquad(browser: InviteBrowser = makeBrowser()) {
  return render(
    <ThemeProvider theme={theme}>
      <SquadScreen inviteBrowser={browser} />
    </ThemeProvider>,
  )
}

/** Renders the page and waits until its squad has loaded (empty here), so the empty state is on screen. */
async function renderSquadLoaded(browser: InviteBrowser = makeBrowser()) {
  const view = renderSquad(browser)
  await screen.findByRole('heading', { name: 'Your squad is empty' })
  return view
}

const sheet = () => screen.getByRole('dialog', { name: 'Invite friends to Showup' })
async function openSheet(user: ReturnType<typeof userEvent.setup>, from: 'Invite' | 'Invite friends' = 'Invite') {
  await user.click(screen.getByRole('button', { name: from }))
  return sheet()
}

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockImplementation(async (name: string) => (name === 'get_squad' ? { data: { squad_count: 0, max_size: 50, incoming_count: 0, squad: [], incoming: [], outgoing: [] }, error: null } : { data: null, error: null }))
  config.inviteUrl = 'https://showup.app'
  mascot.content = { version: 1, images: { wave: image('wave'), smile: image('smile') }, messages: [] }
})
afterEach(() => cleanup())

describe('the page', () => {
  it('has the shared brand header, as on Pause and Profile', () => {
    renderSquad()
    expect(screen.getByText('Showup')).toBeTruthy()
    expect(screen.getByRole('banner')).toBeTruthy()
  })

  it('has the title "My squad" with "0 friends" under it', () => {
    renderSquad()
    expect(screen.getByRole('heading', { level: 1, name: 'My squad' })).toBeTruthy()
    expect(screen.getByText('0 friends')).toBeTruthy()
  })

  it('has the blue Invite button on the right of the title, with its icon', () => {
    renderSquad()
    const invite = screen.getByRole('button', { name: 'Invite' })
    expect(invite.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    const title = screen.getByRole('heading', { level: 1, name: 'My squad' })
    expect(Boolean(title.compareDocumentPosition(invite) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(invite.className).toMatch(/MuiButton-contained/)
  })

  it('shows the design’s empty state, word for word', async () => {
    await renderSquadLoaded()
    expect(screen.getByRole('heading', { level: 2, name: 'Your squad is empty' })).toBeTruthy()
    expect(screen.getByText('Invite friends, or search for people who are already on Showup.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy()
  })

  it('keeps a spot for the search box under the header, before the empty state', async () => {
    await renderSquadLoaded()
    const slot = screen.getByTestId('squad-search-slot')
    const title = screen.getByRole('heading', { level: 1, name: 'My squad' })
    const empty = screen.getByRole('heading', { level: 2, name: 'Your squad is empty' })
    expect(Boolean(title.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(Boolean(slot.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('makes no database call except loading the squad (get_squad); the invite sheet calls nothing', async () => {
    renderSquad()
    await act(async () => {})
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(['get_squad'])
  })
})

describe('the mascot', () => {
  it('is the "wave" picture, 96px, decorative', async () => {
    await renderSquadLoaded()
    const img = screen.getByTestId('squad-empty-mascot').querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://example.supabase.co/wave.png?v=1')
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('aria-hidden')).toBe('true')
    expect(getComputedStyle(img).height).toBe('96px')
  })

  it('falls back to "smile" when there is no wave picture', async () => {
    mascot.content = { version: 1, images: { smile: image('smile') }, messages: [] }
    await renderSquadLoaded()
    expect(screen.getByTestId('squad-empty-mascot').querySelector('img')!.getAttribute('src')).toContain('smile.png')
  })

  it('falls back to "smile" when the wave picture fails to load, and to nothing when that fails too', async () => {
    await renderSquadLoaded()
    const box = screen.getByTestId('squad-empty-mascot')
    await act(async () => {
      box.querySelector('img')!.dispatchEvent(new Event('error'))
    })
    expect(box.querySelector('img')!.getAttribute('src')).toContain('smile.png')
    await act(async () => {
      box.querySelector('img')!.dispatchEvent(new Event('error'))
    })
    expect(box.querySelector('img')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Your squad is empty' })).toBeTruthy() // the words stay
  })

  it('draws nothing, and keeps the words, when there are no pictures at all', async () => {
    mascot.content = { version: 1, images: {}, messages: [] }
    await renderSquadLoaded()
    expect(screen.getByTestId('squad-empty-mascot').querySelector('img')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Your squad is empty' })).toBeTruthy()
  })
})

describe('friendsText', () => {
  it('says "friend" for one and "friends" otherwise', () => {
    expect(friendsText(0)).toBe('0 friends')
    expect(friendsText(1)).toBe('1 friend')
    expect(friendsText(2)).toBe('2 friends')
  })
})

describe('the invite sheet', () => {
  it.each([['Invite'], ['Invite friends']] as const)('opens from the "%s" button', async (from) => {
    const user = userEvent.setup()
    await renderSquadLoaded()
    expect(screen.queryByRole('dialog')).toBeNull()
    await openSheet(user, from)
    expect(sheet()).toBeTruthy()
  })

  it('has the title, the words, the link in its box, and the four buttons', async () => {
    const user = userEvent.setup()
    renderSquad()
    const dialog = await openSheet(user)
    const inside = within(dialog)
    expect(inside.getByRole('heading', { name: 'Invite friends to Showup' })).toBeTruthy()
    expect(inside.getByText('Share the app with friends. Once they join, search for their username and add them to your squad.')).toBeTruthy()
    expect(inside.getByTestId('invite-link').textContent).toBe('https://showup.app')
    for (const name of ['Copy the link', 'Share invite', 'Send on WhatsApp', 'Close']) expect(inside.getByRole('button', { name })).toBeTruthy()
  })

  it('shows the link on one line, cut with "..." when it is too long', async () => {
    const user = userEvent.setup()
    renderSquad()
    const link = within(await openSheet(user)).getByTestId('invite-link')
    const style = getComputedStyle(link)
    expect(style.whiteSpace).toBe('nowrap')
    expect(style.overflow).toBe('hidden')
    expect(style.textOverflow).toBe('ellipsis')
    expect(link.getAttribute('title')).toBe('https://showup.app') // the whole link on hover
  })

  it('shares the link from config.invite_url, and only the plain app link', async () => {
    config.inviteUrl = 'https://showup-pied.vercel.app'
    const user = userEvent.setup()
    renderSquad()
    expect(within(await openSheet(user)).getByTestId('invite-link').textContent).toBe('https://showup-pied.vercel.app')
    expect(within(sheet()).getByTestId('invite-link').textContent).not.toMatch(/join/)
  })

  it('Close closes it', async () => {
    const user = userEvent.setup()
    renderSquad()
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Close' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('Copy', () => {
  it('puts the link on the clipboard, the button says "Copied" and the toast "Link copied"', async () => {
    const user = userEvent.setup()
    renderSquad()
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Copy the link' }))
    expect(fakeBrowser.writeText).toHaveBeenCalledWith('https://showup.app')
    expect(within(sheet()).getByRole('button', { name: 'Link copied' }).textContent).toBe('Copied')
    expect(await screen.findByText('Link copied', { selector: '.MuiAlert-message' })).toBeTruthy()
  })

  it('shows "Copy the link from the box" when the clipboard refuses, and the button keeps saying "Copy"', async () => {
    const user = userEvent.setup()
    renderSquad(makeBrowser({ writeText: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) }))
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Copy the link' }))
    expect(await screen.findByText('Copy the link from the box')).toBeTruthy()
    expect(within(sheet()).getByRole('button', { name: 'Copy the link' }).textContent).toBe('Copy')
  })

  it('shows the same message when there is no clipboard at all', async () => {
    const user = userEvent.setup()
    renderSquad(makeBrowser({ writeText: undefined }))
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Copy the link' }))
    expect(await screen.findByText('Copy the link from the box')).toBeTruthy()
  })

  it('says "Copy" again the next time the sheet opens', async () => {
    const user = userEvent.setup()
    renderSquad()
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Copy the link' }))
    await user.click(within(sheet()).getByRole('button', { name: 'Close' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await openSheet(user)
    expect(within(sheet()).getByRole('button', { name: 'Copy the link' }).textContent).toBe('Copy')
  })

  it('shows the toast above the open sheet, where it can be seen', async () => {
    const user = userEvent.setup()
    renderSquad()
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Copy the link' }))
    const toast = (await screen.findByText('Link copied', { selector: '.MuiAlert-message' })).closest('.MuiSnackbar-root') as HTMLElement
    const sheetLayer = sheet().closest('.MuiDialog-root') as HTMLElement
    expect(Number(getComputedStyle(toast).zIndex)).toBeGreaterThan(Number(getComputedStyle(sheetLayer).zIndex))
  })
})

describe('Share invite', () => {
  it('opens the share sheet with the title, the sentence and the link, and says nothing itself', async () => {
    const user = userEvent.setup()
    renderSquad()
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Share invite' }))
    expect(fakeBrowser.share).toHaveBeenCalledWith({
      title: 'Showup',
      text: 'Join me on Showup. Show up for yourself and keep each other going.',
      url: 'https://showup.app',
    })
    expect(fakeBrowser.writeText).not.toHaveBeenCalled()
    await act(async () => {})
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a cancelled share is not an error: no message, nothing copied', async () => {
    const user = userEvent.setup()
    renderSquad(makeBrowser({ share: vi.fn(async () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' }))) }))
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Share invite' }))
    await act(async () => {})
    expect(fakeBrowser.writeText).not.toHaveBeenCalled()
    expect(screen.queryByText('Copy the link from the box')).toBeNull()
    expect(screen.queryByText('Invite message copied')).toBeNull()
  })

  it('with no share sheet, copies the whole message and toasts "Invite message copied"', async () => {
    const user = userEvent.setup()
    renderSquad(makeBrowser({ share: undefined }))
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Share invite' }))
    expect(fakeBrowser.writeText).toHaveBeenCalledWith(MESSAGE)
    expect(await screen.findByText('Invite message copied')).toBeTruthy()
  })

  it('with no share sheet and no clipboard, says "Copy the link from the box"', async () => {
    const user = userEvent.setup()
    renderSquad(makeBrowser({ share: undefined, writeText: undefined }))
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Share invite' }))
    expect(await screen.findByText('Copy the link from the box')).toBeTruthy()
  })
})

describe('Send on WhatsApp', () => {
  it('opens wa.me with the encoded message in a new tab, with noopener', async () => {
    const user = userEvent.setup()
    renderSquad()
    await openSheet(user)
    await user.click(within(sheet()).getByRole('button', { name: 'Send on WhatsApp' }))
    expect(fakeBrowser.open).toHaveBeenCalledWith(`https://wa.me/?text=${encodeURIComponent(MESSAGE)}`, '_blank', 'noopener')
  })
})
