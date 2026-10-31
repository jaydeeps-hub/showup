// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../app/theme'
import type { MascotContent, MascotImage } from '../types'

/**
 * The logo beside the "Showup" name: the landing page and Quick Start (through BrandLogo) and the shared header of Pause,
 * Profile and the error screen (through ScreenLayout). The REAL components are used; only the mascot content is faked, so
 * a test chooses what the table holds.
 */

const mascot = vi.hoisted(() => ({ content: null as unknown as MascotContent }))
vi.mock('../hooks/useMascot', () => ({ useMascotContent: () => mascot.content }))

const { BrandMarkImage } = await import('./BrandMarkImage')
const { ScreenLayout } = await import('./ScreenLayout')
const { BrandLogo, BRAND_MARK_SIZE } = await import('../features/landing/BrandMark')
const { logoFrom, LOGO_KEY, imageFor } = await import('../utils/mascot')

const LOGO_URL = 'https://example.supabase.co/storage/v1/object/public/app-assets/brand/logo-white.png'

function image(overrides: Partial<MascotImage> = {}): MascotImage {
  return { kind: 'logo', url: LOGO_URL, alt: 'Showup', width: 100, height: 100, v: 1793016564753, ...overrides }
}
function content(images: Record<string, MascotImage>): MascotContent {
  return { version: 1, images, messages: [] }
}
const smile = (): MascotImage => ({ kind: 'expression', url: 'https://example.supabase.co/smile.png', alt: null, width: 180, height: 250, v: 4 })

const withLogo = () => content({ logo_white: image(), smile: smile() })
const withoutLogo = () => content({ smile: smile() })

