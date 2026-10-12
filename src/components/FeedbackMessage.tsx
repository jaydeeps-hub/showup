import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Snackbar from '@mui/material/Snackbar'
import type { FeedbackContent } from '../config/messages'

interface FeedbackMessageProps {
  feedback: FeedbackContent | null
  onClose: () => void
}

const SUCCESS_AUTO_HIDE_MS = 4000

/**
 * Success is a small snackbar that disappears on its own. Problems use a
 * dialog so the user has to read and dismiss them.
 */
export function FeedbackMessage({ feedback, onClose }: FeedbackMessageProps) {
  if (feedback?.severity === 'success') {
    return (
      <Snackbar
        open
        autoHideDuration={SUCCESS_AUTO_HIDE_MS}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={onClose} sx={{ width: '100%' }}>
          {feedback.message}
        </Alert>
      </Snackbar>
    )
  }

  return (
    <Dialog open={feedback !== null} onClose={onClose} aria-labelledby="feedback-title" fullWidth maxWidth="xs">
      <DialogTitle id="feedback-title">{feedback?.title}</DialogTitle>
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
