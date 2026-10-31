/**
 * The three steps of onboarding, in order: 1 details ("What should we call you?"), 2 add gym, 3 weekly goal.
 *
 * Where a person STARTS is worked out from what is already stored, so a refresh or a later visit resumes in the right
 * place. While they are going through it, which step is showing is held in memory, so the Back arrow can return to a
 * step whose information is already saved (the names are saved by step 2, but step 1 can still be shown again).
 */
export type OnboardingStep = 1 | 2 | 3

/** What the app knows about the person when it decides where onboarding starts. */
export interface OnboardingFacts {
  /** The profile has both a first and a last name. */
  hasNames: boolean
  /** The person has an active gym. */
  hasGym: boolean
}

/**
 * The step to start on, or null when there is nothing left to do (names and gym are both saved, so the person goes
 * to Home; the weekly goal is optional and has its own button there).
 */
export function firstOnboardingStep({ hasNames, hasGym }: OnboardingFacts): OnboardingStep | null {
  if (!hasNames) return 1
  if (!hasGym) return 2
  return null
}

/** The step after this one, or null after the last (onboarding is finished). */
export function nextOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  return step === 1 ? 2 : step === 2 ? 3 : null
}

/** The step before this one, or null on the first (there is nothing to go back to). */
export function previousOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  return step === 3 ? 2 : step === 2 ? 1 : null
}
