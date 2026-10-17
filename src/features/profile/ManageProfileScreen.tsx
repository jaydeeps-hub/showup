import LogoutRounded from '@mui/icons-material/LogoutRounded'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ScreenLayout } from '../../components/ScreenLayout'
import type { PlaceSearchMode, Profile, ProfileEdits, SaveResult } from '../../types'
import { profileToFormValues } from '../../utils/profileValidation'
import { PlaceSearchModeSetting } from './PlaceSearchModeSetting'
import { ProfileForm } from './ProfileForm'

interface ManageProfileScreenProps {
  profile: Profile
  /** The Google account's email, when Google provided one. Shown read-only. */
  email: string | null
  onSave: (edits: ProfileEdits) => Promise<SaveResult>
  /** Changes the gym search mode. Only used (and only shown) for administrators. */
  onChangeSearchMode: (mode: PlaceSearchMode) => Promise<SaveResult>
  /** Leave the page and go back to the home screen. */
  onClose: () => void
  onSignOut: () => void
}

/**
 * Lets a signed-in user view and edit their name and birthday, see which Google account
 * they use, and sign out. Administrators also see the gym search mode setting; regular users
 * never do, and cannot change it even by calling the database directly.
 */
export function ManageProfileScreen(props: ManageProfileScreenProps) {
  const { profile, email, onSave, onChangeSearchMode, onClose, onSignOut } = props
  return (
    <ScreenLayout>
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography variant="h1" component="h1">
            Your profile
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Update how we address you.
          </Typography>
        </Stack>

        <ProfileForm
          initialValues={profileToFormValues(profile)}
          submitLabel="Save changes"
          onSave={onSave}
          onCancel={onClose}
          birthdayHelp="Optional. We use it only to wish you a happy birthday."
        >
          <TextField
            label="Google account email"
            value={email ?? 'Not available'}
            disabled
            fullWidth
            helperText="You sign in with this Google account. It can't be changed here."
          />
        </ProfileForm>

        {/* Shown only to administrators. The database refuses anyone else, so this is a convenience, not the security. */}
        {profile.isAdmin && (
          <>
            <Divider />
            <PlaceSearchModeSetting mode={profile.placeSearchMode} onChange={onChangeSearchMode} />
          </>
        )}

        <Divider />

        <Button color="inherit" startIcon={<LogoutRounded />} onClick={onSignOut}>
          Sign out
        </Button>
      </Stack>
    </ScreenLayout>
  )
}
