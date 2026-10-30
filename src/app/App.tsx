import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { BottomNav, type AppTab } from '../components/BottomNav'
import { ShowupFeedback } from '../components/ShowupFeedback'
import { Toast, type ToastContent } from '../components/Toast'
import { HomeScreen } from '../features/attendance/HomeScreen'
import { LandingScreen } from '../features/landing/LandingScreen'
import { GoalScreen } from '../features/goal/GoalScreen'
import { GymSetupScreen, GYM_SAVED_PAUSE_MS } from '../features/gym/GymSetupScreen'
import { QuickStartScreen } from '../features/quickstart/QuickStartScreen'
import { PauseScreen } from '../features/pause/PauseScreen'
import { ManageProfileScreen } from '../features/profile/ManageProfileScreen'
import { OnboardingScreen } from '../features/profile/OnboardingScreen'
import { useShowupSession } from '../hooks/showupSessionContext'
import { useAuth } from '../hooks/useAuth'
import { useQuickStartItems } from '../hooks/useCmsContent'
import { useProfile } from '../hooks/useProfile'
import { useQuickStart } from '../hooks/useQuickStart'
import { useSaveDeviceTimezone } from '../hooks/useSaveDeviceTimezone'
import { useShowup, type SignedInUser } from '../hooks/useShowup'
import { ShowupProvider } from '../hooks/useShowupSession'
import { getIdentity, signOut } from '../services/authService'
import { needsQuickStart, quickStartEndingLabel } from '../utils/cms'
import { getFirstName, isProfileComplete } from '../utils/profileValidation'
import { LoadingScreen } from './LoadingScreen'
import { DataLoadErrorScreen } from './DataLoadErrorScreen'

/** The longest the gym screen is kept up after a save: the screen's own pause, plus room for it to finish. */
const GYM_SAVED_HOLD_LIMIT_MS = GYM_SAVED_PAUSE_MS + 1500

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
 * loading profile → Quick Start (once, if the person has not finished it) → onboarding (profile incomplete) →
 * loading gym → set goal →
 * gym setup (no gym, or changing it) → the three tabs (Home, Pause, Profile) with the bottom tab bar.
 * There is no router: with a few screens, a few if-statements are clearer.
 *
 * The timed Show Up (ShowupProvider) wraps ALL of it, not just the tabs: the timer keeps running and its
 * checks keep firing while the user is on Set goal, Change gym, or any tab.
 */
