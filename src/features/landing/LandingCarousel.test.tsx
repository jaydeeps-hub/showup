// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { CmsItem, MascotContent } from '../../types'

/**
 * The landing carousel, using the REAL screen and components. Only the outside world is faked: the content
 * hooks (what the database says), the landing content lookup (heading), and Google sign-in.
 */

const cms = vi.hoisted(() => ({ items: [] as CmsItem[] }))
vi.mock('../../hooks/useCmsContent', () => ({ useLandingCarouselItems: () => cms.items }))

const mascot = vi.hoisted(() => ({ calls: 0, content: null as unknown as MascotContent }))
vi.mock('../../hooks/useMascot', () => ({
  useMascotContent: () => {
    mascot.calls += 1
    return mascot.content
  },
}))

const landingContent = vi.hoisted(() => ({ fetchLandingContent: vi.fn() }))
vi.mock('../../services/landingContent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/landingContent')>()),
  fetchLandingContent: landingContent.fetchLandingContent,
}))

vi.mock('../../services/authService', () => ({
  signInWithGoogle: vi.fn(),
  consumeRedirectError: vi.fn().mockReturnValue(null),
  AuthNotConfiguredError: class extends Error {},
  AuthRedirectUnavailableError: class extends Error {},
}))
vi.mock('../../services/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))

const { LandingCarousel } = await import('./LandingCarousel')
const { LandingScreen } = await import('./LandingScreen')
const { resetLandingContentCache } = await import('../../hooks/useLandingContent')
const { DEFAULT_LANDING_CONTENT } = await import('../../services/landingContent')
const { FALLBACK_EXPRESSIONS, fallbackExpression } = await import('../../utils/cms')

function card(id: number, overrides: Partial<CmsItem> = {}): CmsItem {
  return {
    id,
    slug: `card-${id}`,
    position: id * 10,
    heading: `Heading ${id}`,
    subheading: `Words for card ${id}`,
    image_url: `https://cdn.example.com/card-${id}.png`,
    image_alt: `Alt for card ${id}`,
    v: 7,
    ...overrides,
  }
}

const EXPRESSIONS = ['wave', 'cheer', 'focus', 'sleep', 'smile']
function mascotContent(): MascotContent {
  const images: MascotContent['images'] = {}
  for (const name of EXPRESSIONS) {
    images[name] = { kind: name, url: `https://cdn.example.com/mascot-${name}.png`, alt: null, width: 400, height: 400, v: 3 }
  }
  return { version: 1, images, messages: [] }
}

function renderCarousel() {
  return render(
    <ThemeProvider theme={theme}>
      <LandingCarousel />
    </ThemeProvider>,
  )
}

const slides = () => screen.queryAllByRole('group').filter((node) => node.getAttribute('aria-roledescription') === 'slide')
const dots = (container: HTMLElement) => Array.from(container.querySelectorAll('i[data-active]'))

beforeEach(() => {
  vi.clearAllMocks()
  cms.items = [card(1), card(2), card(3)]
  mascot.calls = 0
  mascot.content = mascotContent()
  resetLandingContentCache()
  landingContent.fetchLandingContent.mockResolvedValue({
    failed: false,
    content: { ...DEFAULT_LANDING_CONTENT, carouselHeading: 'Why it works' },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('when the category has cards', () => {
  it('shows the heading and one card per item, in order, with heading and subheading', () => {
    renderCarousel()

    expect(screen.getByRole('heading', { level: 2, name: 'Why it works' })).toBeTruthy()
    const shown = slides()
    expect(shown).toHaveLength(3)
    shown.forEach((slide, index) => {
      expect(within(slide).getByRole('heading', { level: 3 }).textContent).toBe(`Heading ${index + 1}`)
      expect(within(slide).getByText(`Words for card ${index + 1}`)).toBeTruthy()
    })
  })

  it('has exactly as many cards and dots as items, whatever the number', () => {
    cms.items = [card(1), card(2), card(3), card(4), card(5), card(6), card(7)]
    const { container } = renderCarousel()
    expect(slides()).toHaveLength(7)
    expect(dots(container)).toHaveLength(7)
  })

  it('uses the heading from the config table once it arrives', async () => {
    landingContent.fetchLandingContent.mockResolvedValue({
      failed: false,
      content: { ...DEFAULT_LANDING_CONTENT, carouselHeading: 'Built on small wins' },
    })
    renderCarousel()
    expect(await screen.findByRole('heading', { level: 2, name: 'Built on small wins' })).toBeTruthy()
  })

  it('leaves out an empty subheading instead of drawing an empty paragraph', () => {
    cms.items = [card(1, { subheading: '' })]
    renderCarousel()
    expect(within(slides()[0]).queryByText('Words for card 1')).toBeNull()
    expect(slides()[0].querySelectorAll('p')).toHaveLength(0)
  })

  it('draws no "sources" or "research" wording anywhere', () => {
    renderCarousel()
    expect(screen.queryByText(/sources/i)).toBeNull()
    expect(screen.queryByText(/research/i)).toBeNull()
    expect(screen.queryByText(/backed by/i)).toBeNull()
  })
})

describe('when the category is missing or empty', () => {
  it('draws nothing at all: no heading, no carousel, no dots', () => {
    cms.items = []
    const { container } = renderCarousel()

    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()
    expect(slides()).toHaveLength(0)
    expect(dots(container)).toHaveLength(0)
    expect(container.textContent).toBe('')
  })

  it('does not even read the mascot content', () => {
    cms.items = []
    renderCarousel()
    expect(mascot.calls).toBe(0)
  })
})

describe('pictures', () => {
  it('shows the card’s own picture, with its alt text and a cache-busting suffix', () => {
    renderCarousel()
    const image = within(slides()[0]).getByRole('img') as HTMLImageElement
    expect(image.src).toBe('https://cdn.example.com/card-1.png?v=7')
    expect(image.alt).toBe('Alt for card 1')
  })

  it('does not read the mascot content while every card has its own picture', () => {
    renderCarousel()
    expect(mascot.calls).toBe(0)
  })

  it('shows the mascot instead when image_url is empty, by place in the row', () => {
    cms.items = [1, 2, 3, 4, 5, 6].map((id) => card(id, { image_url: '' }))
    renderCarousel()

    const names = ['wave', 'cheer', 'focus', 'sleep', 'wave', 'cheer']
    slides().forEach((slide, index) => {
      const image = slide.querySelector('img') as HTMLImageElement
      expect(image.src).toBe(`https://cdn.example.com/mascot-${names[index]}.png?v=3`)
      // A decorative picture: no alt text, hidden from screen readers.
      expect(image.getAttribute('alt')).toBe('')
      expect(image.getAttribute('aria-hidden')).toBe('true')
    })
  })

  it('swaps one card to the mascot when its picture fails, and leaves the other cards alone', () => {
    renderCarousel()
    const second = slides()[1]
    fireEvent.error(within(second).getByRole('img'))

    const image = second.querySelector('img') as HTMLImageElement
    expect(image.src).toBe('https://cdn.example.com/mascot-cheer.png?v=3')
    expect(image.getAttribute('aria-hidden')).toBe('true')
    expect((slides()[0].querySelector('img') as HTMLImageElement).src).toBe('https://cdn.example.com/card-1.png?v=7')
    expect((slides()[2].querySelector('img') as HTMLImageElement).src).toBe('https://cdn.example.com/card-3.png?v=7')
  })

  it('draws a plain panel, with no broken picture, when the mascot has no picture either', () => {
    mascot.content = { version: 1, images: {}, messages: [] }
    cms.items = [card(1, { image_url: '' })]
    renderCarousel()
    expect(slides()[0].querySelectorAll('img')).toHaveLength(0)
    expect(within(slides()[0]).getByRole('heading', { level: 3 })).toBeTruthy()
  })

  it('maps the fallback mascot as wave, cheer, focus, sleep and then repeats', () => {
    expect([...FALLBACK_EXPRESSIONS]).toEqual(['wave', 'cheer', 'focus', 'sleep'])
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(fallbackExpression)).toEqual([
      'wave', 'cheer', 'focus', 'sleep', 'wave', 'cheer', 'focus', 'sleep', 'wave',
    ])
  })
})

describe('accessibility', () => {
  it('labels the card with its image_alt, or with its heading when the alt is empty, blank or missing', () => {
    cms.items = [
      card(1, { image_alt: 'A described picture' }),
      card(2, { image_alt: '' }),
      card(3, { image_alt: '   ' }),
      card(4, { image_alt: null }),
    ]
    renderCarousel()
    expect(slides().map((slide) => slide.getAttribute('aria-label'))).toEqual([
      'A described picture',
      'Heading 2',
      'Heading 3',
      'Heading 4',
    ])
  })

  it('makes the track a focusable, labelled carousel region and each card a slide', () => {
    renderCarousel()
    // The wrapping <section> and the track are both labelled regions; the track is the one that scrolls.
    const regions = screen.getAllByRole('region', { name: 'Why it works' })
    expect(regions).toHaveLength(2)
    const track = regions.find((node) => node.getAttribute('aria-roledescription') === 'carousel')!
    expect(track).toBeTruthy()
    expect(track.getAttribute('tabindex')).toBe('0')
    expect(track.getAttribute('aria-label')).toBe('Why it works')
    slides().forEach((slide) => expect(slide.getAttribute('aria-roledescription')).toBe('slide'))
  })

  it('hides the dots from screen readers', () => {
    const { container } = renderCarousel()
    const wrapper = dots(container)[0].parentElement!
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
  })

  it('turns the dot animation off for people who ask for reduced motion', () => {
    const { container } = renderCarousel()
    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
    const dotClass = Array.from(dots(container)[0].classList).find((name) => name.startsWith('css-'))!
    expect(css).toMatch(new RegExp(`@media \\(prefers-reduced-motion: ?reduce\\)\\{\\.${dotClass}\\{(-webkit-transition:none;)?transition:none`))
  })
})

describe('the dots', () => {
  /**
   * jsdom does no layout, so scrolling is simulated: every card reports a position that depends on a pretend
   * scroll offset, and a "scroll" event makes the component measure.
   */
  function simulateLayout() {
    const state = { scrolled: 0 }
    const CARD_STEP = 300
    // The track does not start at the screen edge, so the measure has to account for where it is.
    const TRACK_LEFT = 200
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const inTrack = this.parentElement?.getAttribute('aria-roledescription') === 'carousel'
      if (this.getAttribute('aria-roledescription') === 'carousel') return { left: TRACK_LEFT } as DOMRect
      if (inTrack) {
        const index = Array.from(this.parentElement!.children).indexOf(this)
        const padding = Number.parseFloat(getComputedStyle(this.parentElement!).paddingLeft) || 0
        return { left: TRACK_LEFT + padding + index * CARD_STEP - state.scrolled } as DOMRect
      }
      return { left: 0 } as DOMRect
    })
    return state
  }

  const activeIndex = (container: HTMLElement) => dots(container).findIndex((dot) => dot.getAttribute('data-active') === 'true')
  const track = () => screen.getAllByRole('region').find((node) => node.getAttribute('aria-roledescription') === 'carousel')!

  it('starts with the first dot active, wider than the others', () => {
    const { container } = renderCarousel()
    expect(activeIndex(container)).toBe(0)
    expect(dots(container).filter((dot) => dot.getAttribute('data-active') === 'true')).toHaveLength(1)
  })

  it('moves the active dot to the card that is in front as the row is scrolled', async () => {
    const state = simulateLayout()
    const { container } = renderCarousel()

    state.scrolled = 300
    fireEvent.scroll(track())
    await waitFor(() => expect(activeIndex(container)).toBe(1))

    state.scrolled = 600
    fireEvent.scroll(track())
    await waitFor(() => expect(activeIndex(container)).toBe(2))

    state.scrolled = 0
    fireEvent.scroll(track())
    await waitFor(() => expect(activeIndex(container)).toBe(0))
  })

  it('keeps the active dot in range when cards are removed while the page is open', async () => {
    const state = simulateLayout()
    const view = renderCarousel()
    state.scrolled = 600
    fireEvent.scroll(track())
    await waitFor(() => expect(activeIndex(view.container)).toBe(2))

    cms.items = [card(1)]
    await act(async () => {
      view.rerender(
        <ThemeProvider theme={theme}>
          <LandingCarousel />
        </ThemeProvider>,
      )
    })
    expect(dots(view.container)).toHaveLength(1)
    expect(activeIndex(view.container)).toBe(0)
  })
})

describe('on the landing page', () => {
  it('sits between the description and the sign-in buttons, which are unchanged', () => {
    render(
      <ThemeProvider theme={theme}>
        <LandingScreen />
      </ThemeProvider>,
    )

    const description = screen.getByText(/Pick your gym and a weekly goal/)
    const heading = screen.getByRole('heading', { level: 2, name: 'Why it works' })
    const signUp = screen.getByRole('button', { name: 'Sign up with Google' })
    const signIn = screen.getByRole('button', { name: 'I already have an account' })

    expect(description.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(signUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(signUp.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('leaves the page working, with no carousel, when there are no cards', () => {
    cms.items = []
    render(
      <ThemeProvider theme={theme}>
        <LandingScreen />
      </ThemeProvider>,
    )
    expect(screen.queryByRole('heading', { level: 2, name: 'Why it works' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Why it works' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeTruthy()
  })
})
