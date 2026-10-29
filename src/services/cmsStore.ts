import { DEFAULT_CMS_CONTENT } from '../config/cmsDefaults'
import type { CmsContent } from '../types'
import { fetchCmsContent, parseCmsContent, type CmsFetchResult } from './cmsService'

/**
 * Keeps the landing carousel and Quick Start content for the whole app, with "stale while revalidate"
 * (the same pattern as the mascot):
 *   1. Start instantly from what was saved last time (browser storage), or the bundled starting content.
 *   2. Ask the database in the background, on every launch, and again when the tab becomes visible if the
 *      last ask was more than 5 minutes ago.
 *   3. Swap in the answer whenever its `version` DIFFERS from what is showing (not "is newer": any change).
 *   4. If the ask fails, keep what we have.
 *
 * Two rules that differ from the mascot, because of what this content means:
 *   - A SUCCESSFUL answer that leaves a category out means that category is switched off. It is applied as
 *     it is: the bundled starting content is NOT used to fill the gap. Even an answer with no categories at
 *     all is real (everything is switched off) and replaces what was showing.
 *   - The bundled starting content is only ever used when nothing has been fetched or saved AND no ask has
 *     succeeded yet. After one success, a later failure keeps the last good content, never the bundled one.
 *
 * Everything it depends on (storage, clock, the fetch) is passed in, so it can be tested without a browser.
 */

export const CMS_STORAGE_KEY = 'showup:cms-content'
/** How old the last ask may be before becoming visible again triggers another. */
export const CMS_REFRESH_AFTER_MS = 5 * 60 * 1000

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface CmsStoreDependencies {
  fetchContent: () => Promise<CmsFetchResult>
  /** Browser storage, or null when it is unavailable (private mode, blocked). */
  storage: StorageLike | null
  now: () => number
}

export class CmsStore {
  private content: CmsContent
  private listeners = new Set<() => void>()
  private lastFetchAt: number | null = null
  private inFlight: Promise<void> | null = null

  constructor(private readonly deps: CmsStoreDependencies) {
    this.content = this.readSaved() ?? DEFAULT_CMS_CONTENT
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): CmsContent => this.content

  /** The saved copy, if there is a usable one. Anything odd (missing, broken, no version) counts as none. */
  private readSaved(): CmsContent | null {
    try {
      const text = this.deps.storage?.getItem(CMS_STORAGE_KEY)
      if (!text) return null
      return parseCmsContent(JSON.parse(text))
    } catch {
      return null
    }
  }

  private save(content: CmsContent): void {
    try {
      this.deps.storage?.setItem(CMS_STORAGE_KEY, JSON.stringify(content))
    } catch {
      // Storage full or blocked. The content still works for this visit.
    }
  }

  /** Asks the database now. Two callers at once share one request. Never throws. */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight
    this.inFlight = (async () => {
      try {
        const result = await this.deps.fetchContent()
        this.lastFetchAt = this.deps.now()
        if (result.status !== 'ok') return // failed: keep what we have (saved copy, or the bundled content)
        // Same version as what is showing means nothing was edited. The bundled content has its own marker
        // version, which no real answer can have, so any real answer replaces it.
        if (result.content.version === this.content.version) return
        this.content = result.content
        this.save(result.content)
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
    if (this.lastFetchAt !== null && this.deps.now() - this.lastFetchAt <= CMS_REFRESH_AFTER_MS) return Promise.resolve()
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
export const cmsStore = new CmsStore({
  fetchContent: fetchCmsContent,
  storage: browserStorage(),
  now: () => Date.now(),
})
