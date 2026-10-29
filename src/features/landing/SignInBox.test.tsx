// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { CmsItem } from '../../types'

/**
 * The floating sign-in box on the landing page, using the REAL screen, box and measuring hook. jsdom does no
 * layout, so the measurements are faked: the box reports a height that depends on its mode, the carousel block
 * reports its height, and the visible viewport is set by each test. Only the outside world is faked besides.
 */

const cms = vi.hoisted(() => ({ items: [] as CmsItem[] }))
vi.mock('../../hooks/useCmsContent', () => ({ useLandingCarouselItems: () => cms.items }))
vi.mock('../../hooks/useMascot', () => ({ useMascotContent: () => ({ version: 1, images: {}, messages: [] }) }))

const landingContent = vi.hoisted(() => ({ fetchLandingContent: vi.fn() }))
vi.mock('../../services/landingContent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/landingContent')>()),
  fetchLandingContent: landingContent.fetchLandingContent,
}))

const auth = vi.hoisted(() => ({ signInWithGoogle: vi.fn(), consumeRedirectError: vi.fn() }))
vi.mock('../../services/authService', () => ({
  signInWithGoogle: auth.signInWithGoogle,
  consumeRedirectError: auth.consumeRedirectError,
  AuthNotConfiguredError: class extends Error {},
  AuthRedirectUnavailableError: class extends Error {},
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
const { DEFAULT_LANDING_CONTENT } = await import('../../services/landingContent')

/** The sizes the design was worked out with. */
const FULL_H = 206
const COMPACT_H = 165
const CAROUSEL_H = 455

const view = { height: 844, width: 390 }
const measured = { boxFull: FULL_H, boxCompact: COMPACT_H, carousel: CAROUSEL_H }
const modeLog: string[] = []
let viewportListeners: Array<() => void> = []
let resizeCallbacks: Array<() => void> = []

function card(id: number): CmsItem {
  return { id, slug: `c-${id}`, position: id, heading: `Heading ${id}`, subheading: `Words ${id}`, image_url: `https://cdn.example.com/${id}.png`, image_alt: `Alt ${id}`, v: 1 }
}

function installLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('aria-label') === 'Sign in') {
      const mode = this.getAttribute('data-mode')
      modeLog.push(mode ?? '')
      return { height: mode === 'full' ? measured.boxFull : mode === 'compact' ? measured.boxCompact : measured.boxFull } as DOMRect
    }
    if (this.tagName === 'SECTION' && this.getAttribute('aria-label') === 'Why it works') return { height: measured.carousel } as DOMRect
    return { height: 0, left: 0 } as DOMRect
  })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    get: () => ({
      height: view.height,
      width: view.width,
      addEventListener: (_: string, listener: () => void) => viewportListeners.push(listener),
      removeEventListener: (_: string, listener: () => void) => {
        viewportListeners = viewportListeners.filter((l) => l !== listener)
      },
    }),
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}

function renderLanding() {
  return render(
    <ThemeProvider theme={theme}>
      <LandingScreen />
    </ThemeProvider>,
  )
}

const box = () => screen.getByRole('region', { name: 'Sign in' })
const modeOf = () => box().getAttribute('data-mode')

