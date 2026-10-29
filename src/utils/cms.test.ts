import { describe, expect, it } from 'vitest'
import type { CmsContent, CmsItem } from '../types'
import { imageFor, itemsOf, needsQuickStart } from './cms'

const item = (overrides: Partial<CmsItem> = {}): CmsItem => ({
  id: 1,
  slug: 'a',
  position: 10,
  heading: 'H',
  subheading: '',
  image_url: 'https://x.test/a.png',
  image_alt: null,
  v: 123,
  ...overrides,
})

describe('imageFor', () => {
  it('is null when the address is empty (the screen shows a mascot picture instead)', () => {
    expect(imageFor(item({ image_url: '' }))).toBeNull()
  })

  it('is null when the address is only spaces', () => {
    expect(imageFor(item({ image_url: '   ' }))).toBeNull()
  })

  it('adds ?v= from the item to a plain address', () => {
    expect(imageFor(item({ image_url: 'https://x.test/a.png', v: 123 }))).toBe('https://x.test/a.png?v=123')
  })

  it('adds &v= when the address already has a query', () => {
    expect(imageFor(item({ image_url: 'https://x.test/a.png?token=abc', v: 456 }))).toBe('https://x.test/a.png?token=abc&v=456')
  })

  it('uses the item\'s own v, so a changed picture gets a new address', () => {
    expect(imageFor(item({ v: 1 }))).not.toBe(imageFor(item({ v: 2 })))
  })

  it('works with the real Supabase storage addresses', () => {
    const url = 'https://rjhvjnqtzbpkvcdouqxf.supabase.co/storage/v1/object/public/app-assets/quick_start/add-gym.png'
    expect(imageFor(item({ image_url: url, v: 1793260648466 }))).toBe(`${url}?v=1793260648466`)
  })

  it('trims spaces around the address', () => {
    expect(imageFor(item({ image_url: '  https://x.test/a.png  ', v: 5 }))).toBe('https://x.test/a.png?v=5')
  })
})

describe('itemsOf', () => {
  const content: CmsContent = { version: '1-1', categories: { quick_start: [item({ id: 7 })] } }

  it('returns the cards of a category that is on', () => {
    expect(itemsOf(content, 'quick_start').map((i) => i.id)).toEqual([7])
  })

  it('returns an empty list for a category that is switched off (missing)', () => {
    expect(itemsOf(content, 'landing_carousel')).toEqual([])
  })
})

describe('needsQuickStart', () => {
  const cards = [item({ id: 1 }), item({ id: 2 })]

  it('is true: not finished, and the Quick Start has cards', () => {
    expect(needsQuickStart({ quickstartCompletedAt: null }, cards)).toBe(true)
  })

  it('is false: not finished, but the Quick Start has no cards (it is switched off)', () => {
    expect(needsQuickStart({ quickstartCompletedAt: null }, [])).toBe(false)
  })

  it('is false: finished, and the Quick Start has cards', () => {
    expect(needsQuickStart({ quickstartCompletedAt: '2026-10-28T09:30:00+00:00' }, cards)).toBe(false)
  })

  it('is false: finished, and no cards', () => {
    expect(needsQuickStart({ quickstartCompletedAt: '2026-10-28T09:30:00+00:00' }, [])).toBe(false)
  })

  it('one card is enough', () => {
    expect(needsQuickStart({ quickstartCompletedAt: null }, [item()])).toBe(true)
  })

  it('is false while a finish is waiting to be recorded, so a person who finished is not sent back', () => {
    expect(needsQuickStart({ quickstartCompletedAt: null }, cards, true)).toBe(false)
  })

  it('a pending finish does not matter if there are no cards or it is already recorded', () => {
    expect(needsQuickStart({ quickstartCompletedAt: null }, [], true)).toBe(false)
    expect(needsQuickStart({ quickstartCompletedAt: 'x' }, cards, true)).toBe(false)
  })

  it('decides from the timestamp being null, not from it being "falsy" text', () => {
    // An empty string cannot reach here (the profile service turns it into null); a real timestamp always counts as finished.
    expect(needsQuickStart({ quickstartCompletedAt: '1970-01-01T00:00:00Z' }, cards)).toBe(false)
  })
})
