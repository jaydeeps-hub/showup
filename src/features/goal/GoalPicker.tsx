import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Loader } from '../../components/Loader'
import { MascotRow } from '../../components/MascotRow'
import { GOAL_MASCOT_HEIGHT } from '../../config/mascotLayout'
import { home } from '../../design-system/homeTokens'
import { tokens } from '../../design-system/tokens'
import { useGoalMascot } from '../../hooks/useGoalMascot'
import type { GoalState } from '../../types'
import { initialGoalDays, MAX_GOAL_DAYS, MIN_GOAL_DAYS, pendingGoalNote } from '../../utils/goal'

const c = home.color
const DAY_OPTIONS = Array.from({ length: MAX_GOAL_DAYS - MIN_GOAL_DAYS + 1 }, (_, index) => MIN_GOAL_DAYS + index)

interface GoalPickerProps {
  /** The goal as the server reports it. Decides the starting number and the "changes on" note. */
  goal: GoalState
  /** Saves the chosen number of days. The parent shows the result as a toast. */
  onSet: (days: number) => Promise<void>
  /**
   * Given in onboarding only: shows a "Skip for now" button under Set goal. Pressing it asks first (a sheet that
   * encourages setting a goal), and only the sheet's own "Skip for now" calls this. Nothing is saved.
   */
  onSkip?: () => void
  /** True once the goal has been saved and the screen is about to move on: nothing that leaves may be pressed. */
  locked?: boolean
}

/**
 * The goal screen's body: the mascot and its speech bubble, a big number with its caption, seven buttons from 1
 * to 7, the help text and a Set goal button pushed to the bottom. It starts on the pending goal if there is one,
 * otherwise the current goal, otherwise 3. It only collects the choice; the parent saves it and decides what to
 * tell the user.
 *
 * The mascot's face, the bubble and the caption under the number all come from the database row for the selected
 * number (`goal_1` ... `goal_7`), or the bundled copy of those rows. The caption on 7 ("Are you sure? Rest days are
 * important too.") is only a gentle nudge: every number, 7 included, can be selected and saved.
 */
export function GoalPicker({ goal, onSet, onSkip, locked = false }: GoalPickerProps) {
  const [days, setDays] = useState(() => initialGoalDays(goal))
  const [isSaving, setIsSaving] = useState(false)
  // The "Skip setting a goal?" sheet.
  const [askingToSkip, setAskingToSkip] = useState(false)
  // Leaving and saving must never overlap: a skip while a save is on its way (or done) would move on twice.
  const busy = isSaving || locked
  const note = pendingGoalNote(goal)
  const mascot = useGoalMascot(days)

  async function handleSet() {
    if (busy) return // ignore a second press while the first save is in progress
    setIsSaving(true)
    try {
      await onSet(days)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    // A column that fills the screen, so Set goal can be pushed to the bottom.
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: home.font.body }}>
      <MascotRow picture={mascot.picture} content={mascot.content} text={mascot.text} height={GOAL_MASCOT_HEIGHT} marginTop="12px" />

      <Box
        component="p"
        aria-live="polite"
        sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 96, lineHeight: 1, textAlign: 'center', m: '24px 0 0', color: c.text, fontVariantNumeric: 'tabular-nums' }}
      >
        {days}
      </Box>
      {/* The caption under the number. It lives in the database, so its words (and the nudge on 7) can be changed there. */}
      <Box component="p" aria-live="polite" sx={{ textAlign: 'center', color: tokens.color.textBody, m: '6px 0 0', minHeight: 24 }}>
        {mascot.label}
      </Box>

      <Box role="radiogroup" aria-label="Days per week" sx={{ display: 'flex', gap: '6px', mt: '24px' }}>
        {DAY_OPTIONS.map((option) => {
          const selected = option === days
          return (
            <Button
              key={option}
              role="radio"
              aria-checked={selected}
              disabled={isSaving}
              onClick={() => setDays(option)}
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: 56,
                height: 56,
                borderRadius: '14px',
                border: `1.5px solid ${selected ? c.accent : c.line}`,
                bgcolor: selected ? c.accent : c.surface,
                color: selected ? c.onAccent : c.text,
                fontFamily: home.font.heading,
                fontWeight: 700,
                fontSize: 20,
                '&:hover': { bgcolor: selected ? c.accent : c.surface2 },
                '&.Mui-disabled': { color: selected ? c.onAccent : c.text, opacity: 0.6 },
              }}
            >
              {option}
            </Button>
          )
        })}
      </Box>

      <Box component="p" sx={{ textAlign: 'center', color: c.muted, fontSize: 13, m: '14px 0 0' }}>
        Days per week. You can change this later in Profile.
      </Box>

      {note && (
        <Box role="status" sx={{ bgcolor: c.accentSoft, border: `1px solid ${c.accentBorder}`, borderRadius: '14px', p: '10px 14px', mt: 4, fontSize: 14, color: c.text }}>
          {note}
        </Box>
      )}

      <Box sx={{ minHeight: 24 }} />

      <Button
        variant="contained"
        size="large"
        fullWidth
        disabled={isSaving}
        aria-busy={isSaving}
        onClick={() => void handleSet()}
        startIcon={isSaving ? <Loader color="currentColor" /> : undefined}
        // Pushed to the bottom of the screen, 60px tall.
        sx={{ mt: 'auto', minHeight: 60, height: 60 }}
      >
        {isSaving ? 'Saving…' : 'Set goal'}
      </Button>

      {onSkip && (
        <>
          <Button
            variant="text"
            color="inherit"
            fullWidth
            disabled={busy}
            onClick={() => setAskingToSkip(true)}
            // The design's ghost button: no fill, 48px, a little under Set goal.
            sx={{ mt: '6px', minHeight: 48, height: 48, fontWeight: 500, color: tokens.color.textPrimary }}
          >
            Skip for now
          </Button>

          <BottomSheet
            open={askingToSkip}
            // Escape, or a tap on the dark area: the same as "Set a goal", the person stays.
            onClose={() => setAskingToSkip(false)}
            title="Skip setting a goal?"
            actions={
              <>
                <Button variant="contained" size="large" fullWidth onClick={() => setAskingToSkip(false)}>
                  Set a goal
                </Button>
                <Button
                  variant="text"
                  color="inherit"
                  fullWidth
                  disabled={busy}
                  onClick={() => {
                    setAskingToSkip(false)
                    onSkip()
                  }}
                  sx={{ minHeight: 48, height: 48, fontWeight: 500, color: tokens.color.textPrimary }}
                >
                  Skip for now
                </Button>
              </>
            }
          >
            A weekly goal is optional, but it gives every visit a target and makes it easier to stay committed. You can set one
            anytime from Home.
          </BottomSheet>
        </>
      )}
    </Box>
  )
}
