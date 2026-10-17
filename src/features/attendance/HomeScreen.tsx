import EditLocationAltOutlined from '@mui/icons-material/EditLocationAltOutlined'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
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
  onSignOut: () => void
}

export function HomeScreen(props: HomeScreenProps) {
  const { username, gym, showupCount, isVerifying, onShowUp, onChangeGym, onSignOut } = props
  const [feedback, setFeedback] = useState<FeedbackContent | null>(null)

  async function handleShowUp() {
    const outcome = await onShowUp()
    if (outcome) setFeedback(getFeedbackForOutcome(outcome))
  }

  return (
    <ScreenLayout
      headerAction={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, color: 'text.secondary' }}>
          <PersonOutlineRounded sx={{ fontSize: 20 }} aria-hidden />
          <Typography variant="body2" noWrap sx={{ maxWidth: 160 }} title={username}>
            {username}
          </Typography>
        </Box>
      }
    >
      <GymSummary label={`Your gym · ${gym.label}`} name={gym.name} address={gym.formattedAddress} />

      <Stack spacing={8} sx={{ alignItems: 'center', justifyContent: 'center', flex: 1, py: 10 }}>
        <ShowUpButton isVerifying={isVerifying} onClick={() => void handleShowUp()} />
        <ShowUpCounter count={showupCount} />
      </Stack>

      <Stack spacing={3} sx={{ alignItems: 'center' }}>
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            size="small"
            color="inherit"
            startIcon={<EditLocationAltOutlined />}
            onClick={onChangeGym}
            disabled={isVerifying}
          >
            Change gym
          </Button>
          <Button
            size="small"
            color="inherit"
            startIcon={<LogoutRounded />}
            onClick={onSignOut}
            disabled={isVerifying}
          >
            Sign out
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 320 }}>
          Showup checks the location your device reports. It does not track workouts.
        </Typography>
      </Stack>

      <FeedbackMessage feedback={feedback} onClose={() => setFeedback(null)} />
    </ScreenLayout>
  )
}
