import GoogleIcon from '@mui/icons-material/Google'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { ScreenLayout } from '../../components/ScreenLayout'
import { AuthNotConfiguredError, consumeRedirectError, signInWithGoogle } from '../../services/authService'
import { isSupabaseConfigured } from '../../services/supabaseClient'

/** Sign-in screen shown to anyone who is signed out. */
export function LoginScreen() {
  const [isRedirecting, setIsRedirecting] = useState(false)
  // Read once on first render, because it also removes the error from the address bar.
  const [errorMessage, setErrorMessage] = useState<string | null>(() => consumeRedirectError())

  // After leaving for Google and pressing the browser's Back button, the browser may restore
  // this page exactly as it was. Without this, the button would stay stuck on "Redirecting…".
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setIsRedirecting(false)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  async function handleContinueWithGoogle() {
    setErrorMessage(null)
    setIsRedirecting(true)
    try {
      await signInWithGoogle() // the browser navigates to Google; the page unloads
    } catch (error) {
      console.error('Google sign-in failed', error)
      setIsRedirecting(false)
      setErrorMessage(
        error instanceof AuthNotConfiguredError
          ? 'Sign-in is not set up yet. See the README to add your Supabase settings.'
          : 'We could not start Google sign-in. Check your internet connection and try again.',
      )
    }
  }

  return (
    <ScreenLayout>
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography variant="h1" component="h1">
            Welcome
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Sign in to track your gym visits.
          </Typography>
        </Stack>

        {!isSupabaseConfigured && (
          <Alert severity="warning">
            Sign-in is not set up yet. Copy <code>.env.example</code> to <code>.env.local</code>, add{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart{' '}
            <code>npm run dev</code>.
          </Alert>
        )}

        {errorMessage && (
          <Alert severity="error" onClose={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

        <Stack spacing={3}>
          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={isRedirecting || !isSupabaseConfigured}
            aria-busy={isRedirecting}
            onClick={() => void handleContinueWithGoogle()}
            startIcon={
              isRedirecting ? <CircularProgress size={20} thickness={5} color="inherit" aria-hidden /> : <GoogleIcon />
            }
          >
            {isRedirecting ? 'Redirecting to Google…' : 'Continue with Google'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
            Showup uses your Google account only to sign you in.
          </Typography>
        </Stack>
      </Stack>
    </ScreenLayout>
  )
}
