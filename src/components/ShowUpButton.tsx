import CheckRounded from '@mui/icons-material/CheckRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { tokens } from '../design-system/tokens'
import type { EnginePhase } from '../services/showupEngine'
import { formatRemaining } from '../utils/showupSession'
import { Loader } from './Loader'

/** The ring, from the design prototype (docs/design/showup-prototype.html, .su): a 208px drawing around the button. */
const RING_SIZE = 208
const RING_RADIUS = 94
const RING_STROKE = 10
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS // about 590.6

interface ShowUpButtonProps {
  state: EnginePhase
  /** Whole seconds left on the timer. */
  remainingSeconds: number
  /** 0 to 1. */
  progress: number
  checksDone: number
  checksTotal: number
  onStart: () => void
  onStop: () => void
}

const c = tokens.color

/**
 * The Show up button and the ring around it. It only displays what the engine reports:
 *   idle      "Show up" and a hint; dim ring
 *   checking  disabled, the loader, "Checking your location"; dim ring
 *   running   the countdown, "Checked N of M times"; the ring fills clockwise; a Stop link below
 *   done      a green check, "You showed up"; full green ring
 */
export function ShowUpButton({ state, remainingSeconds, progress, checksDone, checksTotal, onStart, onStop }: ShowUpButtonProps) {
  const isRunning = state === 'running'
  const isDone = state === 'done'
  const isChecking = state === 'checking'

  const ringColour = isDone ? c.success : c.accentPrimary
  const ringFill = isDone ? 1 : isRunning ? progress : 0
  const smallText = isDone
    ? 'You showed up'
    : isRunning
      ? `Checked ${checksDone} of ${checksTotal} times`
      : isChecking
        ? 'Checking your location'
        : "Tap when you're at your gym"

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box sx={{ position: 'relative', width: RING_SIZE, height: RING_SIZE, maxWidth: '100%' }}>
        <Box
          component="svg"
          aria-hidden
          focusable="false"
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          sx={{ width: '100%', height: '100%', display: 'block' }}
        >
          <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke={c.border} strokeWidth={RING_STROKE} />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={ringColour}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringFill)}
            // Start at 12 o'clock and fill clockwise.
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Box>

        <ButtonBase
          onClick={onStart}
          disabled={state !== 'idle'}
          aria-busy={isChecking}
          aria-label={isDone ? 'You showed up' : isRunning ? `Show up timer, ${formatRemaining(remainingSeconds)} left` : isChecking ? 'Checking your location' : 'Show up'}
          sx={{
            position: 'absolute',
            inset: '20px',
            borderRadius: '50%',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 1,
            px: '14px',
            textAlign: 'center',
            fontFamily: tokens.font.display,
            fontWeight: 700,
            fontSize: isRunning ? 38 : 26,
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
            color: isDone ? c.success : c.onAccent,
            backgroundColor: isDone ? c.successSurface : isRunning || isChecking ? c.surface2 : c.accentPrimary,
            '&:hover': { backgroundColor: state === 'idle' ? c.accentHover : undefined },
            '&.Mui-disabled': {
              color: isDone ? c.success : c.onAccent,
              backgroundColor: isDone ? c.successSurface : c.surface2,
              pointerEvents: 'none',
            },
            '&.Mui-focusVisible': { outline: `2px solid ${c.focusRing}`, outlineOffset: 2 },
          }}
        >
          {isChecking ? (
            <Loader size={32} />
          ) : isDone ? (
            <CheckRounded sx={{ fontSize: 48 }} aria-hidden />
          ) : isRunning ? (
            <span>{formatRemaining(remainingSeconds)}</span>
          ) : (
            <>
              <FitnessCenterRounded sx={{ fontSize: 34 }} aria-hidden />
              <span>Show up</span>
            </>
          )}
          <Box
            component="small"
            sx={{ fontFamily: tokens.font.body, fontWeight: 400, fontSize: 12, lineHeight: 1.3, opacity: 0.85, display: 'block' }}
          >
            {smallText}
          </Box>
        </ButtonBase>
      </Box>

      {isRunning && (
        <>
          <Box component="p" sx={{ m: 0, mt: 2, fontSize: 13, color: c.textSecondary, textAlign: 'center' }}>
            Keep this screen open until the timer ends.
          </Box>
          <ButtonBase
            onClick={onStop}
            sx={{
              mt: 1,
              minHeight: 36,
              px: 3,
              borderRadius: `${tokens.radius.small}px`,
              color: c.accentText,
              fontFamily: tokens.font.body,
              fontWeight: 500,
              fontSize: 13,
              '&.Mui-focusVisible': { outline: `2px solid ${c.focusRing}`, outlineOffset: 2 },
            }}
          >
            Stop
          </ButtonBase>
        </>
      )}
    </Box>
  )
}
