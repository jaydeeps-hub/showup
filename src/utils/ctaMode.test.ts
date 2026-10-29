import { describe, expect, it } from 'vitest'
import { chooseCtaMode, type CtaMode, type CtaModeInput } from './ctaMode'

/** The measurements the design was worked out with. */
const BASE = { boxFullH: 206, boxCompactH: 165, carouselBlockH: 455, safeBottom: 0 }

const mode = (viewportH: number, extra: Partial<CtaModeInput> = {}): CtaMode => chooseCtaMode({ ...BASE, viewportH, ...extra })

describe('chooseCtaMode: which mode fits which screen height', () => {
  it.each([
    [568, 'static'],
    [600, 'static'],
    [640, 'static'],
    [667, 'compact'],
    [700, 'full'],
    [740, 'full'],
    [780, 'full'],
    [844, 'full'],
  ] as const)('a %ipx tall screen is %s', (viewportH, expected) => {
    expect(mode(viewportH)).toBe(expected)
  })

  it('switches exactly where the rule says (full from 687, compact from 644)', () => {
    // full needs room: viewportH - 206 - 12 >= 455 + 12  =>  685, and a box of at most 30%: 206 / 0.3  =>  687.
    expect(mode(685)).toBe('compact')
    expect(mode(686)).toBe('compact')
    expect(mode(687)).toBe('full')
    // compact: viewportH - 165 - 12 >= 467  =>  viewportH >= 644
    expect(mode(643)).toBe('static')
    expect(mode(644)).toBe('compact')
  })

  it('also refuses a box taller than 30% of the screen, even with plenty of room', () => {
    // Plenty of room (no carousel), but the box is 40% of the screen.
    expect(mode(500, { carouselBlockH: 0, boxFullH: 200, boxCompactH: 190 })).toBe('static')
    // Full is over 30% (210 > 0.3 * 600), compact is not (150 <= 180): compact.
    expect(mode(600, { carouselBlockH: 0, boxFullH: 210, boxCompactH: 150 })).toBe('compact')
    // Exactly 30% is allowed.
    expect(mode(600, { carouselBlockH: 0, boxFullH: 180, boxCompactH: 150 })).toBe('full')
  })

  it('takes the bottom safe area into account', () => {
    expect(mode(700, { safeBottom: 0 })).toBe('full')
    // 34px home indicator: 700 - 206 - 12 - 34 = 448 < 467, so full no longer fits.
    expect(mode(700, { safeBottom: 34 })).toBe('compact')
  })

  it('floats at once when there is no carousel to protect', () => {
    expect(mode(700, { carouselBlockH: 0 })).toBe('full')
    // Still limited by the 30% rule: 206 is more than 30% of 600, 165 is not.
    expect(mode(600, { carouselBlockH: 0 })).toBe('compact')
  })

  it('uses the measured box height, so a longer Terms text makes it need more room', () => {
    expect(mode(700, { boxFullH: 206 })).toBe('full')
    expect(mode(700, { boxFullH: 240, boxCompactH: 199 })).toBe('compact')
  })
})

describe('chooseCtaMode: landscape and very short screens are always static', () => {
  it('is static in landscape, however tall the screen is', () => {
    expect(mode(844, { isLandscape: true })).toBe('static')
    expect(mode(1200, { isLandscape: true, carouselBlockH: 0 })).toBe('static')
  })

  it('is static under 420px, even with no carousel and a small box', () => {
    expect(mode(419, { carouselBlockH: 0, boxFullH: 100, boxCompactH: 80 })).toBe('static')
    expect(mode(420, { carouselBlockH: 0, boxFullH: 100, boxCompactH: 80 })).toBe('full')
  })

  it('is static in landscape whatever the previous mode was', () => {
    expect(mode(844, { isLandscape: true, prevMode: 'full' })).toBe('static')
  })
})

describe('chooseCtaMode: hysteresis', () => {
  it('drops to a lower mode at once when the rule fails', () => {
    expect(mode(686, { prevMode: 'full' })).toBe('compact')
    expect(mode(643, { prevMode: 'compact' })).toBe('static')
    expect(mode(600, { prevMode: 'full' })).toBe('static')
  })

  it('stays static at 667 and 666 when it was static, because compact has no 24px to spare there', () => {
    expect(mode(667, { prevMode: 'static' })).toBe('static')
    expect(mode(660, { prevMode: 'static' })).toBe('static')
  })

  it('goes up from static to compact only once there is 24px of extra room (668)', () => {
    expect(mode(667, { prevMode: 'static' })).toBe('static')
    expect(mode(668, { prevMode: 'static' })).toBe('compact')
  })

  it('goes up from compact to full only with 24px of extra room (709)', () => {
    expect(mode(687, { prevMode: 'compact' })).toBe('compact')
    expect(mode(708, { prevMode: 'compact' })).toBe('compact')
    expect(mode(709, { prevMode: 'compact' })).toBe('full')
  })

  it('goes straight from static to full when there is room for it (709 and up)', () => {
    expect(mode(709, { prevMode: 'static' })).toBe('full')
    expect(mode(700, { prevMode: 'static' })).toBe('compact')
  })

  it('does not flicker: wobbling around a boundary settles', () => {
    let current: CtaMode = 'full'
    const seen: CtaMode[] = []
    for (const height of [690, 686, 690, 700, 686, 695, 686]) {
      current = mode(height, { prevMode: current })
      seen.push(current)
    }
    // It dropped once at 686 and then needed 709 to come back, which this never reaches.
    expect(seen).toEqual(['full', 'compact', 'compact', 'compact', 'compact', 'compact', 'compact'])
  })

  it('treats a missing or null previous mode as the first decision, with no extra room required', () => {
    expect(mode(667)).toBe('compact')
    expect(mode(667, { prevMode: null })).toBe('compact')
  })

  it('stays where it is when the rule still allows the same mode', () => {
    expect(mode(740, { prevMode: 'full' })).toBe('full')
    expect(mode(660, { prevMode: 'compact' })).toBe('compact')
    expect(mode(560, { prevMode: 'static' })).toBe('static')
  })
})
