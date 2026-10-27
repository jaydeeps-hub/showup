import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { mascotStore } from '../services/mascotStore'
import type { MascotContent, MascotPicture } from '../types'
import { imageFor, pickMascotMessage, type MascotContext, type MascotPick } from '../utils/mascot'

/**
 * The mascot's current content (words and pictures). Reading it never waits: it is what was saved last
 * time, or the bundled words if nothing was. The first component to use it starts the background
 * refresh; after that it refreshes whenever the tab becomes visible again (the store skips the call if
 * the last one was less than 5 minutes ago).
 *
 * Content is shared by the whole app (one store), so several components can use this hook cheaply.
 */
export function useMascotContent(): MascotContent {
  const content = useSyncExternalStore(mascotStore.subscribe, mascotStore.getSnapshot, mascotStore.getSnapshot)

  useEffect(() => {
    void mascotStore.startup()
    function handleVisibility() {
      if (document.visibilityState === 'visible') void mascotStore.onBecameVisible()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return content
}

export interface MascotView {
  /** What the mascot says, or null if nothing fits (cannot normally happen: "in_progress" is always true). */
  pick: MascotPick | null
  /** The picture to draw with it, or null: then the words are shown without a picture. */
  picture: MascotPicture | null
}

/**
 * What the mascot says and shows for this moment. Pass the situation (see MascotContext). The pick is
 * recomputed only when the content or the situation changes.
 */
export function useMascot(context: MascotContext): MascotView {
  const content = useMascotContent()

  return useMemo(() => {
    // With real pictures loaded, a message whose expression has no picture row is skipped. The bundled
    // defaults have no pictures at all, so for those the check is off and the words are still shown.
    const hasPictures = Object.keys(content.images).length > 0
    const known = hasPictures ? new Set(Object.keys(content.images)) : null
    const pick = pickMascotMessage(content.messages, context, known)
    return { pick, picture: pick ? imageFor(content, pick.expression) : null }
    // `context` is a fresh object each render; depend on its fields so the pick is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    content,
    context.goal,
    context.done,
    context.wk,
    context.total,
    context.paused,
    context.engine,
    context.remainingSeconds,
    context.lastOutcome,
    context.almostSeconds,
  ])
}
