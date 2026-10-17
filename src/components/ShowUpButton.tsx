import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { tokens } from '../design-system/tokens'

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
        fontSize: '1.125rem',
        lineHeight: '1.5rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        boxShadow: tokens.shadow.card,
        // Disabled stays readable (and clearly "busy") rather than fading to near-invisible.
        '&.Mui-disabled': {
          backgroundColor: 'background.paper',
          color: 'text.secondary',
          border: `1px solid ${tokens.color.borderStrong}`,
          boxShadow: 'none',
        },
      }}
    >
      {isVerifying ? (
        <>
          <CircularProgress size={32} thickness={4} color="primary" aria-hidden />
          <span style={{ fontSize: '0.875rem', letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>
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
