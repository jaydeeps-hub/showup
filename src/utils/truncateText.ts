/** The longest a gym name may be on Home before it is cut, counting every character including spaces. */
export const GYM_NAME_MAX_CHARACTERS = 25

/** What is added to a name that was cut, to show that the real name is longer. */
export const TRUNCATION_MARK = '...'

/** Splits text into the characters a person sees. Null where the browser has no `Intl.Segmenter`. */
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function charactersOf(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text)
}

/**
 * Shortens `text` for display. A text of `max` characters or fewer is returned as it is. A longer one is cut to `max`
 * characters and `...` is added, so the person can tell the real name is longer. Spaces count as characters.
 *
 * It counts characters as a person sees them (a letter with its accent, a consonant with its vowel sign, an emoji with its
 * skin tone), so a character is never cut in half and never shows as a broken symbol. Where the browser cannot tell
 * (no `Intl.Segmenter`), it counts Unicode characters instead, which is the same for plain letters. Spaces at the end of
 * the cut part are dropped before the dots, so the result reads "Gold's Gym..." and not "Gold's Gym ...".
 *
 * Only what is shown should be shortened: keep the full text for tooltips and screen readers.
 */
export function truncateText(text: string, max: number = GYM_NAME_MAX_CHARACTERS): string {
  const characters = charactersOf(text)
  if (characters.length <= max) return text
  return characters.slice(0, Math.max(0, max)).join('').trimEnd() + TRUNCATION_MARK
}
