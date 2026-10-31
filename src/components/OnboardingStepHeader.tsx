import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { tokens } from '../design-system/tokens'
import { ONBOARDING_STEP_COUNT, progressPercent } from '../utils/onboardingProgress'

interface OnboardingStepHeaderProps {
  /** Which step this is, starting at 1. */
  step: number
  /** How many steps there are. */
  total?: number
  /**
   * What the back arrow does. Leave it out on a step with nowhere sensible to go back to: the arrow is then not
   * drawn (and the space it took is kept, so the bar and the count do not move).
   */
  onBack?: () => void
  /**
   * Leave out the progress bar and the count. The weekly goal screen does this when it is opened from Home, where it
   * is not a step of anything; the back arrow is then all there is.
   */
  hideProgress?: boolean
  /**
   * This step never has a back arrow (the first one), so no room is kept for it and the progress bar starts at the left
   * edge of the content, in line with the title and the fields. Without this, a missing `onBack` only means the arrow is
   * off for a moment (while something is saving), and its room is kept so the bar does not jump.
   */
  noArrow?: boolean
}

/**
 * The top row of an onboarding step: a back arrow, a progress bar (accent fill on a line-colour track) and
 * "1 of 3". Onboarding screens have no tab bar, so this is the only navigation on them.
 */
export function OnboardingStepHeader({ step, total = ONBOARDING_STEP_COUNT, onBack, hideProgress = false, noArrow = false }: OnboardingStepHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px', mb: '28px' }}>
      {noArrow ? null : onBack ? (
        <IconButton
          aria-label="Back"
          onClick={onBack}
          sx={{ width: 44, height: 44, borderRadius: `${tokens.radius.small}px`, color: tokens.color.textPrimary }}
        >
          <ArrowBackRounded aria-hidden sx={{ fontSize: 22 }} />
        </IconButton>
      ) : (
        <Box aria-hidden sx={{ width: 44, height: 44, flex: 'none' }} />
      )}

      {!hideProgress && (
        <>
          {/* Decorative: the "1 of 3" next to it says the same thing in words. */}
          <Box aria-hidden sx={{ flex: 1, height: 4, borderRadius: '2px', backgroundColor: tokens.color.surface2, overflow: 'hidden' }}>
            <Box data-testid="step-progress" sx={{ height: '100%', width: `${progressPercent(step, total)}%`, backgroundColor: tokens.color.accentPrimary }} />
          </Box>

          <Box component="span" aria-label={`Step ${step} of ${total}`} sx={{ fontSize: 13, color: tokens.color.textSecondary }}>
            {step} of {total}
          </Box>
        </>
      )}
    </Box>
  )
}
