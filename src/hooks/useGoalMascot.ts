import { useMemo } from 'react'
import { usePreloadMascotImages } from '../components/usePreloadMascotImages'
import type { MascotContent, MascotPicture } from '../types'
import { imageFor, pickGoalMascotMessage } from '../utils/mascot'
import { useMascotContent } from './useMascot'

export interface GoalMascotView {
  /** The loaded mascot content (or the bundled words with no pictures, if nothing has loaded). */
  content: MascotContent
  /** The face for the selected number, or null: the bubble is then drawn without a picture. */
  picture: MascotPicture | null
  /** The bubble's words, or null if no row qualifies (a number outside 1 to 7). */
  text: string | null
  /** The caption under the big number (the row's `label`), or null if the row has none. */
  label: string | null
}

/**
 * What the mascot shows on the goal screen for the selected number of days: the face, the bubble and the caption
 * under the big number, all from the `goal_N` row (see pickGoalMascotMessage). If the mascot content has not
 * loaded, or has no goal rows, the bundled goal rows are used, so there is always something to say. The pictures
 * are fetched ahead so changing the number does not flicker.
 */
export function useGoalMascot(selectedDays: number): GoalMascotView {
  const content = useMascotContent()
  usePreloadMascotImages(content)

  return useMemo(() => {
    // With real pictures loaded, a row whose expression has no picture is skipped. The bundled words have no
    // pictures, so for those the check is off and the words are still shown.
    const known = Object.keys(content.images).length > 0 ? new Set(Object.keys(content.images)) : null
    const pick = pickGoalMascotMessage(content.messages, selectedDays, known)
    return {
      content,
      picture: pick ? imageFor(content, pick.expression) : null,
      text: pick ? pick.text : null,
      label: pick?.label ?? null,
    }
  }, [content, selectedDays])
}
