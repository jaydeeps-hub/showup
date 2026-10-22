import AddRounded from '@mui/icons-material/AddRounded'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { home } from '../../design-system/homeTokens'
import { MAX_GOAL_DAYS, MIN_GOAL_DAYS } from '../../utils/goal'

const c = home.color

interface GoalStepperProps {
  days: number
  onChange: (days: number) => void
  disabled?: boolean
}

/** A compact − / + control for the number of days a week, used when editing the profile. */
export function GoalStepper({ days, onChange, disabled = false }: GoalStepperProps) {
  const button = {
    width: 44,
    height: 44,
    borderRadius: '12px',
    bgcolor: c.surface2,
    color: c.text,
    '&:hover': { bgcolor: c.surface2 },
    '&.Mui-disabled': { opacity: 0.35, color: c.text },
  } as const

  return (
    <Box
      role="group"
      aria-label="Weekly goal"
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: c.surface, border: `1.5px solid ${c.line}`, borderRadius: '14px', height: 54, px: '6px' }}
    >
      <IconButton aria-label="Fewer days" disabled={disabled || days <= MIN_GOAL_DAYS} onClick={() => onChange(Math.max(MIN_GOAL_DAYS, days - 1))} sx={button}>
        <RemoveRounded />
      </IconButton>
      <Box component="span" aria-live="polite" sx={{ color: c.text, fontSize: 16 }}>
        <Box component="b" sx={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: 18 }}>
          {days}
        </Box>{' '}
        {days === 1 ? 'day' : 'days'} a week
      </Box>
      <IconButton aria-label="More days" disabled={disabled || days >= MAX_GOAL_DAYS} onClick={() => onChange(Math.min(MAX_GOAL_DAYS, days + 1))} sx={button}>
        <AddRounded />
      </IconButton>
    </Box>
  )
}