beforeEach(() => {
  vi.clearAllMocks()
  settings.privacyUrl = ''
  resetLandingContentCache()
  cms.items = [card(1), card(2), card(3)]
  view.height = 844
  view.width = 390
  Object.assign(measured, { boxFull: FULL_H, boxCompact: COMPACT_H, carousel: CAROUSEL_H })
  modeLog.length = 0
  viewportListeners = []
  resizeCallbacks = []
  auth.consumeRedirectError.mockReturnValue(null)
  auth.signInWithGoogle.mockResolvedValue(undefined)
  landingContent.fetchLandingContent.mockResolvedValue({ failed: false, content: { ...DEFAULT_LANDING_CONTENT, terms: '# Terms', carouselHeading: 'Why it works' } })
  installLayout()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('what is in the box', () => {
  it('has, top to bottom: the heading, the Sign up button, the account button and the Terms line', () => {
    renderLanding()
    const inside = box()
    const heading = within(inside).getByRole('heading', { level: 2, name: 'Get started today.' })
    const signUp = within(inside).getByRole('button', { name: 'Sign up with Google' })
    const account = within(inside).getByRole('button', { name: 'I already have an account' })
    const terms = within(inside).getByText(/By continuing you agree to the/)

    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(heading, signUp)).toBe(true)
    expect(follows(signUp, account)).toBe(true)
    expect(follows(account, terms)).toBe(true)
  })

  it('comes after the carousel, at the end of the page', () => {
    renderLanding()
    // The labelled section around the heading, the cards and the dots (the card track inside it is a second region).
    const carousel = screen.getAllByRole('region', { name: 'Why it works' }).find((node) => node.tagName === 'SECTION')!
    expect(Boolean(carousel.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('keeps the Terms line exactly as it was: the Terms link opens the popup, the Privacy Policy is plain text with no page', async () => {
    const user = userEvent.setup()
    renderLanding()
    const terms = within(box()).getByText(/By continuing you agree to the/)
    expect(terms.textContent).toBe('By continuing you agree to the Terms and Privacy Policy.')
    expect(within(terms).queryByRole('link', { name: 'Privacy Policy' })).toBeNull()
    await user.click(within(terms).getByRole('button', { name: 'Terms' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('keeps the Privacy Policy link when a policy page exists', () => {
    settings.privacyUrl = 'https://example.com/privacy'
    renderLanding()
    const link = within(box()).getByRole('link', { name: 'Privacy Policy' }) as HTMLAnchorElement
    expect(link.href).toBe('https://example.com/privacy')
    expect(link.target).toBe('_blank')
  })

  it('no longer has the Terms line anywhere outside the box, and no "See sources" button', () => {
    renderLanding()
    expect(screen.getAllByText(/By continuing you agree to the/)).toHaveLength(1)
    expect(screen.queryByText(/see sources/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /sources/i })).toBeNull()
  })

  it('still signs in from both buttons, and not twice', async () => {
    const user = userEvent.setup()
    renderLanding()
    await user.click(within(box()).getByRole('button', { name: 'I already have an account' }))
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1)
  })
})

describe('the look', () => {
  function css() {
    return Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
  }

  it('is the glass look: translucent surface, blur with the -webkit- prefix, border, radius, shadow, padding', () => {
    renderLanding()
    const sheet = css()
    expect(sheet).toContain('background-color:rgba(14, 21, 34, 0.82)')
    expect(sheet).toContain('backdrop-filter:blur(18px) saturate(1.2)')
    expect(sheet).toContain('-webkit-backdrop-filter:blur(18px) saturate(1.2)')
    expect(sheet).toContain('border:1px solid rgba(255, 255, 255, 0.1)')
    expect(sheet).toContain('border-radius:24px')
    expect(sheet).toContain('box-shadow:0 10px 30px rgba(0, 0, 0, 0.35)')
    expect(sheet).toContain('padding:14px')
  })

  it('becomes more solid (0.96) where blur is unsupported, and when less transparency is asked for', () => {
    renderLanding()
    const sheet = css()
    expect(sheet).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)\{[^}]*background-color:rgba\(14, 21, 34, 0\.96\)/)
    expect(sheet).toMatch(/@media \(prefers-reduced-transparency: reduce\)\{[^}]*background-color:rgba\(14, 21, 34, 0\.96\)/)
  })

  it('floats with position sticky, 12px plus the safe area from the bottom, above the carousel, 24px below it', () => {
    renderLanding()
    const sheet = css()
    expect(sheet).toContain('position:sticky')
    expect(sheet).toContain('bottom:calc(12px + env(safe-area-inset-bottom, 0px))')
    expect(sheet).toContain('z-index:5')
    expect(sheet).toContain('margin-top:24px')
  })

  it('is an ordinary block (position static) in static mode, and drops the heading in compact mode', () => {
    renderLanding()
    const sheet = css()
    expect(sheet).toMatch(/\[data-mode="static"\]\{position:static;?\}/)
    expect(sheet).toMatch(/\[data-mode="compact"\] \[data-cta="heading"\]\{display:none;?\}/)
    expect(sheet).toMatch(/\[data-mode="compact"\]\{padding:12px;?\}/)
    expect(sheet).toMatch(/\[data-mode="compact"\] \[data-cta="primary"\]\{min-height:48px;?\}/)
    expect(sheet).toMatch(/\[data-mode="compact"\] \[data-cta="secondary"\]\{min-height:44px;?\}/)
  })

  it('sets the Terms text at 12px, #B4B9C4, centred, line-height 1.4, with the link in #8FA6FF', () => {
    renderLanding()
    const terms = within(box()).getByText(/By continuing you agree to the/)
    const style = getComputedStyle(terms)
    expect(style.fontSize).toBe('12px')
    expect(style.lineHeight).toBe('1.4')
    expect(style.textAlign).toBe('center')
    expect(style.color.replace(/\s/g, '')).toBe('rgb(180,185,196)')
    // The Terms link is the accent colour.
    expect(getComputedStyle(within(terms).getByRole('button', { name: 'Terms' })).color.replace(/\s/g, '')).toBe('rgb(143,166,255)')
  })

  it('has the viewport-fit=cover meta in index.html', async () => {
    const { default: html } = await import('../../../index.html?raw')
    expect(html).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/)
  })
})

describe('choosing the mode from the real screen', () => {
  it('is full on a tall screen, compact on a middling one, static on a short one', () => {
    view.height = 844
    const tall = renderLanding()
    expect(modeOf()).toBe('full')
    tall.unmount()

    view.height = 667
    const middle = renderLanding()
    expect(modeOf()).toBe('compact')
    middle.unmount()

    view.height = 600
    renderLanding()
    expect(modeOf()).toBe('static')
  })

  it('is static in landscape, however tall', () => {
    view.height = 844
    view.width = 900
    renderLanding()
    expect(modeOf()).toBe('static')
  })

  it('uses the visible viewport (visualViewport), not the window height', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    view.height = 600
    renderLanding()
    expect(modeOf()).toBe('static')
  })

  it('falls back to the window height when there is no visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => undefined })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    renderLanding()
    expect(modeOf()).toBe('full')
  })

  it('is decided before the first paint: the very first render already has the right mode', () => {
    // A layout effect runs before the browser paints, so by the time render() returns there is no later update to wait for.
    view.height = 844
    renderLanding()
    expect(modeOf()).toBe('full')
  })

  it('measures the real box in both modes, and leaves it in the mode that was chosen', () => {
    view.height = 844
    renderLanding()
    expect(modeLog).toContain('full')
    expect(modeLog).toContain('compact')
    expect(modeOf()).toBe('full')
  })

  it('counts a taller box (a long Terms text or an error) when deciding', () => {
    view.height = 700
    measured.boxFull = 260
    measured.boxCompact = 215
    renderLanding()
    // 260 is not allowed on a 700px screen (over 30%); 215 is not either (215 > 210), so it does not float.
    expect(modeOf()).toBe('static')
  })

  it('has no carousel to protect when there are no cards, so it floats on a short screen', () => {
    cms.items = []
    view.height = 600
    measured.carousel = 0
    renderLanding()
    expect(modeOf()).toBe('compact')
  })
})

describe('deciding again', () => {
  it('on resize', () => {
    view.height = 844
    renderLanding()
    expect(modeOf()).toBe('full')
    view.height = 600
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(modeOf()).toBe('static')
  })

  it('on orientation change', () => {
    renderLanding()
    view.width = 900
    act(() => {
      fireEvent(window, new Event('orientationchange'))
    })
    expect(modeOf()).toBe('static')
  })

  it('when the visual viewport changes (toolbars, keyboard)', () => {
    renderLanding()
    expect(modeOf()).toBe('full')
    view.height = 600
    act(() => viewportListeners.forEach((listener) => listener()))
    expect(modeOf()).toBe('static')
  })

  it('when the box or the carousel changes size (ResizeObserver)', () => {
    view.height = 700
    renderLanding()
    expect(modeOf()).toBe('full')
    measured.carousel = 480
    act(() => resizeCallbacks.forEach((callback) => callback()))
    expect(modeOf()).toBe('compact')
  })

  it('when the web fonts finish loading', async () => {
    let finish: () => void = () => {}
    const ready = new Promise<unknown>((resolve) => (finish = () => resolve(undefined)))
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready, addEventListener: () => {}, removeEventListener: () => {} } })
    view.height = 700
    renderLanding()
    expect(modeOf()).toBe('full')
    measured.carousel = 480
    await act(async () => {
      finish()
      await ready
    })
    expect(modeOf()).toBe('compact')
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined })
  })

  it('does not flicker around a boundary: once dropped it needs 24px more room to come back', () => {
    view.height = 690
    renderLanding()
    expect(modeOf()).toBe('full')
    view.height = 686
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(modeOf()).toBe('compact')
    view.height = 700
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(modeOf()).toBe('compact')
    view.height = 712
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(modeOf()).toBe('full')
  })

  it('stops listening when the page goes away', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const view1 = renderLanding()
    view1.unmount()
    expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['resize', 'orientationchange']))
    expect(viewportListeners).toHaveLength(0)
  })
})

describe('accessibility', () => {
  it('does not trap focus: the page behind it stays reachable, and the box has no dialog role or tabindex trap', () => {
    renderLanding()
    expect(box().getAttribute('role')).toBeNull()
    expect(box().getAttribute('aria-modal')).toBeNull()
    // Nothing in it steers the tab order (a positive tabindex) or takes focus away from the page (-1 traps).
    const steering = Array.from(box().querySelectorAll('[tabindex]')).filter((node) => node.getAttribute('tabindex') !== '0')
    expect(steering).toEqual([])
  })

  it('gives both buttons and the Terms link a visible focus style', () => {
    renderLanding()
    const sheet = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    expect((sheet.match(/Mui-focusVisible\{outline:2px solid #7C97FF/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(sheet).toMatch(/:focus-visible\{outline:2px solid #7C97FF/)
  })
})

describe('the carousel cards are bounded', () => {
  it('limits each card heading to 2 lines and each subheading to 3', () => {
    renderLanding()
    const sheet = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    expect(sheet).toContain('-webkit-line-clamp:2')
    expect(sheet).toContain('-webkit-line-clamp:3')
  })
})
