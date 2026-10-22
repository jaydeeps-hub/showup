import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import PauseRounded from '@mui/icons-material/PauseRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import { Loader } from '../../components/Loader'
import { home } from '../../design-system/homeTokens'
import { useCalendar } from '../../hooks/useCalendar'
import type { CalendarData, CalendarWeek } from '../../types'
import {
  addMonths,
  buildCalendarRows,
  formatLongDate,
  localTodayIso,
  monthLabel,
  monthStartOf,
  type CalendarRow,
} from '../../utils/calendarDates'
import { dayCountText } from '../../utils/goal'

const c = home.color
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const
/** Seven day columns and a narrow "Goal" column. */
const GRID_COLUMNS = 'repeat(7, 1fr) 42px'

interface CalendarProps {
  /** Change this number to reload the calendar, for example after a Show Up. */
  refreshKey?: number
  /** Today as `YYYY-MM-DD`. Defaults to today's date on this device. */
  today?: string
}

/**
 * A month calendar. Blue circles are days the user showed up; the last column shows how each week
 * went. All of it comes from `get_calendar`; nothing is counted here. The previous and next arrows
 * stop at the earliest and latest months the database allows. There is no swiping.
 */
export function Calendar({ refreshKey = 0, today: todayProp }: CalendarProps) {
  const [today] = useState(() => todayProp ?? localTodayIso())
  const [month, setMonth] = useState(() => monthStartOf(today))
  const state = useCalendar(month, refreshKey)

  const calendar = state.status === 'ready' ? state.calendar : null
  // While a new month loads the previous one stays labelled; the arrows wait for real data.
  const shownMonth = calendar?.month ?? month
  const canGoBack = calendar !== null && calendar.month > calendar.earliestMonth
  const canGoForward = calendar !== null && calendar.month < calendar.latestMonth

  function goTo(offset: number) {
    if (!calendar) return
    const target = addMonths(calendar.month, offset)
    // Never ask for a month outside the range the database reported, even though it would clamp it.
    if (target < calendar.earliestMonth || target > calendar.latestMonth) return
    setMonth(target)
  }

  return (
    <Box
      component="section"
      aria-label="Calendar"
      sx={{ bgcolor: c.surface, borderRadius: '18px', p: '16px 12px', mt: 5, fontFamily: home.font.body }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 3 }}>
        <IconButton
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => goTo(-1)}
          sx={{ bgcolor: c.surface2, color: c.text, '&.Mui-disabled': { opacity: 0.35, color: c.text } }}
        >
          <ChevronLeftRounded />
        </IconButton>
        <Typography component="h2" aria-live="polite" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 17, color: c.text }}>
          {monthLabel(shownMonth)}
        </Typography>
        <IconButton
          aria-label="Next month"
          disabled={!canGoForward}
          onClick={() => goTo(1)}
          sx={{ bgcolor: c.surface2, color: c.text, '&.Mui-disabled': { opacity: 0.35, color: c.text } }}
        >
          <ChevronRightRounded />
        </IconButton>
      </Box>

      {state.status === 'loading' && (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 220, color: c.muted }}>
          <Loader color={c.accentText} />
          Loading the calendar…
        </Box>
      )}

      {state.status === 'error' && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={state.retry}>
              Retry
            </Button>
          }
        >
          {state.message}
        </Alert>
      )}

      {calendar && <CalendarGrid calendar={calendar} today={today} />}
      <Legend />
    </Box>
  )
}

function CalendarGrid({ calendar, today }: { calendar: CalendarData; today: string }) {
  const showedUp = useMemo(() => new Set(calendar.showupDates), [calendar.showupDates])
  const weeksByMonday = useMemo(() => new Map(calendar.weeks.map((week) => [week.weekStart, week])), [calendar.weeks])
  const rows = useMemo(
    () => buildCalendarRows(calendar.gridFrom, calendar.gridTo, calendar.month),
    [calendar.gridFrom, calendar.gridTo, calendar.month],
  )

  return (
    <Box role="grid" aria-label={monthLabel(calendar.month)} sx={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, gap: '6px 2px', textAlign: 'center' }}>
      {WEEKDAY_INITIALS.map((initial, index) => (
        <Box key={index} role="columnheader" sx={{ fontSize: 11, color: c.muted }}>
          {initial}
        </Box>
      ))}
      <Box role="columnheader" sx={{ fontSize: 11, color: c.muted }}>
        Goal
      </Box>

      {rows.map((row) => (
        <WeekRow key={row.weekStart} row={row} week={weeksByMonday.get(row.weekStart)} showedUp={showedUp} today={today} />
      ))}
    </Box>
  )
}

