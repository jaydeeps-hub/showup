import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { tokens } from '../../design-system/tokens'

/**
 * The top row of the gym screen when it was opened from Profile ("Change gym"): just the back arrow, which returns to
 * Profile. There is no progress bar or step count, because this is not a step of onboarding.
 */
export function GymScreenBack({ onBack, disabled = false }: { onBack: () => void; disabled?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: '28px', flex: 'none' }}>
      <IconButton
        aria-label="Back"
        onClick={onBack}
        // Leaving while a save is on its way would drop the screen that owns the hand-off.
        disabled={disabled}
        sx={{ width: 44, height: 44, borderRadius: `${tokens.radius.small}px`, color: tokens.color.textPrimary }}
      >
        <ArrowBackRounded aria-hidden sx={{ fontSize: 22 }} />
      </IconButton>
    </Box>
  )
}
