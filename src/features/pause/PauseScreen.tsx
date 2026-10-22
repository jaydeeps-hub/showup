import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ScreenLayout } from '../../components/ScreenLayout'
import { Toast, type ToastContent } from '../../components/Toast'
import { home } from '../../design-system/homeTokens'
import { usePauseState } from '../../hooks/usePauseState'
import { endPause, startPause } from '../../services/pauseService'
import type { PauseDetails } from '../../types'
import { confirmText, noPassesText, PAUSE_REASONS, pauseWeekOptions, weekLabel } from '../../utils/pause'

const c = home.color

interface PauseScreenProps {
  /** Go back. Home and the calendar reload their numbers when they are shown again. */
  onBack?: () => void
}

/**
 * "Pause your count". Passes, active pauses, the week to pause, an optional reason, and a confirmation
 * sheet before a pass is spent. Everything the database decides (which weeks are allowed, how many
 * passes remain) is shown as the server reports it.
 */
export function PauseScreen({ onBack }: PauseScreenProps) {
  const state = usePauseState()
  const [toast, setToast] = useState<ToastContent | null>(null)
  // True while ANY call is running, so a double tap can never spend two passes or end a pause twice.
  const [busy, setBusy] = useState(false)

  const pause = state.status === 'ready' ? state.pause : null

  async function handleEnd(weekStart: string) {
    if (busy) return
    setBusy(true)
    try {
      const result = await endPause(weekStart)
      if (result.status === 'ok') {
        setToast({ severity: 'success', message: 'Pause ended' })
        await state.reload()
      } else {
        setToast({ severity: 'error', message: result.message })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScreenLayout
      headerAction={
        onBack ? (
          <Button size="small" color="inherit" startIcon={<ArrowBackRounded />} onClick={onBack}>
            Back
          </Button>
        ) : undefined
      }
    >
      <Stack spacing={2}>
        <Typography variant="h1" component="h1">
          Pause your count
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Sick, travelling or need a break? A pause pass covers one week. That week's goal is skipped and your weeks in a
          row stay safe.
        </Typography>
      </Stack>

      {state.status === 'loading' && (
        <Stack role="status" direction="row" spacing={3} sx={{ alignItems: 'center', justifyContent: 'center', py: 10, color: 'text.secondary' }}>
          <CircularProgress size={20} thickness={5} aria-hidden />
          <span>Loading your passes…</span>
        </Stack>
      )}

      {state.status === 'error' && (
        <Alert
          severity="error"
          sx={{ mt: 6 }}
          action={
            <Button color="inherit" size="small" onClick={state.retry}>
              Retry
            </Button>
          }
        >
          {state.message}
        </Alert>
      )}

      {pause && (
        <PauseContent
          pause={pause}
          busy={busy}
          setBusy={setBusy}
          onEnd={handleEnd}
          onToast={setToast}
          onChanged={state.reload}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </ScreenLayout>
  )
}

interface PauseContentProps {
  pause: PauseDetails
  busy: boolean
  setBusy: (busy: boolean) => void
  onEnd: (weekStart: string) => Promise<void>
  onToast: (toast: ToastContent) => void
  onChanged: () => Promise<void>
}

function PauseContent({ pause, busy, setBusy, onEnd, onToast, onChanged }: PauseContentProps) {
  const options = pauseWeekOptions(pause)
  // The week the person tapped. It may no longer be on offer (it was just paused, or the list changed),
  // so the week actually used is worked out below rather than trusting this value.
  const [chosenWeek, setChosenWeek] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // The chosen week if it is still offered, otherwise the first one that is.
  const selected = options.find((option) => option.weekStart === chosenWeek) ?? options[0] ?? null
  const selectedWeek = selected?.weekStart ?? null
  const noPasses = pause.passesLeft <= 0

  async function handleUsePass() {
    if (busy || !selected) return
    setBusy(true)
    try {
      const result = await startPause(selected.weekStart, reason)
      setSheetOpen(false)
      if (result.status === 'ok') {
        onToast({ severity: 'success', message: 'Paused. Your weeks in a row are safe.' })
        setReason(null)
        await onChanged()
      } else {
        onToast({ severity: 'error', message: result.message })
        // The screen may be out of date (for example the last pass was just used elsewhere).
        await onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ fontFamily: home.font.body }}>
      <PassesRow total={pause.passesTotal} left={pause.passesLeft} />

      {pause.activePauses.map((weekStart) => (
        <Box key={weekStart} sx={{ bgcolor: c.accentSoft, border: `1px solid ${c.accentBorder}`, borderRadius: '16px', p: 4, mt: 5 }}>
          <Box component="b" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 18, color: c.text }}>
            Paused: {weekLabel(weekStart)}
          </Box>
          <Typography component="p" sx={{ mt: 1, fontSize: 14, color: c.day }}>
            Your weeks in a row are safe. Showing up still counts if you feel like it.
          </Typography>
          <Button
            variant="outlined"
            color="inherit"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void onEnd(weekStart)}
            aria-label={`End pause for ${weekLabel(weekStart)}`}
            sx={{ mt: 3 }}
          >
            End pause
          </Button>
        </Box>
      ))}

      {options.length > 0 && (
        <>
          <Typography component="h2" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 16, mt: 6, mb: 2, color: c.text }}>
            Which week?
          </Typography>
          <Stack role="radiogroup" aria-label="Week to pause" spacing={2}>
            {options.map((option) => {
              const isSelected = option.weekStart === selectedWeek
              return (
                <Box
                  key={option.weekStart}
                  component="button"
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={busy}
                  onClick={() => setChosenWeek(option.weekStart)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    minHeight: 64,
                    p: '10px 14px',
                    width: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    color: c.text,
                    cursor: 'pointer',
                    borderRadius: '14px',
                    border: `1.5px solid ${isSelected ? c.accent : 'transparent'}`,
                    bgcolor: isSelected ? c.accentSoft : c.surface,
                    '&:hover': { bgcolor: isSelected ? c.accentSoft : c.surface2 },
                    '&:focus-visible': { outline: `2px solid ${c.accentText}`, outlineOffset: 2 },
                    '&:disabled': { opacity: 0.6, cursor: 'default' },
                  }}
                >
                  <Box component="span" sx={{ flex: 1 }}>
                    <Box component="span" sx={{ display: 'block', fontWeight: 600, fontSize: 16 }}>
                      {option.title}
                    </Box>
                    {/* The date label is shown in full for this week and next week; later weeks already use it as the title. */}
                    {option.title !== option.label && (
                      <Box component="span" sx={{ display: 'block', fontSize: 13, color: c.muted }}>
                        {option.label}
                      </Box>
                    )}
                  </Box>
                  {/* A tick as well as the colour, so selection is not shown by colour alone. */}
                  {isSelected && <CheckRounded aria-hidden sx={{ color: c.accentText }} />}
                </Box>
              )
            })}
          </Stack>

          <Typography component="p" sx={{ mt: 5, mb: 2, fontSize: 14, fontWeight: 600, color: c.text }}>
            Reason <Box component="span" sx={{ color: c.muted, fontWeight: 400 }}>Optional</Box>
          </Typography>
          <Box role="group" aria-label="Reason for the pause" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {PAUSE_REASONS.map((option) => {
              const pressed = reason === option
              return (
                <Box
                  key={option}
                  component="button"
                  type="button"
                  aria-pressed={pressed}
                  disabled={busy}
                  // One or none: choosing the one already chosen clears it.
                  onClick={() => setReason(pressed ? null : option)}
                  sx={{
                    minHeight: 36,
                    px: '14px',
                    py: 2,
                    borderRadius: '999px',
                    font: `500 13px ${home.font.body}`,
                    color: c.text,
                    cursor: 'pointer',
                    border: `1px solid ${pressed ? c.accent : c.line}`,
                    bgcolor: pressed ? c.accentSoft : c.surface,
                    '&:focus-visible': { outline: `2px solid ${c.accentText}`, outlineOffset: 2 },
                    '&:disabled': { opacity: 0.6, cursor: 'default' },
                  }}
                >
                  {option}
                </Box>
              )
            })}
          </Box>

          {noPasses && (
            <Typography component="p" sx={{ mt: 4, fontSize: 13, color: c.muted }}>
              {noPassesText(pause)}
            </Typography>
          )}

          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={noPasses || busy || !selected}
            onClick={() => setSheetOpen(true)}
            sx={{ mt: 5 }}
          >
            Use a pause pass
          </Button>
        </>
      )}

      <Drawer
        anchor="bottom"
        open={sheetOpen}
        onClose={() => !busy && setSheetOpen(false)}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': 'Confirm pause',
            sx: {
              bgcolor: c.surface,
              backgroundImage: 'none',
              borderRadius: '24px 24px 0 0',
              borderTop: `1px solid ${c.line}`,
              p: '24px 24px 32px',
              maxWidth: 520,
              mx: 'auto',
            },
          },
        }}
      >
        <Box component="b" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 20, color: c.text }}>
          Use 1 pause pass?
        </Box>
        <Typography component="p" sx={{ mt: 1, mb: 5, fontSize: 14, color: c.day }}>
          {selected ? confirmText(selected.label, pause.passesLeft) : ''}
        </Typography>
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={busy}
          aria-busy={busy}
          onClick={() => void handleUsePass()}
          startIcon={busy ? <CircularProgress size={20} thickness={5} color="inherit" aria-hidden /> : undefined}
        >
          {busy ? 'Pausing…' : 'Use pass'}
        </Button>
        <Button fullWidth color="inherit" disabled={busy} onClick={() => setSheetOpen(false)} sx={{ mt: 2 }}>
          Not now
        </Button>
      </Drawer>
    </Box>
  )
}

/** One circle per pass in the month, filled for each pass still left. */
function PassesRow({ total, left }: { total: number; left: number }) {
  const circles = Array.from({ length: total }, (_, index) => index < left)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 5, fontSize: 14, color: c.day }}>
      <Box role="img" aria-label={`${left} of ${total} passes left`} sx={{ display: 'flex', gap: 2 }}>
        {circles.map((filled, index) => (
          <Box
            key={index}
            component="i"
            sx={{ width: 22, height: 22, borderRadius: '50%', border: `1.5px solid ${filled ? c.accentText : c.line}`, bgcolor: filled ? c.accentText : 'transparent' }}
          />
        ))}
      </Box>
      <span>
        {left} of {total} passes left this month
      </span>
    </Box>
  )
}
