import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ScreenLayout } from '../../components/ScreenLayout'
import { Toast, type ToastContent } from '../../components/Toast'
import { useGoalState } from '../../hooks/useGoalState'
import { GoalPicker } from './GoalPicker'

interface GoalScreenProps {
  /** Go back. Omitted when this screen is a required step. */
  onBack?: () => void
}

/**
 * "How often will you show up?" The weekly goal screen. After saving it stays on screen so the toast
 * can be read and the "changes on Monday" note is visible; Home reloads its numbers when it is shown again.
 */
export function GoalScreen({ onBack }: GoalScreenProps) {
  const goal = useGoalState()
  const [toast, setToast] = useState<ToastContent | null>(null)

  async function handleSet(days: number) {
    const result = await goal.save(days)
    setToast({ severity: result.ok ? 'success' : 'error', message: result.message })
  }

  return (
    <ScreenLayout
      headerAction={
        onBack ? (
          <Button size="small" color="inherit" startIcon={<ArrowBackRounded />} onClick={onBack}>
            Back
          </Button>
        ) : undefined
      }
    >
      <Stack spacing={2}>
        <Typography variant="h1" component="h1">
          How often will you show up?
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Pick a number you can keep. Rest days are part of the plan.
        </Typography>
      </Stack>

      {goal.status === 'loading' && (
        <Stack role="status" direction="row" spacing={3} sx={{ alignItems: 'center', justifyContent: 'center', py: 10, color: 'text.secondary' }}>
          <CircularProgress size={20} thickness={5} aria-hidden />
          <span>Loading your goal…</span>
        </Stack>
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
    </ScreenLayout>
  )
}
