/** How many steps onboarding has: details, gym, goal. */
export const ONBOARDING_STEP_COUNT = 3

/** How full the progress bar is, as a whole percentage: 1 of 3 is 33, 2 of 3 is 66, 3 of 3 is 100. */
export function progressPercent(step: number, total: number = ONBOARDING_STEP_COUNT): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.floor((step / total) * 100)))
}
