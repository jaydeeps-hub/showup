import { supabase } from './supabaseClient'

/**
 * Reads landing-page content from the Supabase `public.cms` table. This is the only file that
 * queries that table. Each entry is found by BOTH its `id` and its `content_type`, so a row that
 * was edited to a different type is never shown by mistake.
 *
 * Nothing here is hardcoded as a fallback: if the content cannot be read, the caller shows an
 * honest "unavailable" state instead of made-up content.
 */

/** The CMS entries the landing page uses. */
export const CMS_ENTRIES = {
  /** The mascot banner: `value` is the image URL. */
  landingBanner: { id: 1, contentType: 'lpage_banner' },
  /** The Terms and Conditions: `value` is Markdown. */
  termsAndConditions: { id: 2, contentType: 'tnc' },
} as const

export type CmsEntry = (typeof CMS_ENTRIES)[keyof typeof CMS_ENTRIES]

export type CmsResult =
  | { status: 'found'; value: string }
  /** The query worked but there is no such row (or the visitor is not allowed to see it). */
  | { status: 'not-found' }
  | { status: 'error'; message: string }

interface CmsRow {
  value: string | null
}

/** Loads the `value` of one CMS entry. */
export async function fetchCmsValue(entry: CmsEntry): Promise<CmsResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }

  try {
    const { data, error } = await supabase
      .from('cms')
      .select('value')
      .eq('id', entry.id)
      .eq('content_type', entry.contentType)
      .limit(1)
      .maybeSingle<CmsRow>()

    if (error) {
      console.error(`Could not load the "${entry.contentType}" content`, error)
      return { status: 'error', message: error.message }
    }
    const value = data?.value?.trim()
    return value ? { status: 'found', value } : { status: 'not-found' }
  } catch (error) {
    console.error(`Unexpected error loading the "${entry.contentType}" content`, error)
    return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error.' }
  }
}

/**
 * The image URL must be a normal web address. The value comes from a database table, so it is
 * checked before it is put in an <img>: only https (or http for local testing) is accepted, never
 * `javascript:` or `data:` addresses.
 */
export function toSafeImageUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
