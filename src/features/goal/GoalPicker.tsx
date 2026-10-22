import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Loader } from '../../components/Loader'
import { home } from '../../design-system/homeTokens'
import type { GoalState } from '../../types'
import { goalLabel, initialGoalDays, MAX_GOAL_DAYS, MIN_GOAL_DAYS, pendingGoalNote } from '../../utils/goal'

const c = home.color
const DAY_OPTIONS = Array.from({ length: MAX_GOAL_DAYS - MIN_GOAL_DAYS + 1 }, (_, index) => MIN_GOAL_DAYS + index)

interface GoalPickerProps {
  /** The goal as the server reports it. Decides the starting number and the "changes on" note. */
  goal: GoalState
  /** Saves the chosen number of days. The parent shows the result as a toast. */
  onSet: (days: number) => Promise<void>
}

/**
 * A big number, its label, seven buttons from 1 to 7, and a Set goal button. It starts on the
 * pending goal if there is one, otherwise the current goal, otherwise 3. It only collects the choice;
 * the parent saves it and decides what to tell the user.
 */
export function GoalPicker({ goal, onSet }: GoalPickerProps) {
  const [days, setDays] = useState(() => initialGoalDays(goal))
  const [isSaving, setIsSaving] = useState(false)
  const note = pendingGoalNote(goal)

  async function handleSet() {
    if (isSaving) return // ignore a second press while the first save is in progress
    setIsSaving(true)
    try {
      await onSet(days)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Box sx={{ fontFamily: home.font.body }}>
      <Typography
        component="p"
        aria-live="polite"
        sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 96, lineHeight: 1, textAlign: 'center', mt: 6, color: c.text, fontVariantNumeric: 'tabular-nums' }}
      >
        {days}
      </Typography>
      <Typography component="p" sx={{ textAlign: 'center', color: c.day, mt: 1, minHeight: 24 }}>
        {goalLabel(days)}
      </Typography>

      <Box role="radiogroup" aria-label="Days per week" sx={{ display: 'flex', gap: '6px', mt: 6 }}>
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

      <Typography component="p" sx={{ textAlign: 'center', color: c.muted, fontSize: 13, mt: 3 }}>
        Days per week. You can change this later in Profile.
      </Typography>

      {note && (
        <Box role="status" sx={{ bgcolor: c.accentSoft, border: `1px solid ${c.accentBorder}`, borderRadius: '14px', p: '10px 14px', mt: 4, fontSize: 14, color: c.text }}>
          {note}
        </Box>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        disabled={isSaving}
        aria-busy={isSaving}
        onClick={() => void handleSet()}
        startIcon={isSaving ? <Loader color="currentColor" /> : undefined}
        sx={{ mt: 6 }}
      >
        {isSaving ? 'Saving…' : 'Set goal'}
      </Button>
    </Box>
  )
}
