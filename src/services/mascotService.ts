import type { MascotContent, MascotImage, MascotMessage } from '../types'
import { isRecord, toCount } from '../utils/jsonShape'
import { toSafeImageUrl } from './cmsService'
import { supabase } from './supabaseClient'

/**
 * Reads the mascot's pictures and words through the database function `get_mascot_content`. This is the
 * only file that calls it. The function works before sign-in (the logo shows on the landing page).
 *
 * The answer is checked, not trusted: a row that is unreadable is dropped rather than failing the whole
 * thing, and a picture whose address is not a plain web address is dropped (it comes from a table that
 * is edited by hand, and it ends up in an <img>).
 */

export type MascotFetchResult = { status: 'ok'; content: MascotContent } | { status: 'error' }

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseImage(raw: unknown): MascotImage | null {
  if (!isRecord(raw) || typeof raw.url !== 'string') return null
  const url = toSafeImageUrl(raw.url)
  if (url === null) return null
  return {
    kind: typeof raw.kind === 'string' ? raw.kind : '',
    url,
    alt: typeof raw.alt === 'string' ? raw.alt : null,
    width: toNumberOrNull(raw.width),
    height: toNumberOrNull(raw.height),
    v: toNumberOrNull(raw.v) ?? 0,
  }
}

function parseMessage(raw: unknown): MascotMessage | null {
  if (!isRecord(raw)) return null
  const id = toNumberOrNull(raw.id)
  const priority = toNumberOrNull(raw.priority)
  if (
    id === null ||
    priority === null ||
    typeof raw.key !== 'string' ||
    typeof raw.expression !== 'string' ||
    typeof raw.message !== 'string' ||
    raw.message.trim() === ''
  ) {
    return null
  }
  return {
    id,
    key: raw.key,
    locale: typeof raw.locale === 'string' ? raw.locale : 'en',
    priority,
    expression: raw.expression,
    message: raw.message,
  }
}

/**
 * Turns the database's JSON into MascotContent, or null if it is not an object with a version.
 * Pictures and messages that cannot be read are skipped individually.
 */
export function parseMascotContent(raw: unknown): MascotContent | null {
  if (!isRecord(raw)) return null
  const version = toCount(raw.version)
  if (version === null) return null

  const images: Record<string, MascotImage> = {}
  if (isRecord(raw.images)) {
    for (const [key, value] of Object.entries(raw.images)) {
      const image = parseImage(value)
      if (image) images[key] = image
    }
  }

  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(parseMessage).filter((message): message is MascotMessage => message !== null)
    : []

  return { version, images, messages }
}

/** Loads the mascot content. Never throws. `locale` falls back to English per message on the server. */
export async function fetchMascotContent(locale = 'en'): Promise<MascotFetchResult> {
  if (!supabase) return { status: 'error' }
  try {
    const { data, error } = await supabase.rpc('get_mascot_content', { p_locale: locale })
    if (error) {
      console.error('Could not load the mascot content', error)
      return { status: 'error' }
    }
    const content = parseMascotContent(data)
    if (!content) {
      console.error('The mascot content had an unexpected shape', data)
      return { status: 'error' }
    }
    return { status: 'ok', content }
  } catch (error) {
    console.error('Unexpected error loading the mascot content', error)
    return { status: 'error' }
  }
}
