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
import type { Gym, PlaceSearchMode, Profile, ProfileEdits, SaveResult } from '../../types'
import { formatBirthDate, profileToFormValues } from '../../utils/profileValidation'
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
      <Typography variant="caption" color="text.secondary" component="p">
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
          <Typography variant="body1" color="text.secondary">
            {isEditing ? 'Update how we address you.' : 'Your details and gym.'}
          </Typography>
        </Stack>

        {isEditing ? (
          <ProfileForm
            initialValues={profileToFormValues(profile)}
            submitLabel="Save changes"
            onSave={onSave}
            onSaved={() => setIsEditing(false)}
            onCancel={() => setIsEditing(false)}
            birthdayHelp="Optional. We use it only to wish you a happy birthday."
          />
        ) : (
          <Stack spacing={4}>
            <Detail label="First name" value={profile.firstName ?? ''} />
            <Detail label="Last name" value={profile.lastName ?? ''} />
            <Detail label="Date of birth" value={formatBirthDate(profile.dateOfBirth) ?? 'Not set'} />
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<EditOutlined />}
              onClick={() => setIsEditing(true)}
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
    </ScreenLayout>
  )
}
