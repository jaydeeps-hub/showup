import type { CmsCategory, CmsContent, CmsItem } from '../types'
import { isRecord, toCount } from '../utils/jsonShape'
import { supabase } from './supabaseClient'

/**
 * Reads the cards of the landing carousel and the Quick Start through the database function
 * `get_cms_content`. This is the only file that calls it. (The new `cms` table was created in Phase 9; the
 * old table of the same name is now `config`, see landingContent.ts.) The function works before sign-in.
 *
 * The answer is checked, not trusted: an item that cannot be read is dropped without failing the rest, and
 * at most MAX_ITEMS_PER_CATEGORY items are kept per category, as a safety limit.
 *
 * A category with no active items is MISSING from the answer, and that means it is switched off. This file
 * keeps that meaning: a category that is not in the answer is not in the result either.
 */

/** The most cards one category may show, however many the table has. A safety limit, not a design number. */
export const MAX_ITEMS_PER_CATEGORY = 12

export const CMS_CATEGORIES: readonly CmsCategory[] = ['landing_carousel', 'quick_start']

export type CmsFetchResult = { status: 'ok'; content: CmsContent } | { status: 'error' }

function parseItem(raw: unknown): CmsItem | null {
  if (!isRecord(raw)) return null
  const id = toCount(raw.id)
  const position = typeof raw.position === 'number' && Number.isFinite(raw.position) ? raw.position : null
  if (id === null || position === null || typeof raw.heading !== 'string' || raw.heading.trim() === '') return null
  return {
    id,
    slug: typeof raw.slug === 'string' && raw.slug !== '' ? raw.slug : null,
    position,
    heading: raw.heading,
    subheading: typeof raw.subheading === 'string' ? raw.subheading : '',
    image_url: typeof raw.image_url === 'string' ? raw.image_url.trim() : '',
    image_alt: typeof raw.image_alt === 'string' ? raw.image_alt : null,
    v: typeof raw.v === 'number' && Number.isFinite(raw.v) ? raw.v : 0,
  }
}

/** Orders by position then id, and keeps at most the safety limit. */
export function limitItems(items: readonly CmsItem[]): CmsItem[] {
  return [...items].sort((a, b) => a.position - b.position || a.id - b.id).slice(0, MAX_ITEMS_PER_CATEGORY)
}

/**
 * Turns the database's JSON into CmsContent, or null if it has no version. Categories the app does not know
 * are ignored. A category whose items are all unreadable (or an empty list) is left out, exactly like a
 * category the database left out: it is switched off.
 */
export function parseCmsContent(raw: unknown): CmsContent | null {
  if (!isRecord(raw) || typeof raw.version !== 'string' || raw.version === '') return null

  const categories: Partial<Record<CmsCategory, CmsItem[]>> = {}
  if (isRecord(raw.categories)) {
    for (const category of CMS_CATEGORIES) {
      const list = raw.categories[category]
      if (!Array.isArray(list)) continue
      const items = limitItems(list.map(parseItem).filter((item): item is CmsItem => item !== null))
      if (items.length > 0) categories[category] = items
    }
  }
  return { version: raw.version, categories }
}

/** Loads the carousel and Quick Start content. Never throws. */
export async function fetchCmsContent(): Promise<CmsFetchResult> {
  if (!supabase) return { status: 'error' }
  try {
    const { data, error } = await supabase.rpc('get_cms_content')
    if (error) {
      console.error('Could not load the carousel content', error)
      return { status: 'error' }
    }
    const content = parseCmsContent(data)
    if (!content) {
      console.error('The carousel content had an unexpected shape', data)
      return { status: 'error' }
    }
    return { status: 'ok', content }
  } catch (error) {
    console.error('Unexpected error loading the carousel content', error)
    return { status: 'error' }
  }
}
