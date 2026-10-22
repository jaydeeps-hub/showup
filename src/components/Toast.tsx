import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

export interface ToastContent {
  severity: 'success' | 'error'
  message: string
}

interface ToastProps {
  toast: ToastContent | null
  onClose: () => void
}

const SUCCESS_AUTO_HIDE_MS = 4000
/** Errors stay a little longer so they can be read. */
const ERROR_AUTO_HIDE_MS = 7000

/** A small message at the bottom of the screen that goes away by itself. Used for success and for errors. */
export function Toast({ toast, onClose }: ToastProps) {
  return (
    <Snackbar
      open={toast !== null}
      autoHideDuration={toast?.severity === 'error' ? ERROR_AUTO_HIDE_MS : SUCCESS_AUTO_HIDE_MS}
      onClose={(_event, reason) => {
        // Pressing elsewhere on the page should not dismiss it.
        if (reason !== 'clickaway') onClose()
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={toast?.severity ?? 'success'} onClose={onClose} sx={{ width: '100%', alignItems: 'center' }}>
        {toast?.message}
      </Alert>
    </Snackbar>
  )
}
