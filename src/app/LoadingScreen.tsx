import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

/** Shown briefly while the app checks for a saved sign-in. */
export function LoadingScreen() {
  return (
    <Stack
      role="status"
      spacing={3}
      sx={{ minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}
    >
      <CircularProgress size={32} thickness={4} aria-hidden />
      <Typography variant="body2">Loading…</Typography>
    </Stack>
  )
}
