import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import type { Session } from '@supabase/supabase-js'
import { useMemo, useState } from 'react'
import { BottomNav, type AppTab } from '../components/BottomNav'
import { HomeScreen } from '../features/attendance/HomeScreen'
import { LandingScreen } from '../features/landing/LandingScreen'
import { GoalScreen } from '../features/goal/GoalScreen'
import { GymSetupScreen } from '../features/gym/GymSetupScreen'
import { PauseScreen } from '../features/pause/PauseScreen'
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
 * loading profile → onboarding (profile incomplete) → loading gym → set goal →
 * gym setup (no gym, or changing it) → the three tabs (Home, Pause, Profile) with the bottom tab bar.
 * There is no router: with a few screens, a few if-statements are clearer.
 */
function SignedInApp({ session }: { session: Session }) {
  const user: SignedInUser = useMemo(() => getIdentity(session.user), [session.user])
  const showup = useShowup(user)
  // Loaded separately from sign-in: it decides whether to show onboarding.
  const profile = useProfile(session.user.id)
  const [isChangingGym, setIsChangingGym] = useState(false)
  const [isSettingGoal, setIsSettingGoal] = useState(false)
  // Which tab is showing: Home, Pause or Profile.
  const [tab, setTab] = useState<AppTab>('home')
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

    // Full-screen steps without the tab bar. Each has its own Back or Cancel, and the tab you came
    // from is still selected when you return. Home loads fresh numbers when it comes back.
    if (isSettingGoal) return <GoalScreen onBack={() => setIsSettingGoal(false)} />

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

    // The three tabs. The Profile tab needs a loaded profile; without one, Home is shown instead.
    const profileReady = profile.status === 'ready'
    const activeTab: AppTab = tab === 'profile' && !profileReady ? 'home' : tab
    // A location check is running: staying on Home lets its result be seen (the name button does the same).
    const lockedTabs: AppTab[] = showup.isVerifying ? ['pause', 'profile'] : !profileReady ? ['profile'] : []

    return (
      <>
        {activeTab === 'home' && (
          <HomeScreen
            // The saved first and last name; the Google account name is only a fallback while the profile is unavailable.
            displayName={getDisplayName(profileReady ? profile.profile : null, user.username)}
            gym={showup.gym}
            isVerifying={showup.isVerifying}
            onShowUp={showup.showUp}
            onManageProfile={profileReady ? () => setTab('profile') : undefined}
            onSetGoal={() => setIsSettingGoal(true)}
            onSignOut={() => void handleSignOut()}
          />
        )}
        {activeTab === 'pause' && <PauseScreen />}
        {activeTab === 'profile' && profile.status === 'ready' && (
          <ManageProfileScreen
            profile={profile.profile}
            email={session.user.email ?? null}
            gym={showup.gym}
            onSave={profile.save}
            onChangeSearchMode={profile.setPlaceSearchMode}
            onChangeGym={() => setIsChangingGym(true)}
            onSignOut={() => void handleSignOut()}
          />
        )}
        <BottomNav active={activeTab} onSelect={setTab} disabled={lockedTabs} />
      </>
    )
  }
}
