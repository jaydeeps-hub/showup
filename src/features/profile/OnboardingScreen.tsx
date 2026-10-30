import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { OnboardingStepHeader } from '../../components/OnboardingStepHeader'
import { tokens } from '../../design-system/tokens'
import type { Profile, ProfileEdits, SaveResult } from '../../types'
import { profileToFormValues } from '../../utils/profileValidation'
import { ProfileForm } from './ProfileForm'

interface OnboardingScreenProps {
  profile: Profile
  onSave: (edits: ProfileEdits) => Promise<SaveResult>
  /** What the back arrow does. This is the first step, so there is no earlier step to go to. */
  onBack: () => void
}

/**
 * Step 1 of 3 of onboarding, "What should we call you?". Shown while the profile has no first or last name. When
 * the save succeeds the profile is complete, and the app moves on by itself (to the gym step, then Home).
 * Names Google already provided are filled in, so most people only check and continue.
 *
 * There is no tab bar on onboarding screens. The top row has the back arrow, the progress bar and "1 of 3".
 */
export function OnboardingScreen({ profile, onSave, onBack }: OnboardingScreenProps) {
  return (
    <Container
      component="main"
      maxWidth="sm"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', px: 6, pt: '56px', pb: '28px' }}
    >
      <OnboardingStepHeader step={1} onBack={onBack} />

      <Typography
        variant="h1"
        component="h1"
        sx={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.01em', m: '0 0 8px' }}
      >
        What should we call you?
      </Typography>
      <Box component="p" sx={{ m: 0, fontSize: 14, color: tokens.color.textSecondary }}>
        Just the basics. It takes a few seconds.
      </Box>

      <ProfileForm
        initialValues={profileToFormValues(profile)}
        submitLabel="Continue"
        onSave={onSave}
        birthdayHelp="You can add this later."
      />
    </Container>
  )
}
