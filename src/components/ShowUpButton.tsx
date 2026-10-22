import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import Button from '@mui/material/Button'
import { tokens } from '../design-system/tokens'
import { Loader } from './Loader'

interface ShowUpButtonProps {
  isVerifying: boolean
  onClick: () => void
}

/**
 * The one primary action on the home screen: a large circular button.
 * While a location check runs it is disabled and shows a spinner plus status text.
 */
export function ShowUpButton({ isVerifying, onClick }: ShowUpButtonProps) {
  return (
    <Button
      variant="contained"
      onClick={onClick}
      disabled={isVerifying}
      aria-busy={isVerifying}
      sx={{
        width: 'min(56vw, 208px)',
        minWidth: 160,
        aspectRatio: '1 / 1',
        borderRadius: `${tokens.radius.pill}px`,
        flexDirection: 'column',
        gap: 3,
        padding: 4,
        fontFamily: tokens.font.display,
        fontSize: '1.25rem',
        lineHeight: 1.2,
        fontWeight: 700,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        // Busy state: a quiet surface with a subtle border, text still readable.
        '&.Mui-disabled, &.MuiButton-colorPrimary.Mui-disabled': {
          backgroundColor: tokens.color.surface1,
          color: tokens.color.textSecondary,
          border: `${tokens.border.width}px solid ${tokens.color.border}`,
        },
      }}
    >
      {isVerifying ? (
        <>
          <Loader size={32} />
          <span style={{ fontFamily: tokens.font.body, fontSize: '0.875rem', letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>
            Checking your location…
          </span>
        </>
      ) : (
        <>
          <FitnessCenterRounded sx={{ fontSize: 40 }} aria-hidden />
          Show up
        </>
      )}
    </Button>
  )
}