function WeekRow({ row, week, showedUp, today }: { row: CalendarRow; week: CalendarWeek | undefined; showedUp: Set<string>; today: string }) {
  const paused = week?.status === 'paused'
  return (
    <Box role="row" sx={{ display: 'contents' }}>
      {row.cells.map((cell) => {
        if (!cell.inMonth) return <Box key={cell.date} role="gridcell" aria-hidden />
        return (
          <DayCircle
            key={cell.date}
            date={cell.date}
            showedUp={showedUp.has(cell.date)}
            isToday={cell.date === today}
            isFuture={cell.date > today}
            inPausedWeek={paused}
          />
        )
      })}
      <WeekMarker week={week} />
    </Box>
  )
}

function DayCircle(props: { date: string; showedUp: boolean; isToday: boolean; isFuture: boolean; inPausedWeek: boolean }) {
  const { date, showedUp, isToday, isFuture, inPausedWeek } = props
  const day = Number(date.slice(8, 10))
  // A dashed outline marks the days of a paused week that were not showups (today keeps its ring).
  const dashed = inPausedWeek && !showedUp && !isToday
  const description = [formatLongDate(date), showedUp ? 'showed up' : null, isToday ? 'today' : null].filter(Boolean).join(', ')

  return (
    <Box
      role="gridcell"
      aria-label={description}
      aria-current={isToday ? 'date' : undefined}
      sx={{
        width: 34,
        height: 34,
        m: 'auto',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: 13,
        color: isFuture ? c.dayFuture : c.day,
        ...(showedUp && { bgcolor: c.accent, color: c.onAccent, fontWeight: 600 }),
        ...(isToday && { boxShadow: `inset 0 0 0 2px ${c.accentText}` }),
        ...(dashed && { border: `1.5px dashed ${c.accentText}` }),
      }}
    >
      {day}
    </Box>
  )
}

/** The last column: a tick when the week's goal was hit, a pause mark, or how far the week got. */
function WeekMarker({ week }: { week: CalendarWeek | undefined }) {
  const chip = {
    width: 30,
    height: 28,
    borderRadius: '8px',
    display: 'grid',
    placeItems: 'center',
  } as const

  let content: React.ReactNode = null
  // A week before the user's first goal has no goal to show (the server calls those "in progress").
  if (week && week.goalDays !== null) {
    if (week.status === 'achieved') {
      content = (
        <Box role="img" aria-label="Week goal hit" sx={{ ...chip, bgcolor: c.okSoft, color: c.ok }}>
          <CheckRounded sx={{ fontSize: 18 }} aria-hidden />
        </Box>
      )
    } else if (week.status === 'paused') {
      content = (
        <Box role="img" aria-label="Paused week" sx={{ ...chip, bgcolor: c.accentSoft, color: c.accentText }}>
          <PauseRounded sx={{ fontSize: 16 }} aria-hidden />
        </Box>
      )
    } else if (week.status === 'in_progress' || week.status === 'missed') {
      content = (
        <Box component="span" aria-label={dayCountText(week.showupDays, week.goalDays)} sx={{ fontSize: 12, color: c.muted }}>
          {week.showupDays}/{week.goalDays}
        </Box>
      )
    }
  }

  return (
    <Box role="gridcell" sx={{ display: 'grid', placeItems: 'center' }}>
      {content}
    </Box>
  )
}

function Legend() {
  const swatch = { display: 'inline-block', width: 10, height: 10, mr: '5px' } as const
  return (
    <Box sx={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: 12, color: c.muted, mt: 3, px: 1 }}>
      <span>
        <Box component="i" aria-hidden sx={{ ...swatch, borderRadius: '50%', bgcolor: c.accent }} />
        Showed up
      </span>
      <span>
        <Box component="i" aria-hidden sx={{ ...swatch, borderRadius: '3px', bgcolor: c.ok }} />
        Week goal hit
      </span>
      <span>
        <Box component="i" aria-hidden sx={{ ...swatch, borderRadius: '50%', border: `1.5px dashed ${c.accentText}` }} />
        Paused
      </span>
    </Box>
  )
}
