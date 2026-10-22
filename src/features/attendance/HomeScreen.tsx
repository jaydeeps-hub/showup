import LogoutRounded from '@mui/icons-material/LogoutRounded'
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { FeedbackMessage } from '../../components/FeedbackMessage'
import { GymSummary } from '../../components/GymSummary'
import { ScreenLayout } from '../../components/ScreenLayout'
import { ShowUpButton } from '../../components/ShowUpButton'
import { getFeedbackForOutcome, type FeedbackContent } from '../../config/messages'
import { useHomeSummary } from '../../hooks/useHomeSummary'
import type { ShowUpResult } from '../../hooks/useShowup'
import type { Gym } from '../../types'
import { localTodayIso } from '../../utils/calendarDates'
import { Calendar } from '../calendar/Calendar'
import { HomeSummaryTop, PassesLeftStat } from './HomeSummaryPanel'

interface HomeScreenProps {
  /** The name shown at the top: the user's saved first and last name. */
  displayName: string
  gym: Gym
  isVerifying: boolean
  onShowUp: () => Promise<ShowUpResult | null>
  /** Opens the Profile page. Omitted while the profile is not available, which makes the name plain text. */
  onManageProfile?: () => void
  /** Opens the weekly goal screen. Shown as a button while the user has no goal. */
  onSetGoal?: () => void
  /** Opens the Pause screen. */
  onPause?: () => void
  onSignOut: () => void
}

export function HomeScreen(props: HomeScreenProps) {
  const { displayName, gym, isVerifying, onShowUp, onManageProfile, onSetGoal, onPause, onSignOut } = props
  const [feedback, setFeedback] = useState<FeedbackContent | null>(null)
  // Changing this number reloads the summary and the calendar.
  const [refreshKey, setRefreshKey] = useState(0)
  const [today] = useState(() => localTodayIso())
  const summary = useHomeSummary(refreshKey)

  // Reload when the person comes back to the app (for example after a day away), the same as when
  // the screen first appears.
  useEffect(() => {
    function reloadWhenVisible() {
      if (document.visibilityState === 'visible') setRefreshKey((key) => key + 1)
    }
    document.addEventListener('visibilitychange', reloadWhenVisible)
    return () => document.removeEventListener('visibilitychange', reloadWhenVisible)
  }, [])

  async function handleShowUp() {
    const outcome = await onShowUp()
    if (!outcome) return
    setFeedback(getFeedbackForOutcome(outcome))
    // Any attempt that reached the database can change the numbers, so reload them all.
    setRefreshKey((key) => key + 1)
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

      <HomeSummaryTop state={summary} today={today} onSetGoal={onSetGoal} />

      <Stack sx={{ alignItems: 'center', py: 8 }}>
        <ShowUpButton isVerifying={isVerifying} onClick={() => void handleShowUp()} />
      </Stack>

      <Calendar refreshKey={refreshKey} today={today} />

      <PassesLeftStat passesLeft={summary.status === 'ready' ? summary.summary.passesLeft : null} onPause={onPause} />

      <Stack spacing={3} sx={{ alignItems: 'center', mt: 6 }}>
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
