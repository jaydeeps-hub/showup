import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { Loader } from '../../components/Loader'
import { OnboardingStepHeader } from '../../components/OnboardingStepHeader'
import { Toast, type ToastContent } from '../../components/Toast'
import { useGoalState } from '../../hooks/useGoalState'
import { ONBOARDING_STEP_COUNT } from '../../utils/onboardingProgress'
import { GoalPicker } from './GoalPicker'

/** How long the screen stays after a goal is saved in onboarding, so the message can be read, in milliseconds. */
export const GOAL_SAVED_PAUSE_MS = 700

interface GoalScreenProps {
  /**
   * `onboarding`: step 3 of 3, with the progress bar, "3 of 3" and a "Skip for now" button; it moves on by itself after a
   * save. `standalone` (the default): opened from Home, with only a way back; it stays on screen after a save.
   */
  mode?: 'onboarding' | 'standalone'
  /** Go back. */
  onBack: () => void
  /**
   * Given when this is step 3 of onboarding. After a successful save the message is handed to this (the app shows it,
   * so it outlasts this screen) instead of being shown here, and `onDone` is called after a short pause.
   */
  onSaved?: (message: string) => void
  /** Onboarding only: move on once the goal is saved. */
  onDone?: () => void
  /**
   * Onboarding only: the person chose to skip setting a goal (after the sheet that encourages them to set one). Nothing
   * is saved; the app moves on. Its presence is also what shows the "Skip for now" button.
   */
  onSkip?: () => void
}

/**
 * "How often will you show up?" The weekly goal screen: the top row (back arrow, and in onboarding a full progress
 * bar and "3 of 3"), the title, the mascot with its bubble, the big number with its caption, the seven buttons and
 * Set goal, and in onboarding a "Skip for now" button that asks first. There is no tab bar. Opened from Home, after
 * saving it stays on screen so the toast can be read and the "changes on Monday" note is visible; Home reloads its
 * numbers when it is shown again.
 *
 * Saving is still `set_weekly_goal` through `useGoalState`. It is reached from Home (with a way back) or as step 3 of
 * onboarding (with `onSaved` and `onDone`, which move on after a save).
 */
export function GoalScreen({ mode = 'standalone', onBack, onSaved, onDone, onSkip }: GoalScreenProps) {
  // Opened from Home it is not a step of anything: no progress bar and no "3 of 3", just a way back.
  const isOnboarding = mode === 'onboarding'
  const goal = useGoalState()
  const [toast, setToast] = useState<ToastContent | null>(null)
  // True from a successful save in onboarding until the screen has moved on: nothing can be pressed meanwhile.
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function handleSet(days: number) {
    if (leaving) return
    const result = await goal.save(days)
    if (result.ok && isOnboarding && onSaved) {
      // Onboarding: the app shows the message, and after a moment this step is over.
      setLeaving(true)
      onSaved(result.message)
      timer.current = setTimeout(() => onDone?.(), GOAL_SAVED_PAUSE_MS)
      return
    }
    setToast({ severity: result.ok ? 'success' : 'error', message: result.message })
  }

  return (
    <Container
      component="main"
      maxWidth="sm"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', px: 6, pt: '56px', pb: '28px' }}
    >
      {/* The arrow is off while the goal is being saved or has just been saved, so the screen cannot be left half-way. */}
      <OnboardingStepHeader step={ONBOARDING_STEP_COUNT} onBack={leaving ? undefined : onBack} hideProgress={!isOnboarding} />

      <Typography variant="h1" component="h1" sx={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.01em', m: '0 0 8px' }}>
        How often will you show up?
      </Typography>

      {goal.status === 'loading' && (
        <Typography
          role="status"
          component="div"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, py: 10, color: 'text.secondary' }}
        >
          <Loader />
          <span>Loading your goal…</span>
        </Typography>
      )}

      {goal.status === 'error' && (
        <Alert
          severity="error"
          sx={{ mt: 6 }}
          action={
            <Button color="inherit" size="small" onClick={goal.retry}>
              Retry
            </Button>
          }
        >
          {goal.message}
        </Alert>
      )}

      {goal.status === 'ready' && <GoalPicker goal={goal.goal} onSet={handleSet} onSkip={isOnboarding ? onSkip : undefined} locked={leaving} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Container>
  )
}
