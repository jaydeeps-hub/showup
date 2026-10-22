import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import EditLocationAltOutlined from '@mui/icons-material/EditLocationAltOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { GymSummary } from '../../components/GymSummary'
import { ScreenLayout } from '../../components/ScreenLayout'
import { Toast, type ToastContent } from '../../components/Toast'
import { useGoalState } from '../../hooks/useGoalState'
import type { Gym, PlaceSearchMode, Profile, ProfileEdits, SaveResult } from '../../types'
import { daysText, DEFAULT_GOAL_DAYS, initialGoalDays, pendingGoalNote } from '../../utils/goal'
import { formatBirthDate, profileToFormValues } from '../../utils/profileValidation'
import { GoalStepper } from '../goal/GoalStepper'
import { PlaceSearchModeSetting } from './PlaceSearchModeSetting'
import { ProfileForm } from './ProfileForm'

interface ManageProfileScreenProps {
  profile: Profile
  /** The Google account's email, when Google provided one. Shown read-only. */
  email: string | null
  /** The user's saved gym, shown with a Change gym button. Null if none is saved yet. */
  gym: Gym | null
  onSave: (edits: ProfileEdits) => Promise<SaveResult>
  /** Changes the gym search mode. Only used (and only shown) for administrators. */
  onChangeSearchMode: (mode: PlaceSearchMode) => Promise<SaveResult>
  /** Opens the gym search so the user can pick a different gym. */
  onChangeGym: () => void
  /** Leave the page and go back to the home screen. */
  onClose: () => void
  onSignOut: () => void
}

/** One label + value pair in the read-only view. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="textSecondary" component="p">
        {label}
      </Typography>
      <Typography variant="body1" component="p">
        {value}
      </Typography>
    </Box>
  )
}

/**
 * The Profile page. Details are shown as plain text until the user presses Edit, which swaps in
 * the form; Cancel or a successful save returns to the plain view. The page also holds Change
 * gym and Sign out. Administrators additionally see the gym search mode setting; regular users
 * never do, and cannot change it even by calling the database directly.
 */
export function ManageProfileScreen(props: ManageProfileScreenProps) {
  const { profile, email, gym, onSave, onChangeSearchMode, onChangeGym, onClose, onSignOut } = props
  const [isEditing, setIsEditing] = useState(false)
  const goal = useGoalState()
  // The weekly goal being edited, and whether the stepper was used (a user with no goal starts on 3).
  const [goalDays, setGoalDays] = useState(DEFAULT_GOAL_DAYS)
  const [goalTouched, setGoalTouched] = useState(false)
  const [toast, setToast] = useState<ToastContent | null>(null)

  const loadedGoal = goal.status === 'ready' ? goal.goal : null
  const goalNote = pendingGoalNote(loadedGoal)

  function startEditing() {
    setGoalDays(initialGoalDays(loadedGoal))
    setGoalTouched(false)
    setIsEditing(true)
  }

  /** True only when the goal value really changed, so set_weekly_goal is not called for nothing. */
  function goalChanged(): boolean {
    if (!loadedGoal) return false
    return goalDays !== initialGoalDays(loadedGoal) || (!loadedGoal.hasGoal && goalTouched)
  }

  /**
   * Saves the name and birthday exactly as before, then the weekly goal if it changed. If the details
   * were saved but the goal was not, the form shows an error and keeps what was typed; pressing the
   * button again saves the details again (harmless) and retries the goal.
   */
  async function saveProfileAndGoal(edits: ProfileEdits): Promise<SaveResult> {
    const saved = await onSave(edits)
    if (!saved.ok || !goalChanged()) return saved

    const goalResult = await goal.save(goalDays)
    if (!goalResult.ok) {
      return { ok: false, message: `Your details were saved, but your goal could not be changed. ${goalResult.message}` }
    }
    setToast({ severity: 'success', message: goalResult.message })
    return { ok: true }
  }

  return (
    <ScreenLayout
      headerAction={
        <Button size="small" color="inherit" startIcon={<ArrowBackRounded />} onClick={onClose}>
          Back
        </Button>
      }
    >
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography variant="h1" component="h1">
            Your profile
          </Typography>
          <Typography variant="body1" color="textSecondary">
            {isEditing ? 'Update how we address you.' : 'Your details and gym.'}
          </Typography>
        </Stack>

        {isEditing ? (
          <ProfileForm
            initialValues={profileToFormValues(profile)}
            submitLabel="Save changes"
            onSave={saveProfileAndGoal}
            onSaved={() => setIsEditing(false)}
            onCancel={() => setIsEditing(false)}
            birthdayHelp="Optional. We use it only to wish you a happy birthday."
          >
            <Stack spacing={2}>
              <Typography variant="subtitle2" component="p">
                Weekly goal
              </Typography>
              {goal.status === 'loading' && (
                <Typography variant="body2" color="textSecondary" role="status">
                  Loading your goal…
                </Typography>
              )}
              {goal.status === 'error' && (
                <Typography variant="body2" color="textSecondary">
                  {goal.message}{' '}
                  <Button size="small" color="inherit" onClick={goal.retry}>
                    Retry
                  </Button>
                </Typography>
              )}
              {loadedGoal && (
                <>
                  <GoalStepper
                    days={goalDays}
                    onChange={(days) => {
                      setGoalDays(days)
                      setGoalTouched(true)
                    }}
                  />
                  {!loadedGoal.hasGoal && (
                    <Typography variant="body2" color="textSecondary">
                      You haven't set a weekly goal yet. Change the number to set one.
                    </Typography>
                  )}
                  {goalNote && (
                    <Typography variant="body2" color="textSecondary">
                      {goalNote}
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          </ProfileForm>
        ) : (
          <Stack spacing={4}>
            <Detail label="First name" value={profile.firstName ?? ''} />
            <Detail label="Last name" value={profile.lastName ?? ''} />
            <Detail label="Date of birth" value={formatBirthDate(profile.dateOfBirth) ?? 'Not set'} />
            <Detail
              label="Weekly goal"
              value={
                goal.status === 'loading'
                  ? 'Loading…'
                  : loadedGoal
                    ? loadedGoal.currentGoal !== null
                      ? `${daysText(loadedGoal.currentGoal)} a week`
                      : 'Not set'
                    : 'Unavailable'
              }
            />
            {goalNote && (
              <Typography variant="body2" color="textSecondary">
                {goalNote}
              </Typography>
            )}
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<EditOutlined />}
              onClick={startEditing}
              sx={{ alignSelf: 'flex-start' }}
            >
              Edit
            </Button>
          </Stack>
        )}

        <TextField
          label="Google account email"
          value={email ?? 'Not available'}
          disabled
          fullWidth
          helperText="You sign in with this Google account. It can't be changed here."
        />

        <Divider />

        {gym && <GymSummary label={`Your gym · ${gym.label}`} name={gym.name} address={gym.formattedAddress} />}
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<EditLocationAltOutlined />}
          onClick={onChangeGym}
          disabled={isEditing}
          sx={{ alignSelf: 'flex-start' }}
        >
          Change gym
        </Button>

        {/* Shown only to administrators. The database refuses anyone else, so this is a convenience, not the security. */}
        {profile.isAdmin && (
          <>
            <Divider />
            <PlaceSearchModeSetting mode={profile.placeSearchMode} onChange={onChangeSearchMode} />
          </>
        )}

        <Divider />

        <Button color="inherit" startIcon={<LogoutRounded />} onClick={onSignOut} sx={{ alignSelf: 'flex-start' }}>
          Sign out
        </Button>
      </Stack>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </ScreenLayout>
  )
}
