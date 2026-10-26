import { useEffect, useRef, useState } from 'react'
import { showupMessage } from '../config/messages'
import { useShowupSession } from '../hooks/showupSessionContext'
import { fetchHomeSummary } from '../services/homeSummaryService'
import type { ShowupEvent } from '../services/showupEngine'
import { Toast, type ToastContent } from './Toast'

/**
 * Tells the user what happened with their Show Up, once, whichever tab they are on (a timed visit can
 * finish minutes after they left Home). It sits inside the ShowupProvider, reads the engine's one-shot
 * event, turns it into text with `showupMessage`, shows it in the shared toast and then clears it.
 *
 * For a finished visit it first asks the database for the new total, so the message can say
 * "Showup #N". If that lookup fails the plain message is shown instead; it never blocks the message.
 */
export function ShowupFeedback() {
  const { event, clearEvent } = useShowupSession()
  const [toast, setToast] = useState<ToastContent | null>(null)
  // The id of the last event handled, so one event is never shown twice (StrictMode runs effects twice).
  const handledId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!event || event.id === handledId.current) return
    handledId.current = event.id
    clearEvent() // the event has been taken; the next one can arrive while a total is being looked up
    void show(event)

    async function show(taken: ShowupEvent) {
      let total: number | null = null
      if (taken.type === 'completed' && taken.recorded !== false) {
        const summary = await fetchHomeSummary()
        if (summary.status === 'ok') total = summary.summary.totalShowups
      }
      if (mounted.current) setToast(showupMessage(taken, total))
    }
  }, [event, clearEvent])

  return <Toast toast={toast} onClose={() => setToast(null)} aboveTabBar />
}
