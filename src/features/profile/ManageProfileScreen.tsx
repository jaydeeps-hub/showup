import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import EditLocationAltOutlined from '@mui/icons-material/EditLocationAltOutlined'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { GymSummary } from '../../components/GymSummary'
import { Loader } from '../../components/Loader'
import { ScreenLayout } from '../../components/ScreenLayout'
import { Toast, type ToastContent } from '../../components/Toast'
import { home } from '../../design-system/homeTokens'
import { useGoalState } from '../../hooks/useGoalState'
import type { Gym, PlaceSearchMode, Profile, ProfileEdits, SaveResult } from '../../types'
import { daysText, DEFAULT_GOAL_DAYS, initialGoalDays, pendingGoalNote } from '../../utils/goal'
import { formatBirthDate, getDisplayName, getInitials, profileToFormValues } from '../../utils/profileValidation'
import { GoalStepper } from '../goal/GoalStepper'
import { ACTION_BAR_HEIGHT } from './ProfileActionBar'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileEditForm } from './ProfileEditForm'
import { PlaceSearchModeSetting } from './PlaceSearchModeSetting'

const c = home.color

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
  onSignOut: () => void
}

/** One row of the read view: the muted label on the left, the value on the right. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 3,
        minHeight: 54,
        borderBottom: `1px solid ${c.line}`,
      }}
    >
      <Box component="span" sx={{ color: c.muted, fontSize: 14 }}>
        {label}
      </Box>
      <Box component="b" sx={{ fontWeight: 500, textAlign: 'right', overflowWrap: 'anywhere' }}>
        {value}
      </Box>
    </Box>
  )
}

/** A small label above a control in the edit view. */
function EditLabel({ children }: { children: ReactNode }) {
  return (
    <Box component="div" sx={{ mb: 2, fontSize: 14, fontWeight: 500 }}>
      {children}
    </Box>
  )
}

/**
 * The Profile tab. It opens as a read view (avatar, name and the details as plain rows); the pencil
 * swaps in the edit view, and Cancel or a successful save returns to the read view. The page also
 * holds the Google email, Change gym and Sign out. Administrators additionally see the gym search
 * mode setting; regular users never do, and cannot change it even by calling the database directly.
 * The bottom tab bar (shown by the app) is how you leave.
 */
export function ManageProfileScreen(props: ManageProfileScreenProps) {
  const { profile, email, gym, onSave, onChangeSearchMode, onChangeGym, onSignOut } = props
  const [isEditing, setIsEditing] = useState(false)
  const goal = useGoalState()
  // The weekly goal being edited, and whether the stepper was used (a user with no goal starts on 3).
  const [goalDays, setGoalDays] = useState(DEFAULT_GOAL_DAYS)
  const [goalTouched, setGoalTouched] = useState(false)
  const [toast, setToast] = useState<ToastContent | null>(null)

  const loadedGoal = goal.status === 'ready' ? goal.goal : null
  const goalNote = pendingGoalNote(loadedGoal)
  const fullName = getDisplayName(profile, 'Your profile')

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
    if (!saved.ok) return saved

    if (!goalChanged()) {
      setToast({ severity: 'success', message: 'Changes saved' })
      return saved
    }

    const goalResult = await goal.save(goalDays)
    if (!goalResult.ok) {
      return { ok: false, message: `Your details were saved, but your goal could not be changed. ${goalResult.message}` }
    }
    setToast({ severity: 'success', message: `Changes saved. ${goalResult.message}` })
    return { ok: true }
  }

  return (
    <ScreenLayout hasTabBar bottomSpace={isEditing ? ACTION_BAR_HEIGHT : 0}>
      <Stack spacing={6}>
        <Stack sx={{ alignItems: 'center', textAlign: 'center' }} spacing={3}>
          <ProfileAvatar initials={getInitials(profile)} />
          <Typography variant="h1" component="h1" sx={{ m: 0 }}>
            {fullName}
          </Typography>
        </Stack>

        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
            <Box component="h2" sx={{ m: 0, fontFamily: home.font.heading, fontWeight: 700, fontSize: 18 }}>
              Your details
            </Box>
            {!isEditing && (
              <IconButton
                aria-label="Edit details"
                onClick={startEditing}
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '14px',
                  border: `1.5px solid ${c.line}`,
                  bgcolor: c.surface,
                  color: c.accentText,
                  '&:hover': { bgcolor: c.surface2 },
                }}
              >
                <Box
                  component="svg"
                  aria-hidden
                  focusable="false"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  sx={{ width: 22, height: 22 }}
                >
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                  <path d="M13.5 6.5l4 4" />
                </Box>
              </IconButton>
            )}
          </Box>

          {isEditing ? (
            <Box sx={{ mt: 3 }}>
              <ProfileEditForm
                initialValues={profileToFormValues(profile)}
                onSave={saveProfileAndGoal}
                onSaved={() => setIsEditing(false)}
                onCancel={() => setIsEditing(false)}
              >
                <Box>
                  <EditLabel>Your gym</EditLabel>
                  <ButtonBase
                    aria-label="Change gym"
                    onClick={onChangeGym}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      width: '100%',
                      minHeight: 64,
                      p: '10px 14px',
                      borderRadius: '14px',
                      textAlign: 'left',
                      bgcolor: c.surface,
                      color: c.text,
                      '&:hover': { bgcolor: c.surface2 },
                    }}
                  >
                    <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                      <Box component="span" sx={{ display: 'block', fontWeight: 600, fontSize: 16 }}>
                        {gym?.name ?? 'No gym saved'}
                      </Box>
                      <Box component="span" sx={{ display: 'block', fontSize: 13, color: c.muted }}>
                        Tap to choose a different gym
                      </Box>
                    </Box>
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: c.accentText, fontSize: 14, fontWeight: 500 }}>
                      Change
                      <ChevronRightRounded aria-hidden fontSize="small" />
                    </Box>
                  </ButtonBase>
                </Box>

                <Box>
                  <EditLabel>Weekly goal</EditLabel>
                  {goal.status === 'loading' && (
                    <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 3, color: c.muted, fontSize: 14 }}>
                      <Loader />
                      Loading your goal…
                    </Box>
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
                    <Stack spacing={2}>
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
                    </Stack>
                  )}
                </Box>
              </ProfileEditForm>
            </Box>
          ) : (
            <Box>
              <DetailRow label="First name" value={profile.firstName ?? ''} />
              <DetailRow label="Last name" value={profile.lastName ?? ''} />
              <DetailRow label="Date of birth" value={formatBirthDate(profile.dateOfBirth) ?? 'Not set'} />
              <DetailRow
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
                <Typography variant="body2" color="textSecondary" sx={{ mt: 3 }}>
                  {goalNote}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        <TextField
          label="Google account email"
          value={email ?? 'Not available'}
          disabled
          fullWidth
          helperText="You sign in with this Google account. It can't be changed here."
        />

        {!isEditing && (
          <>
            <Divider />

            {gym && <GymSummary label={`Your gym · ${gym.label}`} name={gym.name} address={gym.formattedAddress} />}
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<EditLocationAltOutlined />}
              onClick={onChangeGym}
              sx={{ alignSelf: 'flex-start' }}
            >
              Change gym
            </Button>
          </>
        )}

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

      <Toast toast={toast} onClose={() => setToast(null)} aboveTabBar />
    </ScreenLayout>
  )
}