function SignedInApp({ session }: { session: Session }) {
  const user: SignedInUser = useMemo(() => getIdentity(session.user), [session.user])
  // Weeks and dates are worked out in the user's own time zone, so the database needs to know it.
  useSaveDeviceTimezone(user.id)
  const showup = useShowup(user)
  // Loaded separately from sign-in: it decides whether to show onboarding.
  const profile = useProfile(session.user.id)
  const [isChangingGym, setIsChangingGym] = useState(false)
  // True from the moment a gym is saved until its "<name> saved" message has been shown. The gym is already stored by
  // then, and without this the screen would disappear (no gym screen is needed once there is a gym) before it showed.
  const [gymSavedShowing, setGymSavedShowing] = useState(false)
  // "<name> saved". It lives here, not in the gym screen, so it stays up after that screen has gone.
  const [gymToast, setGymToast] = useState<ToastContent | null>(null)
  // The gym screen normally ends the hold-back itself, a moment after the save. If that screen goes away first (the
  // profile reloads, say), nothing would ever end it, and a new gym screen would be stranded on "2 of 3". So the hold
  // also ends by itself a little later than the screen's own pause.
  useEffect(() => {
    if (!gymSavedShowing) return
    const timer = setTimeout(() => setGymSavedShowing(false), GYM_SAVED_HOLD_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [gymSavedShowing])
  const [isSettingGoal, setIsSettingGoal] = useState(false)
  // Which tab is showing: Home, Pause or Profile.
  const [tab, setTab] = useState<AppTab>('home')
  const [signOutError, setSignOutError] = useState<string | null>(null)

  // The Quick Start. Whether to show it is decided ONCE, when the app opens with a loaded profile, from what
  // the person had and what content there was at that moment: a refresh of the content later in the visit
  // never makes it appear out of nowhere. `null` means "not decided yet".
  const quickStartItems = useQuickStartItems()
  const quickStart = useQuickStart(user.id)
  const [openedWithQuickStart, setOpenedWithQuickStart] = useState<boolean | null>(null)
  const [quickStartClosed, setQuickStartClosed] = useState(false)
  if (openedWithQuickStart === null && profile.status === 'ready') {
    setOpenedWithQuickStart(needsQuickStart(profile.profile, quickStartItems, quickStart.finishPending))
  }
  // The same screen, opened from the Profile tab by choice. It never records anything.
  const [quickStartFromProfile, setQuickStartFromProfile] = useState(false)

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
    <ShowupProvider gymId={showup.gym?.id ?? null} userId={user.id}>
      <ShowupFeedback />
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
      <Toast toast={gymToast} onClose={() => setGymToast(null)} />
    </ShowupProvider>
  )

  function renderScreen() {
    // Wait for the profile so a new user never sees the gym screen flash before onboarding.
    if (profile.status === 'loading') return <LoadingScreen />

    // The Quick Start comes BEFORE whatever the app would show next (onboarding for a new person, otherwise
    // Home), then that screen follows. Finishing or skipping records it; with no cards it is never shown
    // and nothing is recorded.
    if (profile.status === 'ready' && openedWithQuickStart === true && !quickStartClosed && quickStartItems.length > 0) {
      return (
        <QuickStartScreen
          items={quickStartItems}
          lastLabel={quickStartEndingLabel(profile.profile)}
          onFinish={() => {
            setQuickStartClosed(true)
            void quickStart.finish()
          }}
        />
      )
    }

    // New users (no first or last name yet) complete their profile first. Once it is saved the
    // profile is complete, so this is skipped on every later visit and after a refresh.
    if (profile.status === 'ready' && !isProfileComplete(profile.profile)) {
      // The first step has nothing before it except the landing page, and for someone already signed in
      // "back to the start" means signing out (the auth listener then shows the landing page).
      return <OnboardingScreen profile={profile.profile} onSave={profile.save} onBack={() => void handleSignOut()} />
    }

    // Wait for the gym, so we never show "choose your gym" to someone who has one.
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

    if (!showup.gym || isChangingGym || gymSavedShowing) {
      return (
        <GymSetupScreen
          // The same screen is step 2 of onboarding (no gym yet) or "Change gym" from Profile (a gym already exists).
          isOnboarding={!isChangingGym && (!showup.gym || gymSavedShowing)}
          onSave={async (place) => {
            const result = await showup.saveGym(place)
            if (result.ok) setGymSavedShowing(true)
            return result
          }}
          onSaved={(gymName) => setGymToast({ severity: 'success', message: `${gymName} saved` })}
          // After "<name> saved": on to what comes next, or back to Profile if it was opened from there.
          onDone={() => {
            setGymSavedShowing(false)
            setIsChangingGym(false)
          }}
          // The back arrow: out of "Change gym" back to Profile. First-time setup has no earlier screen here.
          onBack={isChangingGym ? () => setIsChangingGym(false) : undefined}
          // Only a loaded profile can widen the search; in every other case it stays restricted.
          searchMode={profile.status === 'ready' ? profile.profile.placeSearchMode : 'fitness_only'}
        />
      )
    }

    // The Quick Start opened from Profile: always ends with "Done" and goes back to Profile (the tab you
    // came from is still selected). The stored "finished" time is not touched.
    if (quickStartFromProfile) {
      return <QuickStartScreen items={quickStartItems} lastLabel="Done" onFinish={() => setQuickStartFromProfile(false)} />
    }

    // The three tabs. The Profile tab needs a loaded profile; without one, Home is shown instead.
    const profileReady = profile.status === 'ready'
    const activeTab: AppTab = tab === 'profile' && !profileReady ? 'home' : tab

    return (
      <>
        {activeTab === 'home' && (
          <HomeScreen
            // The saved first name; the Google account name is only a fallback while the profile is unavailable.
            firstName={getFirstName(profileReady ? profile.profile : null, user.username)}
            gym={showup.gym}
            onSetGoal={() => setIsSettingGoal(true)}
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
            // No Quick Start cards means the feature is switched off, so the button is not offered.
            onOpenQuickStart={quickStartItems.length > 0 ? () => setQuickStartFromProfile(true) : undefined}
          />
        )}
        <AppTabBar active={activeTab} onSelect={setTab} profileReady={profileReady} />
      </>
    )
  }
}

/**
 * The bottom tab bar. It reads the Show Up engine (so it must sit inside the ShowupProvider) to decide
 * which tabs to lock: Pause and Profile are locked only while the location is being read to START a
 * Show Up, a few seconds at most. Once the timer is running they are free, because the timer and its
 * checks keep going on any tab.
 */
function AppTabBar({ active, onSelect, profileReady }: { active: AppTab; onSelect: (tab: AppTab) => void; profileReady: boolean }) {
  const { state } = useShowupSession()
  const locked: AppTab[] = state === 'checking' ? ['pause', 'profile'] : !profileReady ? ['profile'] : []
  return <BottomNav active={active} onSelect={onSelect} disabled={locked} />
}
