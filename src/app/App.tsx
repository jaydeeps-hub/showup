import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import type { Session } from '@supabase/supabase-js'
import { useMemo, useState } from 'react'
import { HomeScreen } from '../features/attendance/HomeScreen'
import { LandingScreen } from '../features/landing/LandingScreen'
import { GymSetupScreen } from '../features/gym/GymSetupScreen'
import { ManageProfileScreen } from '../features/profile/ManageProfileScreen'
import { OnboardingScreen } from '../features/profile/OnboardingScreen'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useShowup, type SignedInUser } from '../hooks/useShowup'
import { getIdentity, signOut } from '../services/authService'
import { getDisplayName, isProfileComplete } from '../utils/profileValidation'
import { LoadingScreen } from './LoadingScreen'
import { DataLoadErrorScreen } from './DataLoadErrorScreen'

/**
 * Top level: decides between loading, the sign-in screen and the Showup app,
 * based on whether someone is signed in with Supabase.
 */
export function App() {
  const auth = useAuth()

  if (auth.status === 'loading') return <LoadingScreen />
  if (auth.status === 'signed-out') return <LandingScreen />
  return <SignedInApp session={auth.session} />
}

/**
 * Chooses which Showup screen to show, in this order:
 * loading profile → onboarding (profile incomplete) → loading gym → manage profile →
 * gym setup (no gym) → home.
 * There is no router: with a few screens, a few if-statements are clearer.
 */
function SignedInApp({ session }: { session: Session }) {
  const user: SignedInUser = useMemo(() => getIdentity(session.user), [session.user])
  const showup = useShowup(user)
  // Loaded separately from sign-in: it decides whether to show onboarding.
  const profile = useProfile(session.user.id)
  const [isChangingGym, setIsChangingGym] = useState(false)
  const [isManagingProfile, setIsManagingProfile] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut() {
    setSignOutError(null)
    try {
      await signOut() // the auth listener then switches the app to the login screen
    } catch (error) {
      console.error('Sign-out failed', error)
      setSignOutError('We could not sign you out. Please try again.')
    }
  }

  return (
    <>
      {profile.status === 'missing' && (
        <Alert severity="warning" square>
          Your account is signed in, but its profile was not found. The database migrations that create profiles have
          probably not been applied yet. See docs/SETUP_SUPABASE.md.
        </Alert>
      )}
      {profile.status === 'error' && (
        <Alert
          severity="warning"
          square
          action={
            <Button color="inherit" size="small" onClick={profile.reload}>
              Retry
            </Button>
          }
        >
          Your profile could not be loaded ({profile.message}). Showup still works; you can retry or check
          docs/SETUP_SUPABASE.md.
        </Alert>
      )}
      {signOutError && (
        <Alert severity="error" square onClose={() => setSignOutError(null)}>
          {signOutError}
        </Alert>
      )}
      {renderScreen()}
    </>
  )

  function renderScreen() {
    // Wait for the profile so a new user never sees the gym screen flash before onboarding.
    if (profile.status === 'loading') return <LoadingScreen />

    // New users (no first or last name yet) complete their profile first. Once it is saved the
    // profile is complete, so this is skipped on every later visit and after a refresh.
    if (profile.status === 'ready' && !isProfileComplete(profile.profile)) {
      return <OnboardingScreen profile={profile.profile} onSave={profile.save} />
    }

    // Wait for the gym and Showup count, so we never show "choose your gym" to someone who has one.
    if (showup.dataStatus === 'loading') return <LoadingScreen />
    if (showup.dataStatus === 'error') {
      return (
        <DataLoadErrorScreen
          message={showup.loadError ?? "We couldn't load your data."}
          onRetry={showup.reload}
          onSignOut={() => void handleSignOut()}
        />
      )
    }

    if (isManagingProfile && profile.status === 'ready') {
      return (
        <ManageProfileScreen
          profile={profile.profile}
          email={session.user.email ?? null}
          gym={showup.gym}
          onSave={profile.save}
          onChangeSearchMode={profile.setPlaceSearchMode}
          onChangeGym={() => {
            setIsManagingProfile(false)
            setIsChangingGym(true)
          }}
          onClose={() => setIsManagingProfile(false)}
          onSignOut={() => {
            setIsManagingProfile(false)
            void handleSignOut()
          }}
        />
      )
    }

    if (!showup.gym || isChangingGym) {
      return (
        <GymSetupScreen
          onSave={async (place) => {
            const result = await showup.saveGym(place)
            if (result.ok) setIsChangingGym(false)
            return result
          }}
          onCancel={showup.gym ? () => setIsChangingGym(false) : undefined}
          // Only a loaded profile can widen the search; in every other case it stays restricted.
          searchMode={profile.status === 'ready' ? profile.profile.placeSearchMode : 'fitness_only'}
        />
      )
    }

    return (
      <HomeScreen
        // The saved first and last name; the Google account name is only a fallback while the profile is unavailable.
        displayName={getDisplayName(profile.status === 'ready' ? profile.profile : null, user.username)}
        gym={showup.gym}
        showupCount={showup.showupCount}
        isVerifying={showup.isVerifying}
        onShowUp={showup.showUp}
        onManageProfile={profile.status === 'ready' ? () => setIsManagingProfile(true) : undefined}
        onSignOut={() => void handleSignOut()}
      />
    )
  }
}