function ui(node: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{node}</ThemeProvider>)
}
const logoImage = () => document.querySelector('img') as HTMLImageElement | null
/** The CSS rules MUI made for an element. */
function rulesOf(node: Element) {
  const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
  return Array.from(node.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
}

beforeEach(() => {
  mascot.content = withLogo()
})
afterEach(() => cleanup())

describe('logoFrom: the logo in the table', () => {
  it('reads the logo_white row, with a cache-busting suffix, its size and its alt text', () => {
    expect(LOGO_KEY).toBe('logo_white')
    expect(logoFrom(withLogo())).toEqual({ url: `${LOGO_URL}?v=1793016564753`, width: 100, height: 100, alt: 'Showup' })
  })

  it('uses & when the stored address already has a query', () => {
    expect(logoFrom(content({ logo_white: image({ url: `${LOGO_URL}?token=t` }) }))?.url).toBe(`${LOGO_URL}?token=t&v=1793016564753`)
  })

  it('is null when the table has no logo, and NEVER falls back to another picture (imageFor would give the smile)', () => {
    expect(logoFrom(withoutLogo())).toBeNull()
    expect(imageFor(withoutLogo(), 'logo_white')?.url).toContain('smile') // the helper the logo must not use
  })

  it('is null for an empty address or no pictures at all', () => {
    expect(logoFrom(content({ logo_white: image({ url: '' }) }))).toBeNull()
    expect(logoFrom(content({}))).toBeNull()
  })

  it('ignores the other pictures, even one that looks like a logo', () => {
    expect(logoFrom(content({ logo: image(), avatar: image({ kind: 'avatar' }) }))).toBeNull()
  })
})

describe('BrandMarkImage', () => {
  it('draws the logo at the size it was given, square, so the name beside it never moves', () => {
    ui(<BrandMarkImage size={28} fallback={<span>fallback</span>} />)
    const img = logoImage()!
    expect(img.src).toBe(`${LOGO_URL}?v=1793016564753`)
    expect(img.getAttribute('width')).toBe('28')
    expect(img.getAttribute('height')).toBe('28')
    const rule = rulesOf(img)
    expect(rule).toContain('width:28px')
    expect(rule).toContain('height:28px')
    expect(screen.queryByText('fallback')).toBeNull()
  })

  it('does not let the logo be squashed in a row', () => {
    ui(<BrandMarkImage size={28} fallback={null} />)
    expect(rulesOf(logoImage()!)).toContain('flex-shrink:0')
  })

  it('is decorative: no alt text and hidden from screen readers (the name beside it says "Showup")', () => {
    ui(<BrandMarkImage size={28} fallback={null} />)
    expect(logoImage()!.getAttribute('alt')).toBe('')
    expect(logoImage()!.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws the fallback in its place when the table has no logo', () => {
    mascot.content = withoutLogo()
    ui(<BrandMarkImage size={28} fallback={<span>fallback</span>} />)
    expect(logoImage()).toBeNull()
    expect(screen.getByText('fallback')).toBeTruthy()
  })

  it('draws the fallback, never a broken picture, when the logo address fails to load', () => {
    ui(<BrandMarkImage size={28} fallback={<span>fallback</span>} />)
    fireEvent.error(logoImage()!)
    expect(logoImage()).toBeNull()
    expect(screen.getByText('fallback')).toBeTruthy()
  })

  it('tries a replaced logo again after one failed', () => {
    const view = ui(<BrandMarkImage size={28} fallback={<span>fallback</span>} />)
    fireEvent.error(logoImage()!)
    expect(screen.getByText('fallback')).toBeTruthy()

    mascot.content = content({ logo_white: image({ url: 'https://example.supabase.co/new-logo.png', v: 2 }) })
    view.rerender(
      <ThemeProvider theme={theme}>
        <BrandMarkImage size={28} fallback={<span>fallback</span>} />
      </ThemeProvider>,
    )
    expect(logoImage()!.src).toBe('https://example.supabase.co/new-logo.png?v=2')
    expect(screen.queryByText('fallback')).toBeNull()
  })

  it('uses the logo as soon as the content has one, and the fallback until then', () => {
    mascot.content = withoutLogo()
    const view = ui(<BrandMarkImage size={28} fallback={<span>fallback</span>} />)
    expect(screen.getByText('fallback')).toBeTruthy()
    mascot.content = withLogo()
    view.rerender(
      <ThemeProvider theme={theme}>
        <BrandMarkImage size={28} fallback={<span>fallback</span>} />
      </ThemeProvider>,
    )
    expect(logoImage()).toBeTruthy()
    expect(screen.queryByText('fallback')).toBeNull()
  })
})

describe('the landing page and Quick Start: BrandLogo', () => {
  it('shows the logo at 28x28, the same size as the blue dot it replaces, before the wordmark', () => {
    ui(<BrandLogo />)
    expect(BRAND_MARK_SIZE).toBe(28)
    const img = logoImage()!
    expect(img.getAttribute('width')).toBe('28')
    const wordmark = screen.getByText((_t, node) => node?.tagName === 'P' && node.textContent === 'Shwup')
    expect(Boolean(img.compareDocumentPosition(wordmark) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('shows the blue dot as before when there is no logo', () => {
    mascot.content = withoutLogo()
    ui(<BrandLogo />)
    expect(logoImage()).toBeNull()
    const header = screen.getByText((_t, node) => node?.tagName === 'P' && node.textContent === 'Shwup').parentElement!
    const dot = header.firstElementChild as HTMLElement
    const rule = rulesOf(dot)
    expect(rule).toContain('border-radius:50%')
    expect(rule).toContain('width:28px')
    expect(rule).toContain('background-color:#2B50D9')
  })

  it('keeps the wordmark the same either way', () => {
    const a = ui(<BrandLogo />)
    const withLogoText = a.container.textContent
    a.unmount()
    mascot.content = withoutLogo()
    const b = ui(<BrandLogo />)
    expect(b.container.textContent).toBe(withLogoText)
  })
})

describe('the shared header of Pause, Profile and the error screen: ScreenLayout', () => {
  it('shows the logo at 28x28 before "Showup", instead of the blue square with a tick', () => {
    ui(
      <ScreenLayout>
        <div />
      </ScreenLayout>,
    )
    const img = logoImage()!
    expect(img.getAttribute('width')).toBe('28')
    expect(img.getAttribute('height')).toBe('28')
    expect(document.querySelector('[data-testid="CheckRoundedIcon"]')).toBeNull()
    expect(screen.getByText('Showup')).toBeTruthy()
    expect(Boolean(img.compareDocumentPosition(screen.getByText('Showup')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('shows the blue square with the tick, as before, when there is no logo', () => {
    mascot.content = withoutLogo()
    ui(
      <ScreenLayout>
        <div />
      </ScreenLayout>,
    )
    expect(logoImage()).toBeNull()
    const tick = document.querySelector('[data-testid="CheckRoundedIcon"]') as Element
    expect(tick).toBeTruthy()
    const square = tick.parentElement as HTMLElement
    const rule = rulesOf(square)
    expect(rule).toContain('width:28px')
    expect(rule).toContain('height:28px')
  })

  it('shows the blue square with the tick when the logo fails to load', () => {
    ui(
      <ScreenLayout>
        <div />
      </ScreenLayout>,
    )
    fireEvent.error(logoImage()!)
    expect(logoImage()).toBeNull()
    expect(document.querySelector('[data-testid="CheckRoundedIcon"]')).toBeTruthy()
  })

  it('shows no logo at all on a screen that hides the header (Home)', () => {
    ui(
      <ScreenLayout showBrand={false}>
        <div />
      </ScreenLayout>,
    )
    expect(logoImage()).toBeNull()
    expect(screen.queryByText('Showup')).toBeNull()
  })

  it('still shows the header action on the right', () => {
    ui(
      <ScreenLayout headerAction={<button>Back</button>}>
        <div />
      </ScreenLayout>,
    )
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(logoImage()).toBeTruthy()
  })
})
