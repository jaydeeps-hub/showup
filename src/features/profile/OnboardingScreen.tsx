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
}

/**
 * Step 1 of 3 of onboarding, "What should we call you?". When the save succeeds the app moves on to the gym step.
 * Names Google already provided are filled in, so most people only check and continue.
 *
 * There is no tab bar on onboarding screens. The top row has the progress bar and "1 of 3", and no back arrow.
 */
export function OnboardingScreen({ profile, onSave }: OnboardingScreenProps) {
  return (
    <Container
      component="main"
      maxWidth="sm"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', px: 6, pt: '56px', pb: '28px' }}
    >
      {/* The first step has nothing before it, so there is no back arrow. */}
      <OnboardingStepHeader step={1} />

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
