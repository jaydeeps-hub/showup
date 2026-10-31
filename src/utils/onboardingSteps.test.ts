import { describe, expect, it } from 'vitest'
import { firstOnboardingStep, nextOnboardingStep, previousOnboardingStep, type OnboardingStep } from './onboardingSteps'

describe('where onboarding starts', () => {
  it('step 1 when the names are missing, whether or not there is a gym', () => {
    expect(firstOnboardingStep({ hasNames: false, hasGym: false })).toBe(1)
    expect(firstOnboardingStep({ hasNames: false, hasGym: true })).toBe(1)
  })

  it('step 2 when the names are saved but there is no gym yet (a refresh half-way)', () => {
    expect(firstOnboardingStep({ hasNames: true, hasGym: false })).toBe(2)
  })

  it('not at all when the names and the gym are both saved: the goal is optional and has its button on Home', () => {
    expect(firstOnboardingStep({ hasNames: true, hasGym: true })).toBeNull()
  })
})

describe('moving between steps', () => {
  const steps: OnboardingStep[] = [1, 2, 3]

  it('forward goes 1 to 2 to 3, and ends after 3', () => {
    expect(steps.map(nextOnboardingStep)).toEqual([2, 3, null])
  })

  it('back goes 3 to 2 to 1, and there is nothing before 1', () => {
    expect(steps.map(previousOnboardingStep)).toEqual([null, 1, 2])
  })

  it('forward then back returns to the same step', () => {
    expect(previousOnboardingStep(nextOnboardingStep(1)!)).toBe(1)
    expect(previousOnboardingStep(nextOnboardingStep(2)!)).toBe(2)
  })
})
