import { useCallback, useEffect, useState } from 'react'
import {
  hasPendingQuickStart,
  markQuickStartDone,
  retryPendingQuickStart,
} from '../services/quickStartService'

/**
 * The Quick Start's bookkeeping for the signed-in person.
 *   - On launch it retries a "finished" that the database could not be told about last time. It does this
 *     quietly in the background and never delays or blocks anything.
 *   - `finishPending` says that a finish is waiting to be recorded, so the Quick Start is not shown again
 *     for someone who already finished it (see needsQuickStart in utils/cms.ts).
 *   - `finish()` records the finish. It never rejects; if the database cannot be told, it is remembered and
 *     retried on the next launch.
 *
 * The pending flag is held with the person it belongs to, so switching accounts on a shared device can
 * never show one person's flag to another.
 */
export function useQuickStart(userId: string): { finishPending: boolean; finish: () => Promise<void> } {
  // What this hook has learned during this visit, and for whom. Until it learns something, the browser's
  // own record for this person is the answer (read directly, so there is no flash of the wrong state).
  const [learned, setLearned] = useState<{ userId: string; pending: boolean } | null>(null)
  const finishPending = learned !== null && learned.userId === userId ? learned.pending : hasPendingQuickStart(userId)

  useEffect(() => {
    let cancelled = false
    void retryPendingQuickStart(userId).then((recorded) => {
      // Recorded: nothing is pending any more. Failed again: it stays pending for the next launch.
      if (!cancelled && recorded) setLearned({ userId, pending: false })
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const finish = useCallback(async () => {
    const recorded = await markQuickStartDone(userId)
    setLearned({ userId, pending: !recorded })
  }, [userId])

  return { finishPending, finish }
}
