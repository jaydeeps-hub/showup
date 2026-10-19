import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ScreenLayout } from '../components/ScreenLayout'

interface DataLoadErrorScreenProps {
  message: string
  onRetry: () => void
  onSignOut: () => void
}

/**
 * Shown when the gym and Showup count cannot be loaded from Supabase, instead of pretending the
 * user has no gym (which would let them save a second one over the first).
 */
export function DataLoadErrorScreen({ message, onRetry, onSignOut }: DataLoadErrorScreenProps) {
  return (
    <ScreenLayout>
      <Stack spacing={6}>
        <Typography variant="h1" component="h1">
          We couldn't load your gym
        </Typography>
        <Alert severity="error">
          {message} If this keeps happening, the database setup may be incomplete (see docs/SETUP_SUPABASE.md).
        </Alert>
        <Stack spacing={2}>
          <Button variant="contained" size="large" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="text" color="inherit" onClick={onSignOut}>
            Sign out
          </Button>
        </Stack>
      </Stack>
    </ScreenLayout>
  )
}
