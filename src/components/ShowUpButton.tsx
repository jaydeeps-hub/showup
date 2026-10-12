import Button from '@mui/material/Button'

interface ShowUpButtonProps {
  isVerifying: boolean
  onClick: () => void
}

/** The large circular SHOW UP button. Disabled while a location check runs. */
export function ShowUpButton({ isVerifying, onClick }: ShowUpButtonProps) {
  return (
    <Button
      variant="contained"
      onClick={onClick}
      disabled={isVerifying}
      aria-busy={isVerifying}
      sx={{
        width: 'min(70vw, 240px)',
        aspectRatio: '1 / 1',
        borderRadius: '50%',
        fontSize: isVerifying ? '1rem' : '1.75rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        // Keep the disabled state readable instead of MUI's default near-invisible grey.
        '&.Mui-disabled': { bgcolor: 'action.selected', color: 'text.primary' },
      }}
    >
      {isVerifying ? 'Checking location…' : 'Show up'}
    </Button>
  )
}
