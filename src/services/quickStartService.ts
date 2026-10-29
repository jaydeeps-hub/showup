import { supabase } from './supabaseClient'

/**
 * Telling the database that the person finished the Quick Start (`complete_quickstart`). This must NEVER get
 * in the way of the person: they have already finished, and if the database cannot be told right now, the app
 * remembers that in the browser and tries again the next time it starts.
 *
 * The reminder is kept per person (a shared device can have several accounts), and is only cleared once the
 * database has confirmed.
 */

export const QUICKSTART_PENDING_KEY_PREFIX = 'showup:quickstart-done-pending:'

export interface PendingStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserStorage(): PendingStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const pendingKey = (userId: string) => `${QUICKSTART_PENDING_KEY_PREFIX}${userId}`

export interface QuickStartDependencies {
  /** Calls `complete_quickstart`. Resolves to true if a profile row was updated, false if none was; rejects on failure. */
  complete: () => Promise<boolean>
  storage: PendingStorage | null
}

export const realQuickStartDependencies: QuickStartDependencies = {
  complete: async () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.rpc('complete_quickstart')
    if (error) throw error
    return data === true
  },
  storage: browserStorage(),
}

/** True if this person finished the Quick Start but the database has not been told yet. */
export function hasPendingQuickStart(userId: string, deps: QuickStartDependencies = realQuickStartDependencies): boolean {
  try {
    return deps.storage?.getItem(pendingKey(userId)) === '1'
  } catch {
    return false
  }
}

function rememberPending(userId: string, deps: QuickStartDependencies): void {
  try {
    deps.storage?.setItem(pendingKey(userId), '1')
  } catch {
    // Storage blocked or full: nothing more can be done. The Quick Start may show once more; that is harmless.
  }
}

function forgetPending(userId: string, deps: QuickStartDependencies): void {
  try {
    deps.storage?.removeItem(pendingKey(userId))
  } catch {
    // Nothing to do.
  }
}

/**
 * Records that the person finished the Quick Start. Resolves to true once the database confirmed, and to
 * false if it did not (in which case it is remembered locally for the next launch). It never rejects and
 * never throws, so a caller can fire it and carry on.
 */
export async function markQuickStartDone(userId: string, deps: QuickStartDependencies = realQuickStartDependencies): Promise<boolean> {
  try {
    const updated = await deps.complete()
    if (updated) {
      forgetPending(userId, deps)
      return true
    }
    // The database answered but changed nothing (no profile row yet): treat it like a failure and try later.
    rememberPending(userId, deps)
    return false
  } catch (error) {
    console.error('Could not record that the Quick Start was finished; will try again next time', error)
    rememberPending(userId, deps)
    return false
  }
}

/**
 * On launch: if a finished Quick Start is waiting to be recorded, try again now. Does nothing otherwise.
 * Like the above, it never throws and never blocks anything.
 */
export async function retryPendingQuickStart(userId: string, deps: QuickStartDependencies = realQuickStartDependencies): Promise<boolean> {
  if (!hasPendingQuickStart(userId, deps)) return false
  return markQuickStartDone(userId, deps)
}
