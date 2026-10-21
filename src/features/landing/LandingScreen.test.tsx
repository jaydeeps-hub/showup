// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'

/**
 * Journey tests for the landing page, using the REAL screen, hooks, dialog and Markdown rendering.
 * Only the outside world is faked: the CMS lookups and Google sign-in.
 */

const cms = vi.hoisted(() => ({ fetchCmsValue: vi.fn() }))
vi.mock('../../services/cmsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/cmsService')>()),
  fetchCmsValue: cms.fetchCmsValue,
}))

const auth = vi.hoisted(() => ({ signInWithGoogle: vi.fn(), consumeRedirectError: vi.fn() }))
vi.mock('../../services/authService', () => ({
  signInWithGoogle: auth.signInWithGoogle,
  consumeRedirectError: auth.consumeRedirectError,
  AuthNotConfiguredError: class AuthNotConfiguredError extends Error {},
  AuthRedirectUnavailableError: class AuthRedirectUnavailableError extends Error {},
}))
vi.mock('../../services/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))

const settings = vi.hoisted(() => ({ privacyUrl: '' }))
vi.mock('../../config/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/constants')>()),
  get PRIVACY_POLICY_URL() {
    return settings.privacyUrl
  },
}))

const { LandingScreen } = await import('./LandingScreen')

const BANNER_URL = 'https://cdn.example.com/mascot.png'
const TERMS_MARKDOWN = [
  '# Terms and Conditions for Showup',
  '',
  '**Effective Date:** October 21, 2026',
  '',
  '## 1. The Core Purpose',
  '',
  '- Use GPS to verify your gym',
  '- Be honest',
  '',
  '<script>window.__pwned = true</script>',
  '',
  '[bad link](javascript:alert(1))',
].join('\n')

/** Answers each CMS lookup by its id, the way the database would. */
function serveCms(overrides: Partial<Record<number, { status: string; value?: string; message?: string }>> = {}) {
  cms.fetchCmsValue.mockImplementation(async (entry: { id: number }) => {
    const custom = overrides[entry.id]
    if (custom) return custom
    return entry.id === 1 ? { status: 'found', value: BANNER_URL } : { status: 'found', value: TERMS_MARKDOWN }
  })
}

