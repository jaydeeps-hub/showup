import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { FeedbackMessage } from '../../components/FeedbackMessage'
import { GymSummary } from '../../components/GymSummary'
import { ScreenLayout } from '../../components/ScreenLayout'
import { ShowUpButton } from '../../components/ShowUpButton'
import { ShowUpCounter } from '../../components/ShowUpCounter'
import { getFeedbackForOutcome, type FeedbackContent } from '../../config/messages'
import type { Gym, ShowupOutcome } from '../../types'

interface HomeScreenProps {
  username: string
  gym: Gym
  showupCount: number
  isVerifying: boolean
  onShowUp: () => Promise<ShowupOutcome | null>
  onChangeGym: () => void
  onResetDemoData: () => void
}

export function HomeScreen(props: HomeScreenProps) {
  const { username, gym, showupCount, isVerifying, onShowUp, onChangeGym, onResetDemoData } = props
  const [feedback, setFeedback] = useState<FeedbackContent | null>(null)
  const [isConfirmingReset, setIsConfirmingReset] = useState(false)

  async function handleShowUp() {
    const outcome = await onShowUp()
    if (outcome) setFeedback(getFeedbackForOutcome(outcome))
  }

  return (
    <ScreenLayout
      headerAction={
        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: '50%' }}>
          {username}
        </Typography>
      }
    >
      <GymSummary label={`Your gym · ${gym.label}`} name={gym.name} address={gym.formattedAddress} />

      <Stack spacing={4} sx={{ alignItems: 'center', justifyContent: 'center', flex: 1, py: 5 }}>
        <ShowUpButton isVerifying={isVerifying} onClick={() => void handleShowUp()} />
        <ShowUpCounter count={showupCount} />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
        <Button size="small" color="inherit" onClick={onChangeGym} disabled={isVerifying}>
          Change gym
        </Button>
        <Button size="small" color="inherit" onClick={() => setIsConfirmingReset(true)} disabled={isVerifying}>
          Log out &amp; reset
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 1 }}>
        Showup checks the location your device reports. It does not track workouts.
      </Typography>

      <FeedbackMessage feedback={feedback} onClose={() => setFeedback(null)} />

      <Dialog open={isConfirmingReset} onClose={() => setIsConfirmingReset(false)} fullWidth maxWidth="xs">
        <DialogTitle>Log out and reset?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This deletes your demo profile, saved gym and all {showupCount} Showups from this browser. It cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsConfirmingReset(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={onResetDemoData} color="error" variant="contained">
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </ScreenLayout>
  )
}
