import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import type { FeedbackContent } from '../config/messages'
import { Toast } from './Toast'

interface FeedbackMessageProps {
  feedback: FeedbackContent | null
  onClose: () => void
  /** True on the screens with the bottom tab bar, so the success message sits above it. */
  aboveTabBar?: boolean
}

/**
 * Success is the shared toast, which disappears on its own.
 * Problems use a dialog so the user has to read and dismiss them.
 * Each state pairs colour with an icon and a title, never colour alone.
 */
export function FeedbackMessage({ feedback, onClose, aboveTabBar = false }: FeedbackMessageProps) {
  if (feedback?.severity === 'success') {
    // The same toast as everywhere else in the app.
    return <Toast toast={{ severity: 'success', message: feedback.message }} onClose={onClose} aboveTabBar={aboveTabBar} />
  }

  const isWarning = feedback?.severity === 'warning'
  const StatusIcon = isWarning ? WarningAmberRounded : ErrorOutlineRounded

  return (
    <Dialog open={feedback !== null} onClose={onClose} aria-labelledby="feedback-title" fullWidth maxWidth="xs">
      <DialogTitle id="feedback-title" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <Box component="span" sx={{ display: 'flex', color: isWarning ? 'warning.main' : 'error.main' }}>
          <StatusIcon sx={{ fontSize: 32 }} aria-hidden />
        </Box>
        {feedback?.title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{feedback?.message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  )
}
