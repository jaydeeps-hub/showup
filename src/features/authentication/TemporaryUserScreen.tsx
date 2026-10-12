import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type FormEvent } from 'react'
import { ScreenLayout } from '../../components/ScreenLayout'

interface TemporaryUserScreenProps {
  onContinue: (username: string) => void
}

/**
 * First-run screen. Creates a DEMO identity only: there is no real
 * authentication, and the password is discarded as soon as the form submits.
 */
export function TemporaryUserScreen({ onContinue }: TemporaryUserScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const usernameMissing = username.trim() === ''
  const passwordMissing = password === ''

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (usernameMissing || passwordMissing) return
    onContinue(username)
  }

  return (
    <ScreenLayout>
      <Stack component="form" onSubmit={handleSubmit} noValidate spacing={3}>
        <div>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
            Welcome
          </Typography>
          <Typography color="text.secondary">Create a temporary profile to start tracking your gym visits.</Typography>
        </div>

        <TextField
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={submitted && usernameMissing}
          helperText={submitted && usernameMissing ? 'Enter a username.' : ' '}
          autoComplete="username"
          autoFocus
          fullWidth
        />
        <TextField
          label="Temporary password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={submitted && passwordMissing}
          helperText={submitted && passwordMissing ? 'Enter a temporary password.' : ' '}
          autoComplete="new-password"
          fullWidth
        />

        <Alert severity="info" variant="outlined">
          Demo only: this is not a real account. Your password is not saved or checked, and your data stays in this
          browser.
        </Alert>

        <Button type="submit" variant="contained" size="large" fullWidth>
          Continue
        </Button>
      </Stack>
    </ScreenLayout>
  )
}
