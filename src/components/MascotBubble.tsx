import { useEffect, useMemo, useState } from 'react'
import { useShowupSelector } from '../hooks/showupSessionContext'
import { useMascotContent } from '../hooks/useMascot'
import { DEFAULT_APP_CONFIG, loadAppConfig } from '../services/appConfig'
import type { HomeSummaryState } from '../hooks/useHomeSummary'
import { mondayOf } from '../utils/calendarDates'
import { coarseRemainingSeconds, imageFor, pickMascotMessage, type MascotContext } from '../utils/mascot'
import { MascotRow } from './MascotRow'
import { usePreloadMascotImages } from './usePreloadMascotImages'

interface MascotBubbleProps {
  /** Home's numbers and pauses, or its loading / error state. */
  summary: HomeSummaryState
  /** Today as `YYYY-MM-DD`, to find this week's Monday for the pause check. */
  today: string
}

/**
 * The mascot: a picture on the left and a speech bubble on the right, between the summary cards and the
 * Show Up button. The words come from the mascot table (see utils/mascot.ts: the code decides which
 * situations are true, the table decides which one wins); the picture is a PNG from the database.
 *
 * It reads the Show Up timer through narrow subscriptions (minutes left, not seconds), so a running
 * timer re-renders this bubble about once a minute and does not re-render Home.
 */
export function MascotBubble({ summary, today }: MascotBubbleProps) {
  const content = useMascotContent()

  // Narrow reads of the engine: each re-renders this component only when ITS value changes.
  const engine = useShowupSelector((s) => s.phase)
  const lastOutcome = useShowupSelector((s) => s.lastOutcome)
  const almostSeconds = useMascotAlmostSeconds()
  // Stepped, not exact: see coarseRemainingSeconds. Same answers, far fewer changes.
  const remainingSeconds = useShowupSelector((s) => coarseRemainingSeconds(s.remainingSeconds, almostSeconds))

  const ready = summary.status === 'ready' ? summary : null
  const goal = ready?.summary.goalDays ?? null
  const done = ready?.summary.showupDaysThisWeek ?? 0
  const wk = ready?.summary.weeksInARow ?? 0
  const total = ready?.summary.totalShowups ?? 0
  const paused = ready ? ready.pause.activePauses.includes(mondayOf(today)) : false
  const numbersKnown = ready !== null

  const pick = useMemo(() => {
    // Until Home's numbers have loaded we know nothing about the user, so say nothing rather than guess
    // ("new user" for someone with 40 showups would be wrong). The row keeps its space.
    if (!numbersKnown && engine === 'idle') return null
    const context: MascotContext = { goal, done, wk, total, paused, engine, remainingSeconds, lastOutcome, almostSeconds }
    // With real pictures loaded, a message whose expression has no picture row is skipped. The bundled
    // defaults have no pictures, and a database with no addresses yet returns none, so for those the
    // check is off and the words still show.
    const known = Object.keys(content.images).length > 0 ? new Set(Object.keys(content.images)) : null
    return pickMascotMessage(content.messages, context, known)
  }, [content, numbersKnown, goal, done, wk, total, paused, engine, remainingSeconds, lastOutcome, almostSeconds])

  const picture = pick ? imageFor(content, pick.expression) : null

  usePreloadMascotImages(content)

  return <MascotRow picture={picture} content={content} text={pick ? pick.text : null} />
}

/**
 * How many seconds before the end the mascot starts saying "almost there" (`config.mascot_almost_seconds`).
 * It starts at the built-in default and switches to the database value once the config has loaded (it is
 * cached for an hour, and Home already loaded it, so this is normally instant). If the config cannot be
 * read, the default stays.
 */
function useMascotAlmostSeconds(): number {
  const [seconds, setSeconds] = useState(DEFAULT_APP_CONFIG.mascotAlmostSeconds)
  useEffect(() => {
    let cancelled = false
    loadAppConfig()
      .then((config) => {
        if (!cancelled && typeof config?.mascotAlmostSeconds === 'number') setSeconds(config.mascotAlmostSeconds)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return seconds
}
