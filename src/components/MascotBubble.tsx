import Box from '@mui/material/Box'
import { useEffect, useMemo, useState } from 'react'
import { home } from '../design-system/homeTokens'
import { useShowupSelector } from '../hooks/showupSessionContext'
import { useMascotContent } from '../hooks/useMascot'
import { DEFAULT_APP_CONFIG, loadAppConfig } from '../services/appConfig'
import type { HomeSummaryState } from '../hooks/useHomeSummary'
import type { MascotContent, MascotPicture } from '../types'
import { mondayOf } from '../utils/calendarDates'
import { coarseRemainingSeconds, imageFor, pickMascotMessage, type MascotContext } from '../utils/mascot'

const c = home.color

/** The picture's height in pixels. Its width follows from its shape, so the row never jumps. */
export const MASCOT_HEIGHT = 104

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

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: '12px', mt: '14px', minHeight: MASCOT_HEIGHT, fontFamily: home.font.body }}
    >
      {picture && <MascotPictureImage key={picture.url} picture={picture} content={content} />}
      {pick && (
        <Box
          // Read out politely when the words change (a screen reader is not interrupted mid-sentence).
          aria-live="polite"
          sx={{
            bgcolor: c.surface,
            border: `1px solid ${c.line}`,
            borderRadius: '16px',
            p: '10px 14px',
            fontSize: 14,
            color: '#D5D8E0',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {pick.text}
        </Box>
      )}
    </Box>
  )
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

/**
 * The mascot's picture. Decorative: the words say everything, so it is hidden from screen readers.
 * If it fails to load, try the `smile` picture once; if that fails too, show nothing (the bubble stays).
 * The row's height is fixed by the parent, and the width/height attributes reserve the shape, so
 * nothing jumps while it loads.
 */
function MascotPictureImage({ picture, content }: { picture: MascotPicture; content: MascotContent }) {
  const [useFallback, setUseFallback] = useState(false)
  const [failed, setFailed] = useState(false)

  const smile = useMemo(() => imageFor({ images: content.images }, 'smile'), [content.images])
  const shown = useFallback && smile ? smile : picture
  if (failed) return null

  return (
    <Box
      component="img"
      src={shown.url}
      alt=""
      aria-hidden
      // The attributes let the browser reserve the right shape before the picture arrives.
      {...(shown.width ? { width: shown.width } : {})}
      {...(shown.height ? { height: shown.height } : {})}
      onError={() => {
        // First failure: try the smile picture (unless that is what just failed). Second: give up quietly.
        if (!useFallback && smile && smile.url !== picture.url) setUseFallback(true)
        else setFailed(true)
      }}
      sx={{ height: MASCOT_HEIGHT, width: 'auto', flex: 'none', objectFit: 'contain', display: 'block' }}
    />
  )
}

/**
 * After the content has loaded, fetch every picture once in the background, so changing faces (waiting,
 * cheering, resting) shows at once instead of flickering while the next picture downloads.
 */
function usePreloadMascotImages(content: MascotContent): void {
  useEffect(() => {
    // Each Image is only created to make the browser download and cache the picture. Nothing is stored:
    // once it is cached, the real <img> shows it instantly.
    for (const key of Object.keys(content.images)) {
      const picture = imageFor(content, key)
      if (picture) new Image().src = picture.url
    }
  }, [content])
}
