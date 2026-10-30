import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Loader } from '../../components/Loader'
import { OnboardingStepHeader } from '../../components/OnboardingStepHeader'
import { Toast, type ToastContent } from '../../components/Toast'
import { useGoalState } from '../../hooks/useGoalState'
import { ONBOARDING_STEP_COUNT } from '../../utils/onboardingProgress'
import { GoalPicker } from './GoalPicker'

interface GoalScreenProps {
  /** Go back. */
  onBack: () => void
}

/**
 * Step 3 of 3, "How often will you show up?" The weekly goal screen: the top row (back arrow, a full progress
 * bar, "3 of 3"), the title, the mascot with its bubble, the big number with its caption, the seven buttons and
 * Set goal. There is no tab bar. After saving it stays on screen so the toast can be read and the "changes on
 * Monday" note is visible; Home reloads its numbers when it is shown again.
 *
 * Saving is still `set_weekly_goal` through `useGoalState`, and the screen is still reached the way it was (from
 * Home, with a way back).
 */
export function GoalScreen({ onBack }: GoalScreenProps) {
  const goal = useGoalState()
  const [toast, setToast] = useState<ToastContent | null>(null)

  async function handleSet(days: number) {
    const result = await goal.save(days)
    setToast({ severity: result.ok ? 'success' : 'error', message: result.message })
  }

  return (
    <Container
      component="main"
      maxWidth="sm"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', px: 6, pt: '56px', pb: '28px' }}
    >
      <OnboardingStepHeader step={ONBOARDING_STEP_COUNT} onBack={onBack} />

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

      {goal.status === 'ready' && <GoalPicker goal={goal.goal} onSet={handleSet} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Container>
  )
}
