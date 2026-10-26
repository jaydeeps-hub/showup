import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { GymSummary } from '../../components/GymSummary'
import { ScreenLayout } from '../../components/ScreenLayout'
import { ShowUpButton } from '../../components/ShowUpButton'
import { useShowupSession } from '../../hooks/showupSessionContext'
import { useHomeSummary } from '../../hooks/useHomeSummary'
import type { Gym } from '../../types'
import { localTodayIso } from '../../utils/calendarDates'
import { Calendar } from '../calendar/Calendar'
import { HomeSummaryTop, PassesLeftStat } from './HomeSummaryPanel'

interface HomeScreenProps {
  /** The first name shown in the greeting at the top. */
  firstName: string
  gym: Gym
  /** Opens the weekly goal screen. Shown as a button while the user has no goal. */
  onSetGoal?: () => void
}

/**
 * Home. The Show up button and its ring are driven by the timed Show Up engine (useShowupSession):
 * this screen only displays its state and reloads the numbers and the calendar when a visit finishes
 * or turns out to be already counted. What the user is TOLD about a Show Up is shown by ShowupFeedback.
 */
export function HomeScreen(props: HomeScreenProps) {
  const { firstName, gym, onSetGoal } = props
  const showup = useShowupSession()
  // Changing this number reloads the summary and the calendar.
  const [visibilityReloads, setVisibilityReloads] = useState(0)
  const [today] = useState(() => localTodayIso())
  // A finished or already-counted visit changes the totals, the streak and the calendar.
  const refreshKey = visibilityReloads + showup.completions
  const summary = useHomeSummary(refreshKey)

  // Reload when the person comes back to the app (for example after a day away), the same as when
  // the screen first appears.
  useEffect(() => {
    function reloadWhenVisible() {
      if (document.visibilityState === 'visible') setVisibilityReloads((count) => count + 1)
    }
    document.addEventListener('visibilitychange', reloadWhenVisible)
    return () => document.removeEventListener('visibilitychange', reloadWhenVisible)
  }, [])

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
        <ShowUpButton
          state={showup.state}
          remainingSeconds={showup.remainingSeconds}
          progress={showup.progress}
          checksDone={showup.checksDone}
          checksTotal={showup.checksTotal}
          onStart={showup.start}
          onStop={showup.stop}
        />
      </Stack>

      <Calendar refreshKey={refreshKey} today={today} />

      <PassesLeftStat passesLeft={summary.status === 'ready' ? summary.summary.passesLeft : null} />
    </ScreenLayout>
  )
}
