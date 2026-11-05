/**
 * The number on the Squad tab's badge: squad requests waiting for the person's answer. A tiny store outside React, so
 * the ONLY component that re-renders when it changes is the tab bar that reads it (with `useSyncExternalStore`). App,
 * and so Home with its running Show Up timer, never re-renders because the badge changed.
 *
 * Anything that learns a fresh `incoming_count` (the badge's own refresh, or the Squad page after loading or after an
 * action) writes it here.
 */

type Listener = () => void

let incomingCount = 0
const listeners = new Set<Listener>()

export const squadBadgeStore = {
  getSnapshot: (): number => incomingCount,
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** A fresh count (from get_squad). Ignores anything that is not a whole number of zero or more. */
  set(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0 || count === incomingCount) return
    incomingCount = count
    for (const listener of listeners) listener()
  },
}

/** For tests: back to 0, with no listeners. */
export function resetSquadBadgeStore(): void {
  incomingCount = 0
  listeners.clear()
}

/** The badge's text: nothing at 0, the number up to 9, "9+" above. */
export function badgeText(count: number): string | null {
  if (count <= 0) return null
  return count > 9 ? '9+' : String(count)
}

/** What a screen reader hears for the Squad tab: "Squad", "Squad, 1 request", "Squad, 2 requests". */
export function squadTabLabel(count: number): string {
  if (count <= 0) return 'Squad'
  return `Squad, ${count} ${count === 1 ? 'request' : 'requests'}`
}
