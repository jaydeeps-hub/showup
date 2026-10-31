import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Loader } from '../../components/Loader'
import { home } from '../../design-system/homeTokens'
import type { HomeSummaryState } from '../../hooks/useHomeSummary'
import { mondayOf } from '../../utils/calendarDates'
import { dayCountText } from '../../utils/goal'

const c = home.color

interface KpiCardsProps {
  totalShowups: number | null
  weeksInARow: number | null
  /**
   * True when the person has no weekly goal (they skipped it, or never set one). "Weeks in a row" means nothing without a
   * goal, so that card becomes a "Set a weekly goal" button of the same size. Left out while the numbers are loading.
   */
  noGoal?: boolean
  /** What the button does. Without it, the button is shown but cannot be pressed. */
  onSetGoal?: () => void
}

/** Two summary cards: total showups, and weeks in a row (or, with no goal, a button to set one). */
export function KpiCards({ totalShowups, weeksInARow, noGoal = false, onSetGoal }: KpiCardsProps) {
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
      {noGoal ? (
        <SetGoalCard onSetGoal={onSetGoal} />
      ) : (
        <Box sx={{ flex: 1, bgcolor: c.surface, borderRadius: '18px', p: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <Box component="b" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 30, lineHeight: 1, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
            {weeksInARow ?? '–'}
          </Box>
          <Box component="span" sx={{ fontSize: 13, color: c.muted, mt: 1 }}>
            {weeksInARow === 1 ? 'week in a row' : 'weeks in a row'}
          </Box>
        </Box>
      )}
    </Box>
  )
}

/**
 * Takes the place of the "weeks in a row" card when there is no weekly goal: the same box, tinted blue with a dashed
 * border so it reads as something to press. A real button, so Enter and Space work and it has a focus ring.
 */
function SetGoalCard({ onSetGoal }: { onSetGoal?: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onSetGoal}
      disabled={!onSetGoal}
      sx={{
        // The same footprint as the card it replaces.
        flex: 1,
        borderRadius: '18px',
        p: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 1,
        textAlign: 'left',
        font: 'inherit',
        bgcolor: c.accentSoft,
        border: '1.5px dashed #5C78E6',
        color: c.text,
        cursor: onSetGoal ? 'pointer' : 'default',
        '&:hover:not(:disabled)': { bgcolor: '#1B2A60' },
        '&:focus-visible': { outline: `2px solid ${home.color.accentText}`, outlineOffset: 2 },
        '&:disabled': { opacity: 0.7 },
      }}
    >
      <Box component="b" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
        Set a weekly goal
      </Box>
      <Box component="span" sx={{ fontSize: 13, color: c.kpiLabel }}>
        Add a target ›
      </Box>
    </Box>
  )
}

interface WeekProgressProps {
  goalDays: number | null
  showupDays: number
  /** True when this week is covered by an active pause. */
  paused: boolean
}

/**
 * "This week": a count and one dot per goal day. Becomes "Paused". With no goal there is nothing to count against, so it
 * draws nothing: the way to set one is the card at the top (see KpiCards), the only control for it.
 */
export function WeekProgress({ goalDays, showupDays, paused }: WeekProgressProps) {
  if (goalDays === null) return null

  const dots = Array.from({ length: goalDays }, (_, index) => index < showupDays)
  return (
    <Box sx={{ mt: 4, fontFamily: home.font.body }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, mb: 2 }}>
        <Box component="b" sx={{ color: c.text }}>
          This week
        </Box>
        <Box component="span" sx={{ color: c.muted }}>
          {paused ? 'Paused' : dayCountText(showupDays, goalDays)}
        </Box>
      </Box>
      {/* One segment per goal day. Visits beyond the goal do not add segments: they are simply all filled. */}
      <Box role="img" aria-label={paused ? 'This week is paused' : `${dayCountText(showupDays, goalDays)} done`} sx={{ display: 'flex', gap: '6px' }}>
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

/** The "Pause passes left" card, full width. */
export function PassesLeftStat({ passesLeft }: { passesLeft: number | null }) {
  return (
    <Box sx={{ display: 'flex', gap: '10px', mt: 4 }}>
      <Box sx={{ flex: 1, width: '100%', bgcolor: c.surface, borderRadius: '14px', p: '12px 14px' }}>
        <Box component="b" sx={{ display: 'block', fontFamily: home.font.heading, fontWeight: 700, fontSize: 24, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
          {passesLeft ?? '–'}
        </Box>
        <Box component="span" sx={{ fontSize: 13, color: c.muted }}>
          Pause passes left
        </Box>
      </Box>
    </Box>
  )
}

interface HomeSummarySectionsProps {
  state: HomeSummaryState & { retry: () => void }
  /** Today as `YYYY-MM-DD`, used to find this week's Monday. */
  today: string
  onSetGoal?: () => void
  /** Shown right under the summary cards and above the loading line, paused banner and week progress. */
  afterCards?: ReactNode
}

/**
 * The summary cards at the top of Home (above the Show Up button). `afterCards` lets Home place the
 * mascot between the cards and the paused banner / week progress, as in the design.
 */
export function HomeSummaryTop({ state, today, onSetGoal, afterCards }: HomeSummarySectionsProps) {
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
      <KpiCards
        totalShowups={ready?.summary.totalShowups ?? null}
        weeksInARow={ready?.summary.weeksInARow ?? null}
        // Only once the numbers are known: while loading, "no goal" would be a guess and the card would flash.
        noGoal={ready !== null && ready.summary.goalDays === null}
        onSetGoal={onSetGoal}
      />
      {afterCards}
      {state.status === 'loading' && (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 4, color: c.muted, fontSize: 14 }}>
          <Loader size={16} color={c.accentText} />
          <Typography component="span" variant="body2" color="inherit">
            Loading your week…
          </Typography>
        </Box>
      )}
      {ready && paused && <PausedBanner />}
      {ready && <WeekProgress goalDays={ready.summary.goalDays} showupDays={ready.summary.showupDaysThisWeek} paused={paused} />}
    </>
  )
}
