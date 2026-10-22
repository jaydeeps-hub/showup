import Box from '@mui/material/Box'
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
  /** The first name shown in the greeting at the top. */
  firstName: string
  gym: Gym
  isVerifying: boolean
  onShowUp: () => Promise<ShowUpResult | null>
  /** Opens the weekly goal screen. Shown as a button while the user has no goal. */
  onSetGoal?: () => void
}

export function HomeScreen(props: HomeScreenProps) {
  const { firstName, gym, isVerifying, onShowUp, onSetGoal } = props
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
    <ScreenLayout hasTabBar showBrand={false}>
      {/* The tab bar links to Profile, so the header is only a greeting. */}
      <Box component="header" sx={{ mb: 5, minWidth: 0 }}>
        <Typography component="p" variant="body2" color="textSecondary">
          Welcome back
        </Typography>
        <Typography variant="h1" component="h1" noWrap title={firstName} sx={{ m: 0 }}>
          {firstName}
        </Typography>
      </Box>

      <GymSummary label={`Your gym · ${gym.label}`} name={gym.name} address={gym.formattedAddress} />

      <HomeSummaryTop state={summary} today={today} onSetGoal={onSetGoal} />

      <Stack sx={{ alignItems: 'center', py: 8 }}>
        <ShowUpButton isVerifying={isVerifying} onClick={() => void handleShowUp()} />
      </Stack>

      <Calendar refreshKey={refreshKey} today={today} />

      <PassesLeftStat passesLeft={summary.status === 'ready' ? summary.summary.passesLeft : null} />

      <FeedbackMessage feedback={feedback} onClose={() => setFeedback(null)} aboveTabBar />
    </ScreenLayout>
  )
}
