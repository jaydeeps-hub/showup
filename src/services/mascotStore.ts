import { DEFAULT_MASCOT_MESSAGES } from '../config/mascotDefaults'
import type { MascotContent } from '../types'
import { fetchMascotContent, parseMascotContent, type MascotFetchResult } from './mascotService'

/**
 * Keeps the mascot's content for the whole app, with "stale while revalidate":
 *   1. Start instantly from what was saved last time (browser storage), or the bundled defaults.
 *   2. Ask the database in the background, on every launch, and again when the tab becomes visible if
 *      the last ask was more than 5 minutes ago.
 *   3. Swap in the new content only when its `version` changed, so the screen does not flicker.
 *   4. If the ask fails, or the answer has no messages, keep what we have.
 *
 * Content is read with `getSnapshot()` / `subscribe()` (React's useSyncExternalStore). Everything it
 * depends on (storage, clock, the fetch) is passed in, so it can be tested without a browser.
 */

export const MASCOT_STORAGE_KEY = 'showup:mascot-content'
/** How old the last ask may be before becoming visible again triggers another. */
export const MASCOT_REFRESH_AFTER_MS = 5 * 60 * 1000

/** What the app shows when nothing has ever been loaded: the bundled words and no pictures. */
export const BUNDLED_MASCOT_CONTENT: MascotContent = {
  version: 0,
  images: {},
  messages: [...DEFAULT_MASCOT_MESSAGES],
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface MascotStoreDependencies {
  fetchContent: (locale: string) => Promise<MascotFetchResult>
  /** Browser storage, or null when it is unavailable (private mode, blocked). */
  storage: StorageLike | null
  now: () => number
  locale?: string
}

export class MascotStore {
  private content: MascotContent
  private listeners = new Set<() => void>()
  private lastFetchAt: number | null = null
  private inFlight: Promise<void> | null = null

  constructor(private readonly deps: MascotStoreDependencies) {
    this.content = this.readSaved() ?? BUNDLED_MASCOT_CONTENT
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): MascotContent => this.content

  /** The saved copy, if there is a usable one. Anything odd (missing, broken, no messages) counts as none. */
  private readSaved(): MascotContent | null {
    try {
      const text = this.deps.storage?.getItem(MASCOT_STORAGE_KEY)
      if (!text) return null
      const parsed = parseMascotContent(JSON.parse(text))
      return parsed && parsed.messages.length > 0 ? parsed : null
    } catch {
      return null
    }
  }

  private save(content: MascotContent): void {
    try {
      this.deps.storage?.setItem(MASCOT_STORAGE_KEY, JSON.stringify(content))
    } catch {
      // Storage full or blocked. The content still works for this visit.
    }
  }

  /**
   * Asks the database now. Two callers at once share one request. Never throws.
   * Returns once the answer (if any) has been applied.
   */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight
    this.inFlight = (async () => {
      try {
        const result = await this.deps.fetchContent(this.deps.locale ?? 'en')
        this.lastFetchAt = this.deps.now()
        if (result.status !== 'ok') return // failed: keep what we have
        const fresh = result.content
        if (fresh.messages.length === 0) return // an empty answer must not wipe good words
        // Same version as what we already show means nothing was edited. The bundled defaults are not a
        // loaded version (they are "version 0" only by convention), so anything real replaces them.
        const showingBundled = this.content === BUNDLED_MASCOT_CONTENT
        if (!showingBundled && fresh.version === this.content.version) return
        this.content = fresh
        this.save(fresh)
        this.listeners.forEach((listener) => listener())
      } finally {
        this.inFlight = null
      }
    })()
    return this.inFlight
  }

  /** On launch: always ask. */
  startup(): Promise<void> {
    return this.refresh()
  }

  /** When the tab becomes visible: ask again only if the last ask is more than 5 minutes old. */
  onBecameVisible(): Promise<void> {
    if (this.lastFetchAt !== null && this.deps.now() - this.lastFetchAt <= MASCOT_REFRESH_AFTER_MS) return Promise.resolve()
    return this.refresh()
  }
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The one store the app uses. */
export const mascotStore = new MascotStore({
  fetchContent: fetchMascotContent,
  storage: browserStorage(),
  now: () => Date.now(),
})
