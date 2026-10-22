import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Loader } from '../components/Loader'

/** Shown briefly while the app checks for a saved sign-in, and while the profile and gym load. */
export function LoadingScreen() {
  return (
    <Stack
      role="status"
      spacing={3}
      sx={{ minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}
    >
      <Loader size={32} />
      <Typography variant="body2">Loading…</Typography>
    </Stack>
  )
}