function renderLanding() {
  return render(
    <ThemeProvider theme={theme}>
      <LandingScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  settings.privacyUrl = ''
  auth.consumeRedirectError.mockReturnValue(null)
  auth.signInWithGoogle.mockResolvedValue(undefined)
  serveCms()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('content', () => {
  it('shows the headline, description and both actions with the exact copy', async () => {
    renderLanding()

    expect(screen.getByRole('heading', { level: 1, name: 'Show up for yourself.' })).toBeTruthy()
    expect(screen.getByText('Pick your gym and a weekly goal. Showup confirms you were there and counts every visit.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeTruthy()
    expect(screen.getByText(/By continuing you agree to the/)).toBeTruthy()
  })
})

describe('banner from the CMS', () => {
  it('shows the image whose address comes from cms id 1 / lpage_banner, with alt text', async () => {
    renderLanding()

    const image = (await screen.findByRole('img', { name: /showup mascot/i })) as HTMLImageElement
    expect(image.src).toBe(BANNER_URL)
    expect(cms.fetchCmsValue).toHaveBeenCalledWith({ id: 1, contentType: 'lpage_banner' })
  })

  it('shows a loading placeholder first, then the image', async () => {
    cms.fetchCmsValue.mockImplementation((entry: { id: number }) =>
      entry.id === 1 ? new Promise(() => {}) : Promise.resolve({ status: 'found', value: TERMS_MARKDOWN }),
    )
    renderLanding()
    expect(screen.queryByRole('img', { name: /showup mascot/i })).toBeNull()
    expect(screen.queryByRole('img', { name: /unavailable/i })).toBeNull()
  })

  it('shows a quiet unavailable frame (and no made-up picture) when the row is missing', async () => {
    serveCms({ 1: { status: 'not-found' } })
    renderLanding()

    expect(await screen.findByRole('img', { name: /banner image is unavailable/i })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /showup mascot/i })).toBeNull()
  })

  it('shows the unavailable frame when the lookup fails, and the rest of the page still works', async () => {
    serveCms({ 1: { status: 'error', message: 'permission denied' } })
    renderLanding()

    expect(await screen.findByRole('img', { name: /banner image is unavailable/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeTruthy()
  })

  it('refuses an address that is not a normal web address', async () => {
    serveCms({ 1: { status: 'found', value: 'javascript:alert(1)' } })
    renderLanding()

    expect(await screen.findByRole('img', { name: /banner image is unavailable/i })).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('sign in', () => {
  it('starts the existing Google sign-in from the primary button', async () => {
    const user = userEvent.setup()
    renderLanding()
    await user.click(screen.getByRole('button', { name: 'Sign up with Google' }))

    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('starts the SAME existing sign-in from "I already have an account"', async () => {
    const user = userEvent.setup()
    renderLanding()
    await user.click(screen.getByRole('button', { name: 'I already have an account' }))

    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('blocks a second request while one is in progress, from either button', async () => {
    auth.signInWithGoogle.mockReturnValue(new Promise(() => {})) // the browser is leaving for Google
    const user = userEvent.setup()
    renderLanding()
    await user.click(screen.getByRole('button', { name: 'Sign up with Google' }))

    const busy = await screen.findByRole('button', { name: 'Redirecting to Google…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'I already have an account' }) as HTMLButtonElement).disabled).toBe(true)
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('shows a clear error and re-enables the buttons when sign-in cannot start', async () => {
    auth.signInWithGoogle.mockRejectedValueOnce(new Error('network down'))
    const user = userEvent.setup()
    renderLanding()
    await user.click(screen.getByRole('button', { name: 'Sign up with Google' }))

    expect(await screen.findByText(/could not start google sign-in/i)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Sign up with Google' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the message for an error that Google or Supabase added to the returned address', async () => {
    auth.consumeRedirectError.mockReturnValue('Sign-in could not be completed. Please try again.')
    renderLanding()
    expect(await screen.findByText('Sign-in could not be completed. Please try again.')).toBeTruthy()
  })
})

describe('Terms and Conditions popup', () => {
  async function openTerms(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Terms' }))
    return screen.findByRole('dialog', { name: 'Terms and Conditions' })
  }

  it('does not load the terms until they are opened', async () => {
    renderLanding()
    await screen.findByRole('img', { name: /showup mascot/i })
    expect(cms.fetchCmsValue).not.toHaveBeenCalledWith({ id: 2, contentType: 'tnc' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a dialog on the same page and loads cms id 2 / tnc', async () => {
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)

    expect(await within(dialog).findByText('1. The Core Purpose')).toBeTruthy()
    expect(cms.fetchCmsValue).toHaveBeenCalledWith({ id: 2, contentType: 'tnc' })
    // Still on the landing page: the heading is in the document (the modal hides it from screen readers while open).
    expect(screen.getByRole('heading', { level: 1, name: 'Show up for yourself.', hidden: true })).toBeTruthy()
  })

  it('renders the Markdown as formatted content', async () => {
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)
    await within(dialog).findByText('1. The Core Purpose')

    expect(within(dialog).getByRole('heading', { level: 1, name: 'Terms and Conditions for Showup' })).toBeTruthy()
    expect(within(dialog).getByRole('heading', { level: 2, name: '1. The Core Purpose' })).toBeTruthy()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
    expect(dialog.querySelector('strong')?.textContent).toBe('Effective Date:')
  })

  it('never turns CMS text into live HTML or a javascript: link', async () => {
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)
    await within(dialog).findByText('1. The Core Purpose')

    expect(dialog.querySelector('script')).toBeNull()
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
    // The HTML is dropped, not displayed as visible text either (skipHtml).
    expect(dialog.textContent).not.toContain('<script>')
    expect(dialog.textContent).not.toContain('__pwned')
    const badLink = within(dialog).queryByText('bad link')
    expect(badLink?.closest('a')?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
  })

  it('shows a loading state, then keeps the result when reopened', async () => {
    const user = userEvent.setup()
    renderLanding()
    let dialog = await openTerms(user)
    await within(dialog).findByText('1. The Core Purpose')
    const callsAfterFirstOpen = cms.fetchCmsValue.mock.calls.filter(([e]) => e.id === 2).length

    await user.click(within(dialog).getByRole('button', { name: /close terms/i }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    dialog = await openTerms(user)

    expect(await within(dialog).findByText('1. The Core Purpose')).toBeTruthy()
    expect(cms.fetchCmsValue.mock.calls.filter(([e]) => e.id === 2).length).toBe(callsAfterFirstOpen)
  })

  it('has a visible close button that closes it', async () => {
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)
    await user.click(within(dialog).getByRole('button', { name: /close terms/i }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes with the Escape key', async () => {
    const user = userEvent.setup()
    renderLanding()
    await openTerms(user)
    await user.keyboard('{Escape}')

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows a clear message when the terms row is missing', async () => {
    serveCms({ 2: { status: 'not-found' } })
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)

    expect(await within(dialog).findByText(/not available right now/i)).toBeTruthy()
  })

  it('shows an error with a working retry when the lookup fails', async () => {
    serveCms({ 2: { status: 'error', message: 'offline' } })
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)
    expect(await within(dialog).findByText(/couldn't load the terms/i)).toBeTruthy()

    serveCms() // the connection comes back
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByText('1. The Core Purpose')).toBeTruthy()
  })
})

describe('Privacy Policy link', () => {
  it('is plain text, not a dead link, while no policy address is configured', () => {
    renderLanding()
    expect(screen.queryByRole('link', { name: 'Privacy Policy' })).toBeNull()
    expect(screen.getByText('Privacy Policy')).toBeTruthy()
  })

  it('becomes a link to the configured address (opening safely in a new tab)', () => {
    settings.privacyUrl = 'https://showup.example.com/privacy'
    renderLanding()

    const link = screen.getByRole('link', { name: 'Privacy Policy' }) as HTMLAnchorElement
    expect(link.href).toBe('https://showup.example.com/privacy')
    expect(link.rel).toContain('noopener')
  })
})
