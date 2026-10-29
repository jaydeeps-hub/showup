// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { CmsItem, MascotContent } from '../../types'

/**
 * The Quick Start screen, using the REAL screen and components. Only the mascot content is faked.
 */

const mascot = vi.hoisted(() => ({ calls: 0, content: null as unknown as MascotContent }))
vi.mock('../../hooks/useMascot', () => ({
  useMascotContent: () => {
    mascot.calls += 1
    return mascot.content
  },
}))

const { QuickStartScreen } = await import('./QuickStartScreen')
const { QUICKSTART_FALLBACK_EXPRESSIONS, quickStartFallbackExpression, quickStartEndingLabel } = await import('../../utils/cms')

function slide(id: number, overrides: Partial<CmsItem> = {}): CmsItem {
  return {
    id,
    slug: `slide-${id}`,
    position: id * 10,
    heading: `Heading ${id}`,
    subheading: `Words for slide ${id}`,
    image_url: `https://cdn.example.com/slide-${id}.png`,
    image_alt: `Alt for slide ${id}`,
    v: 5,
    ...overrides,
  }
}

const EXPRESSIONS = ['smile', 'lift', 'focus', 'cheer', 'wave']
function mascotContent(): MascotContent {
  const images: MascotContent['images'] = {}
  for (const name of EXPRESSIONS) {
    images[name] = { kind: name, url: `https://cdn.example.com/mascot-${name}.png`, alt: null, width: 400, height: 400, v: 3 }
  }
  return { version: 1, images, messages: [] }
}

let items: CmsItem[]
const onFinish = vi.fn()

function renderScreen(lastLabel = 'Done') {
  return render(
    <ThemeProvider theme={theme}>
      <QuickStartScreen items={items} lastLabel={lastLabel} onFinish={onFinish} />
    </ThemeProvider>,
  )
}

// Slides that are not showing are hidden from screen readers on purpose, so they are asked for with `hidden`.
const slides = () => screen.getAllByRole('group', { hidden: true }).filter((node) => node.getAttribute('aria-roledescription') === 'slide')
const carousel = () => screen.getAllByRole('group', { hidden: true }).find((node) => node.getAttribute('aria-roledescription') === 'carousel')!
const dots = (container: HTMLElement) => Array.from(container.querySelectorAll('i[data-active]'))
const activeDot = (container: HTMLElement) => dots(container).findIndex((dot) => dot.getAttribute('data-active') === 'true')
const mainButton = () => screen.getByRole('button', { name: /^(next|done|set up my profile)$/i })
const trackOf = () => slides()[0].parentElement as HTMLElement

/** A sideways drag across the carousel, as a finger or mouse would make it. */
function drag(from: number, to: number) {
  fireEvent.pointerDown(carousel(), { clientX: from })
  fireEvent.pointerUp(carousel(), { clientX: to })
}

beforeEach(() => {
  vi.clearAllMocks()
  items = [slide(1), slide(2), slide(3)]
  mascot.calls = 0
  mascot.content = mascotContent()
})
afterEach(() => cleanup())

