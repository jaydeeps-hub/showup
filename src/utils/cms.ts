import type { CmsContent, CmsItem, Profile } from '../types'
import { withCacheBuster } from './mascot'

/**
 * Small pure helpers over the carousel and Quick Start content. No React, no network.
 */

/**
 * The picture for a card, or null when it has none (an empty address): the screen then shows a mascot
 * picture instead. The address gets `?v=<v>` (or `&v=<v>` when it already has a query) so a picture that was
 * changed in the table is fetched again instead of coming from the browser's cache.
 */
export function imageFor(item: Pick<CmsItem, 'image_url' | 'v'>): string | null {
  const url = item.image_url.trim()
  return url === '' ? null : withCacheBuster(url, item.v)
}

/** The cards of a category, in order. An empty list means the category is switched off (or has no cards). */
export function itemsOf(content: CmsContent, category: 'landing_carousel' | 'quick_start'): readonly CmsItem[] {
  return content.categories[category] ?? []
}

/**
 * Whether to show the Quick Start to this person: they have not finished it, AND it has at least one card.
 * With no active Quick Start cards the feature is switched off, so nobody is sent to an empty screen.
 *
 * `finishPending` is true when the person DID finish but the database could not be told yet (see
 * quickStartService.ts). They must not be shown it again while that is waiting to be retried.
 */
export function needsQuickStart(
  profile: Pick<Profile, 'quickstartCompletedAt'>,
  quickStartItems: readonly CmsItem[],
  finishPending = false,
): boolean {
  return profile.quickstartCompletedAt === null && !finishPending && quickStartItems.length > 0
}

/** The mascot shown on a carousel card that has no picture of its own, picked by the card's place in the row. */
export const FALLBACK_EXPRESSIONS = ['wave', 'cheer', 'focus', 'sleep'] as const

export function fallbackExpression(index: number): (typeof FALLBACK_EXPRESSIONS)[number] {
  return FALLBACK_EXPRESSIONS[index % FALLBACK_EXPRESSIONS.length]
}

/** The mascot shown on a Quick Start slide that has no picture of its own, picked by the slide's place. */
export const QUICKSTART_FALLBACK_EXPRESSIONS = ['smile', 'lift', 'focus', 'cheer'] as const

export function quickStartFallbackExpression(index: number): (typeof QUICKSTART_FALLBACK_EXPRESSIONS)[number] {
  return QUICKSTART_FALLBACK_EXPRESSIONS[index % QUICKSTART_FALLBACK_EXPRESSIONS.length]
}

/**
 * What the last Quick Start button says when the person is shown it automatically: "Set up my profile" if
 * they have not set up their profile yet (no first name), otherwise "Done". Opened from Profile it is always
 * "Done".
 */
export function quickStartEndingLabel(profile: Pick<Profile, 'firstName'>): 'Set up my profile' | 'Done' {
  return (profile.firstName ?? '').trim() === '' ? 'Set up my profile' : 'Done'
}
