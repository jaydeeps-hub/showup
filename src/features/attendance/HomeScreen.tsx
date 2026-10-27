import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { GymSummary } from '../../components/GymSummary'
import { MascotBoundary } from '../../components/MascotBoundary'
import { MascotBubble } from '../../components/MascotBubble'
import { ScreenLayout } from '../../components/ScreenLayout'
import { ConnectedShowUpButton } from '../../components/ShowUpButton'
import { useShowupSelector } from '../../hooks/showupSessionContext'
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
 * The mascot (words and picture) is the MascotBubble, which follows the timer on its own, so this screen
 * does not re-render as the seconds tick.
 */
export function HomeScreen(props: HomeScreenProps) {
  const { firstName, gym, onSetGoal } = props
  // The only thing this screen needs from the timer: how many visits have finished. It changes rarely, so
  // Home does not re-render as the seconds tick. The countdown and the ring are drawn by the button below.
  const completions = useShowupSelector((s) => s.completions)
  // Changing this number reloads the summary and the calendar.
  const [visibilityReloads, setVisibilityReloads] = useState(0)
  const [today] = useState(() => localTodayIso())
  // A finished or already-counted visit changes the totals, the streak and the calendar.
  const refreshKey = visibilityReloads + completions
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
          {/* A brand-new user has no showups yet; until the numbers load we cannot tell, so use the usual line. */}
          {summary.status === 'ready' && summary.summary.totalShowups === 0 ? 'Welcome' : 'Welcome back'}
        </Typography>
        <Typography variant="h1" component="h1" noWrap title={firstName} sx={{ m: 0 }}>
          {firstName}
        </Typography>
      </Box>

      <GymSummary label={`Your gym · ${gym.label}`} name={gym.name} address={gym.formattedAddress} />

      <HomeSummaryTop
        state={summary}
        today={today}
        onSetGoal={onSetGoal}
        afterCards={
          <MascotBoundary>
            <MascotBubble summary={summary} today={today} />
          </MascotBoundary>
        }
      />

      <Stack sx={{ alignItems: 'center', py: 8 }}>
        <ConnectedShowUpButton />
      </Stack>

      <Calendar refreshKey={refreshKey} today={today} />

      <PassesLeftStat passesLeft={summary.status === 'ready' ? summary.summary.passesLeft : null} />
    </ScreenLayout>
  )
}
