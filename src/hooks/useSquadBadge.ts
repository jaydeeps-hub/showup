import { useEffect, useSyncExternalStore } from 'react'
import { squadBadgeStore } from '../services/squadBadgeStore'
import { getSquad } from '../services/squadService'

/** The badge's number, read without re-rendering anything else when it changes. */
export function useSquadBadgeCount(): number {
  return useSyncExternalStore(squadBadgeStore.subscribe, squadBadgeStore.getSnapshot, squadBadgeStore.getSnapshot)
}

/** Asks the database for the latest count and puts it in the badge store. A failure leaves the badge as it was. */
export async function refreshSquadBadge(): Promise<void> {
  try {
    const result = await getSquad()
    if (result.status === 'ok') squadBadgeStore.set(result.squad.incomingCount)
  } catch {
    // The badge is a hint, not the page itself; it simply keeps the last good count.
  }
}

/**
 * Keeps the badge fresh while the app is open: once when it opens, and again whenever the page becomes visible after
 * being hidden. It renders nothing and returns nothing, so the component that runs it never re-renders because of it.
 */
export function useSquadBadgeRefresh(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    void refreshSquadBadge()
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void refreshSquadBadge()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible)
  }, [enabled])
}
