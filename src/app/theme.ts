import { createTheme } from '@mui/material/styles'
import type { CSSProperties } from 'react'
import { tokens } from '../design-system/tokens'

// A "display" text style for rare, high-emphasis numbers (the Showup counter).
declare module '@mui/material/styles' {
  interface TypographyVariants {
    display: CSSProperties
  }
  interface TypographyVariantsOptions {
    display?: CSSProperties
  }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    display: true
  }
}

const { color: c, radius, motion, easing, shadow } = tokens

const FONT_FAMILY = 'Inter, Roboto, "Helvetica Neue", Arial, sans-serif'

/** Visible keyboard focus. Plain blue on the dark canvas is well above 3:1 contrast. */
const FOCUS_RING = { outline: `2px solid ${c.brandPrimary}`, outlineOffset: 2 }

/** Subtle surface + matching text/icon colour for each kind of status message. */
function statusAlert(main: string, subtle: string) {
  return {
    backgroundColor: subtle,
    border: `1px solid ${main}`,
    color: c.textPrimary,
    '& .MuiAlert-icon': { color: main },
  }
}

/**
 * Showup's dark Material UI theme, built entirely from design tokens
 * (src/design-system/tokens.ts). Change the look there, not in components.
 */
export const theme = createTheme({
  // 1 spacing unit = 4px, so `p: 4` is the design system's space.4 (16px).
  spacing: 4,
  shape: { borderRadius: radius.md },
  palette: {
    mode: 'dark',
    primary: { main: c.brandPrimary, light: c.brandHover, dark: c.brandPressed, contrastText: c.brandOnPrimary },
    success: { main: c.success, contrastText: c.brandOnPrimary },
    warning: { main: c.warning, contrastText: c.brandOnPrimary },
    error: { main: c.error, contrastText: c.brandOnPrimary },
    info: { main: c.info, contrastText: c.brandOnPrimary },
    background: { default: c.backgroundCanvas, paper: c.surfaceDefault },
    text: { primary: c.textPrimary, secondary: c.textSecondary, disabled: c.textDisabled },
    divider: c.borderSubtle,
    action: {
      hover: c.surfaceHover,
      selected: c.surfacePressed,
      focus: c.surfaceHover,
      disabled: c.textDisabled,
      disabledBackground: c.surfaceRaised,
    },
  },
  typography: {
    fontFamily: FONT_FAMILY,
    // rem units so text still scales with the user's browser font-size setting.
    display: { fontSize: '2.5rem', lineHeight: '3rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
    h1: { fontSize: '2rem', lineHeight: '2.5rem', fontWeight: 700 },
    h2: { fontSize: '1.5rem', lineHeight: '2rem', fontWeight: 700 },
    h3: { fontSize: '1.25rem', lineHeight: '1.75rem', fontWeight: 600 },
    h4: { fontSize: '1.125rem', lineHeight: '1.625rem', fontWeight: 600 },
    h5: { fontSize: '1.125rem', lineHeight: '1.625rem', fontWeight: 600 },
    h6: { fontSize: '1.125rem', lineHeight: '1.625rem', fontWeight: 600 },
    subtitle1: { fontSize: '1rem', lineHeight: '1.5rem', fontWeight: 600 },
    subtitle2: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 600 },
    body1: { fontSize: '1rem', lineHeight: '1.5rem', fontWeight: 400 },
    body2: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 400 },
    button: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 600, textTransform: 'none' },
    caption: { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 400 },
    overline: { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 500, textTransform: 'none', letterSpacing: 0 },
  },
  transitions: {
    // Short, purposeful transitions (100-280 ms). Longer ones are not used.
    duration: {
      shortest: motion.instant,
      shorter: motion.fast,
      short: motion.standard,
      standard: motion.standard,
      complex: motion.emphasis,
      enteringScreen: motion.standard,
      leavingScreen: motion.fast,
    },
    easing: { easeInOut: easing.standard, easeOut: easing.enter, easeIn: easing.exit, sharp: easing.exit },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: c.backgroundCanvas },
        // Respect "reduce motion": state changes still happen, just instantly.
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { transitionDuration: '0.01ms !important', transitionDelay: '0ms !important' },
        },
      },
    },
    MuiButtonBase: {
      // Press feedback comes from colour changes, not a ripple animation.
      defaultProps: { disableRipple: true },
      styleOverrides: { root: { '&.Mui-focusVisible': FOCUS_RING } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: radius.md, minHeight: 48, paddingInline: 20 },
        sizeSmall: { minHeight: 44, paddingInline: 12 },
        sizeLarge: { minHeight: 56, fontSize: '1rem', lineHeight: '1.5rem' },
        colorPrimary: {
          '&.MuiButton-contained:hover': { backgroundColor: c.brandHover },
          '&.MuiButton-contained:active': { backgroundColor: c.brandPressed },
        },
        colorError: {
          '&.MuiButton-contained:hover': { backgroundColor: c.error, filter: 'brightness(1.1)' },
        },
        contained: {
          '&.Mui-disabled': { backgroundColor: c.surfaceRaised, color: c.textDisabled },
        },
        text: {
          '&:hover': { backgroundColor: c.surfaceHover },
          '&:active': { backgroundColor: c.surfacePressed },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: { borderRadius: radius.lg, backgroundColor: c.surfaceDefault, border: `1px solid ${c.borderSubtle}` },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          backgroundColor: c.surfaceDefault,
          // Input boundaries need 3:1 contrast, so they use the tertiary text colour.
          '& .MuiOutlinedInput-notchedOutline': { borderColor: c.textTertiary },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.textSecondary },
          '&.Mui-focused': { boxShadow: shadow.focus },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.brandPrimary, borderWidth: 2 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: c.error },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: c.textSecondary, '&.Mui-focused': { color: c.brandHover }, '&.Mui-error': { color: c.error } },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { marginInline: 4, '&.Mui-error': { color: c.error } } },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surfaceRaised,
          border: `1px solid ${c.borderSubtle}`,
          borderRadius: radius.md,
          boxShadow: shadow.card,
          marginTop: 4,
        },
        listbox: { padding: 4 },
        option: {
          borderRadius: radius.sm,
          minHeight: 48,
          '&.Mui-focused': { backgroundColor: c.surfaceHover },
          '&[aria-selected="true"]': { backgroundColor: c.brandSubtle },
        },
        loading: { color: c.textSecondary },
        noOptions: { color: c.textSecondary },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: radius.md, alignItems: 'flex-start' },
        colorSuccess: statusAlert(c.success, c.successSubtle),
        colorWarning: statusAlert(c.warning, c.warningSubtle),
        colorError: statusAlert(c.error, c.errorSubtle),
        colorInfo: statusAlert(c.info, c.infoSubtle),
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surfaceRaised,
          border: `1px solid ${c.borderSubtle}`,
          borderRadius: radius.lg,
          boxShadow: shadow.dialog,
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { padding: '24px 24px 8px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px', gap: 8 } } },
  },
})
