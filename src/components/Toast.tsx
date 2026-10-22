import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import { tokens } from '../design-system/tokens'
import { ABOVE_TAB_BAR } from './BottomNav'

export interface ToastContent {
  severity: 'success' | 'error'
  message: string
}

interface ToastProps {
  toast: ToastContent | null
  onClose: () => void
  /** True on the screens with the bottom tab bar, so the message sits above it. */
  aboveTabBar?: boolean
}

/** How long a toast stays on screen. Hovering over it, or leaving the browser window, pauses the timer. */
export const TOAST_DURATION_MS = 2600

/**
 * The one toast used everywhere in the app: a short message that goes away by itself. Success is
 * green with dark text and errors are red with dark text (the colours come from the theme). It has
 * an icon as well as the colour, so the meaning is never carried by colour alone.
 */
export function Toast({ toast, onClose, aboveTabBar = false }: ToastProps) {
  return (
    <Snackbar
      open={toast !== null}
      autoHideDuration={TOAST_DURATION_MS}
      sx={aboveTabBar ? { bottom: { xs: ABOVE_TAB_BAR, sm: ABOVE_TAB_BAR } } : undefined}
      onClose={(_event, reason) => {
        // Pressing elsewhere on the page should not dismiss it.
        if (reason !== 'clickaway') onClose()
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={toast?.severity ?? 'success'}
        sx={{
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontWeight: 600,
          borderRadius: `${tokens.radius.small}px`,
        }}
      >
        {toast?.message}
      </Alert>
    </Snackbar>
  )
}
