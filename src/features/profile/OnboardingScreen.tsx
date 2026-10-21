import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ScreenLayout } from '../../components/ScreenLayout'
import type { Profile, ProfileEdits, SaveResult } from '../../types'
import { profileToFormValues } from '../../utils/profileValidation'
import { ProfileForm } from './ProfileForm'

interface OnboardingScreenProps {
  profile: Profile
  onSave: (edits: ProfileEdits) => Promise<SaveResult>
}

/**
 * Shown once, right after the first Google sign-in, while the profile has no first or last
 * name. When the save succeeds the profile is complete, and the app moves on by itself.
 * Names Google already provided are filled in, so most people only check and continue.
 */
export function OnboardingScreen({ profile, onSave }: OnboardingScreenProps) {
  return (
    <ScreenLayout>
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography variant="h1" component="h1">
            Let's get to know you.
          </Typography>
          <Typography variant="body1" color="textSecondary">
            What should we call you, and when should we wish you on your birthday?
          </Typography>
        </Stack>

        <ProfileForm
          initialValues={profileToFormValues(profile)}
          submitLabel="Continue"
          onSave={onSave}
          birthdayHelp="Optional. We use it only to wish you a happy birthday."
        />
      </Stack>
    </ScreenLayout>
  )
}
