/**
 * How the sign-in box on the landing page is shown:
 *   - `full`: floating at the bottom of the screen, with its "Get started today." heading.
 *   - `compact`: floating, without the heading and with slightly smaller buttons.
 *   - `static`: not floating; it sits at the end of the page like any other block.
 *
 * It floats only when the carousel above it still fits on screen with it, so the box never covers the cards.
 * Pure: the screen measures things and this decides.
 */
export type CtaMode = 'full' | 'compact' | 'static'

export interface CtaModeInput {
  /** The visible viewport's height in pixels (not the screen's). */
  viewportH: number
  /** The box's real height in full mode, measured from the rendered box. */
  boxFullH: number
  /** The box's real height in compact mode, measured from the rendered box. */
  boxCompactH: number
  /** From the top of the heading above the carousel to the bottom of the dots. 0 when there is no carousel. */
  carouselBlockH: number
  /** The bottom safe-area inset (the home indicator), in pixels. */
  safeBottom: number
  /** The mode shown until now, for hysteresis. Leave out (or null) the first time. */
  prevMode?: CtaMode | null
  /** True when the screen is wider than it is tall. A landscape screen never floats the box. */
  isLandscape?: boolean
}

/** The gap kept between the floating box and the bottom edge of the screen. */
export const CTA_BOTTOM_GAP = 12
/** The gap kept between the carousel block and the floating box. */
export const CTA_CAROUSEL_GAP = 12
/** The most of the screen's height a floating box may take. */
export const CTA_MAX_HEIGHT_SHARE = 0.3
/** Below this height the screen is too short to float anything. */
export const CTA_MIN_VIEWPORT_H = 420
/** Extra room needed before the box may go back UP to a larger mode, so it does not flicker at the edge. */
export const CTA_HYSTERESIS = 24

const RANK: Record<CtaMode, number> = { static: 0, compact: 1, full: 2 }

/**
 * A box of height `boxH` may float if the carousel block still fits above it (with `extraRoom` to spare)
 * AND the box is not more than 30% of the screen.
 */
function floats(input: CtaModeInput, boxH: number, extraRoom: number): boolean {
  const room = input.viewportH - boxH - CTA_BOTTOM_GAP - input.safeBottom
  return room >= input.carouselBlockH + CTA_CAROUSEL_GAP + extraRoom && boxH <= CTA_MAX_HEIGHT_SHARE * input.viewportH
}

function best(input: CtaModeInput, extraRoom: number, above: number): CtaMode {
  if (RANK.full > above && floats(input, input.boxFullH, extraRoom)) return 'full'
  if (RANK.compact > above && floats(input, input.boxCompactH, extraRoom)) return 'compact'
  return 'static'
}

/**
 * Chooses the mode: full first, then compact, otherwise static. A landscape screen, or one under 420px tall, is
 * always static.
 *
 * Hysteresis: when the rule stops holding the box drops to the lower mode at once. It only moves back UP when
 * the rule holds with 24px of extra room. Otherwise it stays where it is.
 */
export function chooseCtaMode(input: CtaModeInput): CtaMode {
  if (input.isLandscape || input.viewportH < CTA_MIN_VIEWPORT_H) return 'static'

  const plain = best(input, 0, -1)
  const prev = input.prevMode
  if (prev == null || RANK[plain] <= RANK[prev]) return plain

  // The rule allows a bigger mode than the one showing. Go up only to a mode that also passes with room to spare.
  const confirmed = best(input, CTA_HYSTERESIS, RANK[prev])
  return RANK[confirmed] > RANK[prev] ? confirmed : prev
}