describe('the slides', () => {
  it('has one slide and one dot per item, with heading and subheading, in order', () => {
    const { container } = renderScreen()
    expect(slides()).toHaveLength(3)
    expect(dots(container)).toHaveLength(3)
    slides().forEach((node, index) => {
      expect(within(node).getByRole('heading', { level: 2, hidden: true }).textContent).toBe(`Heading ${index + 1}`)
      expect(within(node).getByText(`Words for slide ${index + 1}`)).toBeTruthy()
    })
  })

  it('follows the item count, whatever it is', () => {
    items = [1, 2, 3, 4, 5, 6, 7].map((id) => slide(id))
    const { container } = renderScreen()
    expect(slides()).toHaveLength(7)
    expect(dots(container)).toHaveLength(7)
  })

  it('works with a single slide: no Next, straight to the last button', () => {
    items = [slide(1)]
    const { container } = renderScreen('Set up my profile')
    expect(dots(container)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Set up my profile' })).toBeTruthy()
  })

  it('leaves out an empty subheading', () => {
    items = [slide(1, { subheading: '' })]
    renderScreen()
    expect(slides()[0].querySelectorAll('p')).toHaveLength(0)
  })

  it('shows the brand and a Skip link on top', () => {
    renderScreen()
    // The wordmark's "o" is a drawn shape, so the text around it is "Sh" and "wup".
    expect(screen.getByText((_text, node) => node?.tagName === 'P' && node.textContent === 'Shwup')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
  })
})

describe('pictures', () => {
  it('shows the slide’s own picture with its alt text and a cache-busting suffix', () => {
    renderScreen()
    const image = within(slides()[0]).getByRole('img') as HTMLImageElement
    expect(image.src).toBe('https://cdn.example.com/slide-1.png?v=5')
    expect(image.alt).toBe('Alt for slide 1')
  })

  it('shows the mascot when image_url is empty, by place: smile, lift, focus, cheer, then repeating', () => {
    items = [1, 2, 3, 4, 5, 6].map((id) => slide(id, { image_url: '' }))
    renderScreen()
    const names = ['smile', 'lift', 'focus', 'cheer', 'smile', 'lift']
    slides().forEach((node, index) => {
      const image = node.querySelector('img') as HTMLImageElement
      expect(image.src).toBe(`https://cdn.example.com/mascot-${names[index]}.png?v=3`)
      expect(image.getAttribute('alt')).toBe('')
      expect(image.getAttribute('aria-hidden')).toBe('true')
    })
  })

  it('swaps one slide to the mascot when its picture fails, and leaves the others alone', () => {
    renderScreen()
    fireEvent.error(within(slides()[2]).getByRole('img', { hidden: true }))
    expect((slides()[2].querySelector('img') as HTMLImageElement).src).toBe('https://cdn.example.com/mascot-focus.png?v=3')
    expect((slides()[0].querySelector('img') as HTMLImageElement).src).toBe('https://cdn.example.com/slide-1.png?v=5')
  })

  it('maps the fallback mascot as smile, lift, focus, cheer', () => {
    expect([...QUICKSTART_FALLBACK_EXPRESSIONS]).toEqual(['smile', 'lift', 'focus', 'cheer'])
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(quickStartFallbackExpression)).toEqual([
      'smile', 'lift', 'focus', 'cheer', 'smile', 'lift', 'focus', 'cheer',
    ])
  })
})

describe('the button', () => {
  it('says Next on every slide but the last, then the given last label, and finishes only on the last', async () => {
    const user = userEvent.setup()
    const { container } = renderScreen('Set up my profile')

    expect(mainButton().textContent).toBe('Next')
    await user.click(mainButton())
    expect(activeDot(container)).toBe(1)
    expect(mainButton().textContent).toBe('Next')
    expect(onFinish).not.toHaveBeenCalled()

    await user.click(mainButton())
    expect(activeDot(container)).toBe(2)
    expect(mainButton().textContent).toBe('Set up my profile')
    expect(onFinish).not.toHaveBeenCalled()

    await user.click(mainButton())
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('reports finishing only once, even when pressed twice', async () => {
    items = [slide(1)]
    const user = userEvent.setup()
    renderScreen()
    await user.dblClick(mainButton())
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('Skip finishes straight away, from any slide', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('Skip and the last button together still report once', async () => {
    items = [slide(1)]
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(mainButton())
    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})

describe('swiping', () => {
  it('moves one slide on a swipe longer than 45px, in the swipe direction', () => {
    const { container } = renderScreen()
    drag(300, 240) // left by 60: next
    expect(activeDot(container)).toBe(1)
    drag(100, 200) // right by 100: back
    expect(activeDot(container)).toBe(0)
  })

  it('ignores a drag of 45px or less', () => {
    const { container } = renderScreen()
    drag(300, 255) // exactly 45
    expect(activeDot(container)).toBe(0)
    drag(300, 340)
    expect(activeDot(container)).toBe(0)
  })

  it('does not go past either end', () => {
    const { container } = renderScreen()
    drag(100, 200)
    expect(activeDot(container)).toBe(0)
    drag(300, 100)
    drag(300, 100)
    drag(300, 100)
    drag(300, 100)
    expect(activeDot(container)).toBe(2)
  })

  it('forgets a swipe that was cancelled', () => {
    const { container } = renderScreen()
    fireEvent.pointerDown(carousel(), { clientX: 300 })
    fireEvent.pointerCancel(carousel())
    fireEvent.pointerUp(carousel(), { clientX: 100 })
    expect(activeDot(container)).toBe(0)
  })

  it('does not end the Quick Start by swiping past the last slide', () => {
    renderScreen()
    for (let n = 0; n < 5; n += 1) drag(300, 100)
    expect(onFinish).not.toHaveBeenCalled()
  })

  it('moves the slides with a 0.3s transform, and none of it under reduced motion', () => {
    const { container } = renderScreen()
    drag(300, 100)
    expect(trackOf().style.transform || getComputedStyle(trackOf()).transform).toContain('-100%')
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    expect(css).toMatch(/transition:transform 0\.3s ease/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: ?reduce\)\{\.css-[a-z0-9]+\{(-webkit-transition:none;)?transition:none/)
    expect(dots(container)).toHaveLength(3)
  })

  it('also turns with the arrow keys when the slides are focused', async () => {
    const user = userEvent.setup()
    const { container } = renderScreen()
    carousel().focus()
    await user.keyboard('{ArrowRight}')
    expect(activeDot(container)).toBe(1)
    await user.keyboard('{ArrowLeft}')
    expect(activeDot(container)).toBe(0)
  })
})

describe('accessibility', () => {
  it('hides the slides that are not showing from screen readers, and labels each as "n of total"', () => {
    renderScreen()
    expect(slides().map((node) => node.getAttribute('aria-hidden'))).toEqual(['false', 'true', 'true'])
    expect(slides().map((node) => node.getAttribute('aria-label'))).toEqual(['1 of 3', '2 of 3', '3 of 3'])
    fireEvent.pointerDown(carousel(), { clientX: 300 })
    fireEvent.pointerUp(carousel(), { clientX: 100 })
    expect(slides().map((node) => node.getAttribute('aria-hidden'))).toEqual(['true', 'false', 'true'])
  })

  it('is a labelled section, with a focusable carousel and dots hidden from screen readers', () => {
    const { container } = renderScreen()
    expect(screen.getByRole('region', { name: 'Quick start' })).toBeTruthy()
    expect(carousel().getAttribute('tabindex')).toBe('0')
    expect(dots(container)[0].parentElement!.getAttribute('aria-hidden')).toBe('true')
  })

  it('does not draw a tab bar', () => {
    renderScreen()
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('the last button’s wording', () => {
  it('is "Set up my profile" with no first name, otherwise "Done"', () => {
    expect(quickStartEndingLabel({ firstName: null })).toBe('Set up my profile')
    expect(quickStartEndingLabel({ firstName: '' })).toBe('Set up my profile')
    expect(quickStartEndingLabel({ firstName: '   ' })).toBe('Set up my profile')
    expect(quickStartEndingLabel({ firstName: 'Asha' })).toBe('Done')
  })
})
