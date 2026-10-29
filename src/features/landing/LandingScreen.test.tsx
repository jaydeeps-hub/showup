// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'

/**
 * Journey tests for the landing page, using the REAL screen, hooks, dialog and Markdown rendering.
 * Only the outside world is faked: the landing content lookup (the `config` table) and Google sign-in.
 */

const content = vi.hoisted(() => ({ fetchLandingContent: vi.fn() }))
vi.mock('../../services/landingContent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/landingContent')>()),
  fetchLandingContent: content.fetchLandingContent,
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
const { resetLandingContentCache } = await import('../../hooks/useLandingContent')
const { DEFAULT_BANNER_URL, DEFAULT_LANDING_CONTENT } = await import('../../services/landingContent')

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

/**
 * Answers the landing content lookup the way the service would after reading the `config` table. Anything
 * not given falls back to the same default the real service uses.
 */
function serveContent(overrides: { bannerUrl?: string; bannerFromConfig?: boolean; terms?: string | null; failed?: boolean } = {}) {
  const failed = overrides.failed ?? false
  content.fetchLandingContent.mockResolvedValue({
    failed,
    content: failed
      ? DEFAULT_LANDING_CONTENT
      : {
          bannerUrl: overrides.bannerUrl ?? BANNER_URL,
          bannerFromConfig: overrides.bannerFromConfig ?? (overrides.bannerUrl ?? BANNER_URL) !== DEFAULT_BANNER_URL,
          terms: overrides.terms === undefined ? TERMS_MARKDOWN : overrides.terms,
          carouselHeading: 'Why it works',
        },
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
  resetLandingContentCache()
  auth.consumeRedirectError.mockReturnValue(null)
  auth.signInWithGoogle.mockResolvedValue(undefined)
  serveContent()
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

describe('banner from the config table', () => {
  it('shows the image whose address comes from the lpage_banner row, with alt text', async () => {
    renderLanding()

    const image = (await screen.findByRole('img', { name: /showup mascot/i })) as HTMLImageElement
    expect(image.src).toBe(BANNER_URL)
    expect(content.fetchLandingContent).toHaveBeenCalledTimes(1)
  })

  it('shows a loading placeholder first, with no picture yet (so the default does not flash)', async () => {
    content.fetchLandingContent.mockReturnValue(new Promise(() => {}))
    renderLanding()
    expect(screen.queryByRole('img', { name: /showup mascot/i })).toBeNull()
    expect(screen.queryByRole('img', { name: /unavailable/i })).toBeNull()
  })

  it('shows the built-in banner when the table has no banner row', async () => {
    serveContent({ bannerUrl: DEFAULT_BANNER_URL })
    renderLanding()

    const image = (await screen.findByRole('img', { name: /showup mascot/i })) as HTMLImageElement
    expect(new URL(image.src).pathname).toBe('/images/landing-banner-default.jpg')
  })

  it('shows the built-in banner, and the rest of the page still works, when the lookup fails', async () => {
    serveContent({ failed: true })
    renderLanding()

    const image = (await screen.findByRole('img', { name: /showup mascot/i })) as HTMLImageElement
    expect(new URL(image.src).pathname).toBe('/images/landing-banner-default.jpg')
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeTruthy()
  })

  it('falls back to the built-in banner, once, if the configured picture cannot be loaded', async () => {
    renderLanding()
    const image = (await screen.findByRole('img', { name: /showup mascot/i })) as HTMLImageElement
    expect(image.src).toBe(BANNER_URL)

    image.dispatchEvent(new Event('error'))

    const fallback = (await screen.findByRole('img', { name: /showup mascot/i })) as HTMLImageElement
    expect(new URL(fallback.src).pathname).toBe('/images/landing-banner-default.jpg')
  })

  it('shows a quiet frame, not a loop, if even the built-in banner cannot be loaded', async () => {
    renderLanding()
    ;(await screen.findByRole('img', { name: /showup mascot/i })).dispatchEvent(new Event('error'))
    ;(await screen.findByRole('img', { name: /showup mascot/i })).dispatchEvent(new Event('error'))

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

  it('does not open by itself', async () => {
    renderLanding()
    await screen.findByRole('img', { name: /showup mascot/i })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a dialog on the same page showing the tnc text from the config table', async () => {
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)

    expect(await within(dialog).findByText('1. The Core Purpose')).toBeTruthy()
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

  it('never turns the stored text into live HTML or a javascript: link', async () => {
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

  it('reads the landing content once for the whole page and keeps the result when reopened', async () => {
    const user = userEvent.setup()
    renderLanding()
    let dialog = await openTerms(user)
    await within(dialog).findByText('1. The Core Purpose')
    const callsAfterFirstOpen = content.fetchLandingContent.mock.calls.length

    await user.click(within(dialog).getByRole('button', { name: /close terms/i }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    dialog = await openTerms(user)

    expect(await within(dialog).findByText('1. The Core Purpose')).toBeTruthy()
    expect(content.fetchLandingContent.mock.calls.length).toBe(callsAfterFirstOpen)
    expect(callsAfterFirstOpen).toBe(1) // the banner and the Terms share one request
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

  it('shows a clear message when the table has no Terms', async () => {
    serveContent({ terms: null })
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)

    expect(await within(dialog).findByText(/not available right now/i)).toBeTruthy()
  })

  it('shows an error with a working retry when the lookup fails', async () => {
    serveContent({ failed: true })
    const user = userEvent.setup()
    renderLanding()
    const dialog = await openTerms(user)
    expect(await within(dialog).findByText(/couldn't load the terms/i)).toBeTruthy()

    serveContent() // the connection comes back
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
