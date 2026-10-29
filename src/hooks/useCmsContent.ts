import { useEffect, useSyncExternalStore } from 'react'
import { cmsStore } from '../services/cmsStore'
import type { CmsContent, CmsItem } from '../types'
import { itemsOf } from '../utils/cms'

/**
 * The content of the landing carousel and the Quick Start (words, pictures). Reading it never waits: it is
 * what was saved last time, or the bundled starting content if nothing was. The first component to use it
 * starts the background refresh; after that it refreshes whenever the tab becomes visible again (the store
 * skips the call if the last one was less than 5 minutes ago).
 *
 * It works before sign-in, so the landing page can use it. The content is shared by the whole app (one
 * store), so several components can use this hook cheaply.
 */
export function useCmsContent(): CmsContent {
  const content = useSyncExternalStore(cmsStore.subscribe, cmsStore.getSnapshot, cmsStore.getSnapshot)

  useEffect(() => {
    void cmsStore.startup()
    function handleVisibility() {
      if (document.visibilityState === 'visible') void cmsStore.onBecameVisible()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return content
}

/** The cards of the landing carousel, in order. Empty means the carousel is switched off. */
export function useLandingCarouselItems(): readonly CmsItem[] {
  return itemsOf(useCmsContent(), 'landing_carousel')
}

/** The cards of the Quick Start, in order. Empty means the Quick Start is switched off. */
export function useQuickStartItems(): readonly CmsItem[] {
  return itemsOf(useCmsContent(), 'quick_start')
}
