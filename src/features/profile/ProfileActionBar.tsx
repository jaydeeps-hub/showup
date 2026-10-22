import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { Loader } from '../../components/Loader'
import { SAFE_AREA_BOTTOM, TAB_BAR_HEIGHT } from '../../components/BottomNav'
import { tokens } from '../../design-system/tokens'

/** The bar's height in pixels (12px padding above and below a 60px button, plus the 1px top border). */
export const ACTION_BAR_HEIGHT = 85

interface ProfileActionBarProps {
  isSaving: boolean
  onCancel: () => void
}

/**
 * Cancel and Save changes, pinned just above the bottom tab bar while the profile is being edited.
 * Save is the form's submit button, so this must be rendered inside the form. Screens that show it
 * add ACTION_BAR_HEIGHT of bottom space so the bar never covers the content.
 */
export function ProfileActionBar({ isSaving, onCancel }: ProfileActionBarProps) {
  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: `calc(${TAB_BAR_HEIGHT}px + ${SAFE_AREA_BOTTOM})`,
        zIndex: (theme) => theme.zIndex.appBar,
        boxSizing: 'border-box',
        height: ACTION_BAR_HEIGHT,
        bgcolor: tokens.color.background,
        borderTop: `${tokens.border.width}px solid ${tokens.color.border}`,
        px: 6,
        py: 3,
      }}
    >
      <Box sx={{ display: 'flex', gap: '10px', maxWidth: 600, mx: 'auto' }}>
        <Button
          type="button"
          color="inherit"
          disabled={isSaving}
          onClick={onCancel}
          sx={{ width: 112, flexShrink: 0, height: 60, borderRadius: '16px', bgcolor: tokens.color.surface1, '&:hover': { bgcolor: tokens.color.surface2 } }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isSaving}
          aria-busy={isSaving}
          startIcon={isSaving ? <Loader color="currentColor" /> : undefined}
          sx={{ flex: 1, height: 60, borderRadius: '16px' }}
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </Box>
    </Box>
  )
}
