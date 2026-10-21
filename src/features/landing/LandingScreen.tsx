import GoogleIcon from '@mui/icons-material/Google'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { PRIVACY_POLICY_URL } from '../../config/constants'
import { useCmsValue } from '../../hooks/useCmsValue'
import {
  AuthNotConfiguredError,
  AuthRedirectUnavailableError,
  consumeRedirectError,
  signInWithGoogle,
} from '../../services/authService'
import { CMS_ENTRIES } from '../../services/cmsService'
import { isSupabaseConfigured } from '../../services/supabaseClient'
import { BrandDot, BrandO } from './BrandMark'
import { LandingBanner } from './LandingBanner'
import { landing } from './landingTheme'
import { TermsDialog } from './TermsDialog'

const FOCUS = { outline: `2px solid ${landing.color.focusRing}`, outlineOffset: 3 }

/**
 * The first screen a signed-out visitor sees. Both buttons start the app's one existing Google
 * sign-in (Google does not distinguish signing up from signing in), so there is no second login
 * path to keep in sync. A shared flag stops a second request while one is in progress.
 */
export function LandingScreen() {
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  // Fetched the first time the popup opens, and kept here so reopening it does not fetch again.
  const [termsRequested, setTermsRequested] = useState(false)
  const terms = useCmsValue(CMS_ENTRIES.termsAndConditions, termsRequested)
  // Read once on first render, because it also removes the error from the address bar.
  const [errorMessage, setErrorMessage] = useState<string | null>(() => consumeRedirectError())

  // After leaving for Google and pressing the browser's Back button, the page may be restored exactly
  // as it was. Without this the buttons would stay stuck on "Redirecting…".
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setIsRedirecting(false)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  async function handleSignIn() {
    if (isRedirecting) return // ignore a second press while one request is in progress
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
          : error instanceof AuthRedirectUnavailableError
            ? 'Sign-in cannot start from this address. Open Showup from its normal web address (https://...) and try again.'
            : 'We could not start Google sign-in. Check your internet connection and try again.',
      )
    }
  }

  const disabled = isRedirecting || !isSupabaseConfigured
  const linkSx = {
    color: landing.color.supporting,
    textDecorationColor: 'currentColor',
    textUnderlineOffset: 3,
    '&:hover': { color: landing.color.heading },
    '&:focus-visible': FOCUS,
    borderRadius: 1,
  }

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        backgroundColor: landing.color.page,
        display: 'flex',
        justifyContent: 'center',
        alignItems: { xs: 'stretch', sm: 'center' },
        p: { xs: 2, sm: 6 },
        fontFamily: landing.font.body,
      }}
    >
      <Box
        component="main"
        sx={{
          width: '100%',
          maxWidth: 520,
          backgroundColor: landing.color.container,
          border: `1px solid ${landing.color.containerBorder}`,
          borderRadius: `${landing.radius.container}px`,
          px: { xs: 5, sm: 8 },
          py: { xs: 8, sm: 10 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: { xs: 7, sm: 8 },
        }}
      >
        {/* Wordmark */}
        <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <BrandDot />
          <Typography
            component="p"
            sx={{
              fontFamily: landing.font.display,
              fontWeight: 700,
              fontSize: '2rem',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: landing.color.heading,
            }}
          >
            Sh
            <BrandO />
            wup
          </Typography>
        </Box>

        <LandingBanner />

        {/* Headline and description */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontFamily: landing.font.display,
              fontWeight: 700,
              fontSize: { xs: 'clamp(2.5rem, 12.5vw, 3.5rem)', sm: '3.75rem' },
              lineHeight: 1.04,
              letterSpacing: '-0.03em',
              color: landing.color.heading,
            }}
          >
            {/* Plain text for screen readers; the decorative styling of the "o" is visual only. */}
            <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              Show up for yourself.
            </Box>
            <span aria-hidden>
              Sh
              <BrandO />w up for yourself.
            </span>
          </Typography>
          <Typography
            sx={{ fontFamily: landing.font.body, fontSize: '1.125rem', lineHeight: 1.6, color: landing.color.supporting }}
          >
            Pick your gym and a weekly goal. Showup confirms you were there and counts every visit.
          </Typography>
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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

          <Button
            variant="contained"
            fullWidth
            disabled={disabled}
            aria-busy={isRedirecting}
            onClick={() => void handleSignIn()}
            startIcon={
              isRedirecting ? (
                <CircularProgress size={22} thickness={5} color="inherit" aria-hidden />
              ) : (
                <Box
                  aria-hidden
                  sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: '#FFFFFF', color: landing.color.primary, display: 'grid', placeItems: 'center' }}
                >
                  <GoogleIcon sx={{ fontSize: 22 }} />
                </Box>
              )
            }
            sx={{
              minHeight: 66,
              borderRadius: `${landing.radius.button}px`,
              fontFamily: landing.font.body,
              fontWeight: 600,
              fontSize: '1.25rem',
              gap: 1,
              '&.MuiButton-colorPrimary.MuiButton-contained': { backgroundColor: landing.color.primary, color: landing.color.onPrimary },
              '&.MuiButton-colorPrimary.MuiButton-contained:hover': { backgroundColor: landing.color.primaryHover },
              '&.Mui-focusVisible': FOCUS,
            }}
          >
            {isRedirecting ? 'Redirecting to Google…' : 'Sign up with Google'}
          </Button>

          <Button
            variant="text"
            fullWidth
            disabled={disabled}
            onClick={() => void handleSignIn()}
            sx={{
              minHeight: 52,
              borderRadius: `${landing.radius.button}px`,
              fontFamily: landing.font.body,
              fontWeight: 600,
              fontSize: '1.125rem',
              color: landing.color.heading,
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
              '&.Mui-focusVisible': FOCUS,
              '&.Mui-disabled': { color: landing.color.supporting },
            }}
          >
            I already have an account
          </Button>
        </Box>

        {/* Legal */}
        <Typography
          sx={{ fontFamily: landing.font.body, fontSize: '0.875rem', lineHeight: 1.6, textAlign: 'center', color: landing.color.supporting }}
        >
          By continuing you agree to the{' '}
          <Link component="button" type="button" onClick={() => {
              setTermsRequested(true)
              setTermsOpen(true)
            }} sx={{ ...linkSx, font: 'inherit', verticalAlign: 'baseline' }}>
            Terms
          </Link>{' '}
          and{' '}
          {PRIVACY_POLICY_URL ? (
            <Link href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" sx={linkSx}>
              Privacy Policy
            </Link>
          ) : (
            // No policy page exists yet; shown as plain text rather than a dead link.
            <span>Privacy Policy</span>
          )}
          .
        </Typography>
      </Box>

      <TermsDialog open={termsOpen} onClose={() => setTermsOpen(false)} terms={terms} />
    </Box>
  )
}
