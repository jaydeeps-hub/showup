import { createTheme } from '@mui/material/styles'

/** The single accent colour, used only for primary actions. */
const ACCENT = '#5fd38d'

/**
 * Dark Material UI theme for Showup.
 * Animations are switched off on purpose: the design brief asks for none.
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: ACCENT, contrastText: '#0b1a11' },
    background: { default: '#0f1113', paper: '#181b1f' },
    text: { primary: '#f2f4f5', secondary: '#a9b0b6' },
    divider: '#2a2f35',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  transitions: {
    // Every MUI transition (dialogs, snackbars, hovers) becomes instant.
    create: () => 'none',
  },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiDialog: { defaultProps: { transitionDuration: 0 } },
    MuiSnackbar: { defaultProps: { transitionDuration: 0 } },
  },
})
