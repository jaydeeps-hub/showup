import { toSafeImageUrl } from '../utils/imageUrl'
import { supabase } from './supabaseClient'

/**
 * The text and picture on the landing page that can be changed without releasing the app. They live in
 * the Supabase table `config` (renamed from `cms` in Phase 9), as rows of `content_type` and `value`.
 * This is the only file that reads that table for the landing page.
 *
 * It works BEFORE sign-in: the landing page is what a signed-out visitor sees, so the lookup uses the
 * public key only.
 *
 * It never fails the page. If a row is missing, empty, unreadable, or the whole lookup fails (offline,
 * not allowed, not set up), the built-in default is used instead. The newest row for a key wins (a key can
 * have several rows; to change a value, add a new row).
 */

/** The `content_type` names this page reads. They are the same names the table has always used. */
export const LANDING_KEYS = {
  /** The mascot banner: `value` is the image address. */
  banner: 'lpage_banner',
  /** The Terms and Conditions: `value` is Markdown. */
  terms: 'tnc',
  /** The heading above the landing page carousel. */
  carouselHeading: 'landing.carousel_heading',
} as const

/** The banner shown when the table has none (the prototype's picture, shipped with the app). */
export const DEFAULT_BANNER_URL = '/images/landing-banner-default.jpg'
/** The heading above the carousel when the table has none. */
export const DEFAULT_CAROUSEL_HEADING = 'Why it works'
/** The line under the buttons, in plain words. The "Terms" in it opens the Terms and Conditions. */
export const DEFAULT_AGREEMENT_TEXT = 'By continuing you agree to the Terms and Privacy Policy.'

export interface LandingContent {
  /** The address of the banner picture. Always a usable address (the default when the table has none). */
  bannerUrl: string
  /** True when `bannerUrl` came from the table rather than being the built-in picture. */
  bannerFromConfig: boolean
  /** The Terms and Conditions as Markdown, or null when the table has none (there is no built-in Terms text). */
  terms: string | null
  carouselHeading: string
}

/** What the page uses when nothing could be read. */
export const DEFAULT_LANDING_CONTENT: LandingContent = {
  bannerUrl: DEFAULT_BANNER_URL,
  bannerFromConfig: false,
  terms: null,
  carouselHeading: DEFAULT_CAROUSEL_HEADING,
}

interface ConfigRow {
  id: number
  created_at: string | null
  content_type: string
  value: string | null
}

/** The newest non-empty value for each key. Newest means latest `created_at`, then highest `id`. */
export function newestValues(rows: readonly ConfigRow[]): Map<string, string> {
  const newest = new Map<string, ConfigRow>()
  for (const row of rows) {
    const held = newest.get(row.content_type)
    if (!held || isNewer(row, held)) newest.set(row.content_type, row)
  }
  const values = new Map<string, string>()
  for (const [key, row] of newest) {
    const text = row.value?.trim()
    if (text) values.set(key, text)
  }
  return values
}

function isNewer(a: ConfigRow, b: ConfigRow): boolean {
  const timeA = a.created_at ? Date.parse(a.created_at) : NaN
  const timeB = b.created_at ? Date.parse(b.created_at) : NaN
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) return timeA > timeB
  return a.id > b.id
}

/** Turns the rows that were read into the page's content, using the default for anything missing or unusable. */
export function buildLandingContent(rows: readonly ConfigRow[]): LandingContent {
  const values = newestValues(rows)

  const banner = values.get(LANDING_KEYS.banner)
  const safeBanner = banner ? toSafeImageUrl(banner) : null

  return {
    bannerUrl: safeBanner ?? DEFAULT_BANNER_URL,
    bannerFromConfig: safeBanner !== null,
    terms: values.get(LANDING_KEYS.terms) ?? null,
    carouselHeading: values.get(LANDING_KEYS.carouselHeading) ?? DEFAULT_CAROUSEL_HEADING,
  }
}

/**
 * Reads the landing content with ONE request for all three keys. Never throws; any failure gives the
 * defaults, and `failed` says it happened (so the Terms popup can offer a retry rather than claim the
 * Terms do not exist).
 */
export async function fetchLandingContent(): Promise<{ content: LandingContent; failed: boolean }> {
  if (!supabase) return { content: DEFAULT_LANDING_CONTENT, failed: true }

  try {
    const { data, error } = await supabase
      .from('config')
      .select('id, created_at, content_type, value')
      .in('content_type', [LANDING_KEYS.banner, LANDING_KEYS.terms, LANDING_KEYS.carouselHeading])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (error) {
      console.error('Could not load the landing page content', error)
      return { content: DEFAULT_LANDING_CONTENT, failed: true }
    }
    return { content: buildLandingContent((data ?? []) as ConfigRow[]), failed: false }
  } catch (error) {
    console.error('Unexpected error loading the landing page content', error)
    return { content: DEFAULT_LANDING_CONTENT, failed: true }
  }
}
