import LogoutRounded from '@mui/icons-material/LogoutRounded'
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded'
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
import type { ShowUpResult } from '../../hooks/useShowup'
import type { Gym } from '../../types'

interface HomeScreenProps {
  /** The name shown at the top: the user's saved first and last name. */
  displayName: string
  gym: Gym
  showupCount: number
  isVerifying: boolean
  onShowUp: () => Promise<ShowUpResult | null>
  /** Opens the Profile page. Omitted while the profile is not available, which makes the name plain text. */
  onManageProfile?: () => void
  onSignOut: () => void
}

export function HomeScreen(props: HomeScreenProps) {
  const { displayName, gym, showupCount, isVerifying, onShowUp, onManageProfile, onSignOut } = props
  const [feedback, setFeedback] = useState<FeedbackContent | null>(null)

  async function handleShowUp() {
    const outcome = await onShowUp()
    if (outcome) setFeedback(getFeedbackForOutcome(outcome))
  }

  return (
    <ScreenLayout
      headerAction={
        // The name opens the Profile page (where the gym can also be changed).
        <Button
          size="small"
          color="inherit"
          startIcon={<PersonOutlineRounded />}
          onClick={onManageProfile}
          disabled={!onManageProfile || isVerifying}
          aria-label={onManageProfile ? `Open profile for ${displayName}` : displayName}
          title={displayName}
          sx={{
            maxWidth: 220,
            minWidth: 0,
            justifyContent: 'flex-end',
            '&.Mui-disabled': { color: 'text.secondary' },
          }}
        >
          <Typography component="span" variant="body2" noWrap>
            {displayName}
          </Typography>
        </Button>
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
            startIcon={<LogoutRounded />}
            onClick={onSignOut}
            disabled={isVerifying}
          >
            Sign out
          </Button>
        </Stack>
        <Typography variant="caption" color="textSecondary" sx={{ textAlign: 'center', maxWidth: 320 }}>
          Showup checks the location your device reports. It does not track workouts.
        </Typography>
      </Stack>

      <FeedbackMessage feedback={feedback} onClose={() => setFeedback(null)} />
    </ScreenLayout>
  )
}
