/**
 * Keeps the screen awake while a Show Up is running, so the phone does not lock and stop the checks.
 * Every call is wrapped so that a browser without Wake Lock support, a denied request, or a lock the
 * browser took back never causes an error: the feature is a convenience, never a requirement.
 */

type WakeLockSentinelLike = { release: () => Promise<void> }

let sentinel: WakeLockSentinelLike | null = null
/** True while a lock is wanted; lets a lock be asked for again when the page becomes visible. */
let wanted = false
let requesting = false

function wakeLockApi(): { request: (type: 'screen') => Promise<WakeLockSentinelLike> } | null {
  try {
    const api = typeof navigator === 'undefined' ? undefined : (navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock
    return api ?? null
  } catch {
    return null
  }
}

async function request(): Promise<void> {
  const api = wakeLockApi()
  if (!api || sentinel || requesting) return
  requesting = true
  try {
    const lock = await api.request('screen')
    if (wanted) sentinel = lock
    else await lock.release().catch(() => {}) // released while we were asking
  } catch {
    // Not allowed or not supported right now. Ignore.
  } finally {
    requesting = false
  }
}

/** Asks for the screen to stay on. Safe to call repeatedly. */
export function acquireWakeLock(): void {
  wanted = true
  void request()
}

/** The browser drops the lock when the page is hidden, so ask again when it is visible. */
export function reacquireWakeLockIfWanted(): void {
  // The old sentinel (if any) was released by the browser when the page was hidden.
  sentinel = null
  if (wanted) void request()
}

/** Lets the screen sleep again. Safe to call when nothing is held. */
export function releaseWakeLock(): void {
  wanted = false
  const held = sentinel
  sentinel = null
  if (held) void held.release().catch(() => {})
}
