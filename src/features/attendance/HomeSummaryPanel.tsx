import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { home } from '../../design-system/homeTokens'
import type { HomeSummaryState } from '../../hooks/useHomeSummary'
import { mondayOf } from '../../utils/calendarDates'

const c = home.color

/** Two summary cards: total showups and weeks in a row. */
export function KpiCards({ totalShowups, weeksInARow }: { totalShowups: number | null; weeksInARow: number | null }) {
  return (
    <Box sx={{ display: 'flex', gap: '10px', mt: 4, fontFamily: home.font.body }}>
      <Box
        sx={{ flex: 1.4, bgcolor: c.accentSoft, border: `1px solid ${c.accentBorder}`, borderRadius: '18px', p: '12px 16px' }}
      >
        <Box component="b" sx={{ display: 'block', fontFamily: home.font.heading, fontWeight: 700, fontSize: 46, lineHeight: 1, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
          {totalShowups ?? '–'}
        </Box>
        <Box component="span" sx={{ fontSize: 14, color: c.kpiLabel }}>
          Total showups
        </Box>
      </Box>
      <Box sx={{ flex: 1, bgcolor: c.surface, borderRadius: '18px', p: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <Box component="b" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 30, lineHeight: 1, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
          {weeksInARow ?? '–'}
        </Box>
        <Box component="span" sx={{ fontSize: 13, color: c.muted, mt: 1 }}>
          weeks in a row
        </Box>
      </Box>
    </Box>
  )
}

interface WeekProgressProps {
  goalDays: number | null
  showupDays: number
  /** True when this week is covered by an active pause. */
  paused: boolean
  onSetGoal?: () => void
}

/** "This week": a count and one dot per goal day. Becomes "Paused", or a prompt to set a goal. */
export function WeekProgress({ goalDays, showupDays, paused, onSetGoal }: WeekProgressProps) {
  if (goalDays === null) {
    return (
      <Box sx={{ mt: 4 }}>
        <Button variant="contained" fullWidth size="large" onClick={onSetGoal} disabled={!onSetGoal}>
          Set your weekly goal
        </Button>
      </Box>
    )
  }

  const dots = Array.from({ length: goalDays }, (_, index) => index < showupDays)
  return (
    <Box sx={{ mt: 4, fontFamily: home.font.body }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, mb: 2 }}>
        <Box component="b" sx={{ color: c.text }}>
          This week
        </Box>
        <Box component="span" sx={{ color: c.muted }}>
          {paused ? 'Paused' : `${showupDays} of ${goalDays} days`}
        </Box>
      </Box>
      <Box role="img" aria-label={paused ? 'This week is paused' : `${showupDays} of ${goalDays} days done`} sx={{ display: 'flex', gap: '6px' }}>
        {dots.map((filled, index) => (
          <Box key={index} component="i" sx={{ flex: 1, height: 8, borderRadius: '4px', bgcolor: filled ? c.ok : c.surface2 }} />
        ))}
      </Box>
    </Box>
  )
}

export function PausedBanner() {
  return (
    <Box
      role="status"
      sx={{ bgcolor: c.accentSoft, border: `1px solid ${c.accentBorder}`, borderRadius: '16px', p: '10px 14px', mt: 3 }}
    >
      <Box component="b" sx={{ fontFamily: home.font.heading, fontSize: 15, color: c.text }}>
        Paused this week
      </Box>
    </Box>
  )
}

export function PassesLeftStat({ passesLeft, onPause }: { passesLeft: number | null; onPause?: () => void }) {
  return (
    <Box sx={{ display: 'flex', gap: '10px', mt: 4 }}>
      <Box sx={{ flex: 1, bgcolor: c.surface, borderRadius: '14px', p: '12px 14px' }}>
        <Box component="b" sx={{ display: 'block', fontFamily: home.font.heading, fontWeight: 700, fontSize: 24, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
          {passesLeft ?? '–'}
        </Box>
        <Box component="span" sx={{ fontSize: 13, color: c.muted }}>
          Pause passes left
        </Box>
      </Box>
      {onPause && (
        <Button variant="outlined" color="inherit" onClick={onPause} sx={{ flex: 1, alignSelf: 'stretch' }}>
          Pause a week
        </Button>
      )}
    </Box>
  )
}

interface HomeSummarySectionsProps {
  state: HomeSummaryState & { retry: () => void }
  /** Today as `YYYY-MM-DD`, used to find this week's Monday. */
  today: string
  onSetGoal?: () => void
}

/** The summary cards at the top of Home (above the Show Up button). */
export function HomeSummaryTop({ state, today, onSetGoal }: HomeSummarySectionsProps) {
  if (state.status === 'error') {
    return (
      <Alert
        severity="error"
        sx={{ mt: 4 }}
        action={
          <Button color="inherit" size="small" onClick={state.retry}>
            Retry
          </Button>
        }
      >
        {state.message}
      </Alert>
    )
  }

  const ready = state.status === 'ready' ? state : null
  const paused = ready ? ready.pause.activePauses.includes(mondayOf(today)) : false

  return (
    <>
      <KpiCards totalShowups={ready?.summary.totalShowups ?? null} weeksInARow={ready?.summary.weeksInARow ?? null} />
      {state.status === 'loading' && (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 4, color: c.muted, fontSize: 14 }}>
          <CircularProgress size={16} thickness={5} aria-hidden sx={{ color: c.accentText }} />
          <Typography component="span" variant="body2" color="inherit">
            Loading your week…
          </Typography>
        </Box>
      )}
      {ready && paused && <PausedBanner />}
      {ready && <WeekProgress goalDays={ready.summary.goalDays} showupDays={ready.summary.showupDaysThisWeek} paused={paused} onSetGoal={onSetGoal} />}
    </>
  )
}
