import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ScreenLayout } from '../components/ScreenLayout'

interface StorageProblemScreenProps {
  problem: 'unavailable' | 'corrupted'
  onReset: () => void
  onContinueWithoutSaving: () => void
}

/** Shown instead of crashing when localStorage is blocked or holds bad data. */
export function StorageProblemScreen({ problem, onReset, onContinueWithoutSaving }: StorageProblemScreenProps) {
  return (
    <ScreenLayout>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {problem === 'corrupted' ? 'Saved data could not be read' : 'Storage is unavailable'}
        </Typography>

        {problem === 'corrupted' ? (
          <>
            <Alert severity="error">
              The Showup data saved in this browser is damaged or from an incompatible version. Resetting deletes it
              and starts fresh.
            </Alert>
            <Button variant="contained" size="large" onClick={onReset}>
              Reset demo data
            </Button>
          </>
        ) : (
          <>
            <Alert severity="warning">
              This browser is blocking local storage (this can happen in private browsing or with strict privacy
              settings). You can still use Showup, but everything will be lost when you close or reload the page.
            </Alert>
            <Button variant="contained" size="large" onClick={onContinueWithoutSaving}>
              Continue without saving
            </Button>
            <Button variant="text" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </>
        )}
      </Stack>
    </ScreenLayout>
  )
}
