import { createTheme } from '@mui/material/styles'
import type { CSSProperties } from 'react'
import { tokens } from '../design-system/tokens'

// A "display" text style for large numbers (the Showup counter).
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

const { color: c, radius, size, font, motion, easing, border } = tokens

/** Visible keyboard focus: 2px outline with a 2px offset. */
const FOCUS_RING = { outline: `2px solid ${c.focusRing}`, outlineOffset: 2 }

/** The subtle halo shown around a focused field. */
const FIELD_HALO = `0 0 0 3px ${c.accentPrimary}40`

/** Display-font style shared by the heading variants. */
const display = { fontFamily: font.display, fontWeight: 700, letterSpacing: '-0.01em' }

/**
 * Showup's dark Material UI theme, built entirely from design tokens
 * (src/design-system/tokens.ts). Change the look there, not in components.
 */
const baseTheme = createTheme({
  // 1 spacing unit = 4px, so `p: 4` is 16px on the 4px grid.
  spacing: 4,
  shape: { borderRadius: radius.control },
  palette: {
    mode: 'dark',
    primary: { main: c.accentPrimary, light: c.accentText, dark: c.accentHover, contrastText: c.onAccent },
    success: { main: c.success, dark: c.success, contrastText: c.onSuccess },
    warning: { main: c.warningSurface, dark: c.warningSurface, contrastText: c.warningText },
    error: { main: c.error, dark: c.error, contrastText: c.onError },
    info: { main: c.accentText, contrastText: c.onAccent },
    background: { default: c.background, paper: c.surface1 },
    text: { primary: c.textPrimary, secondary: c.textSecondary, disabled: c.textDisabled },
    divider: c.border,
    action: {
      hover: c.surface2,
      selected: c.accentTint,
      focus: c.surface2,
      disabled: c.textDisabled,
      disabledBackground: c.surface2,
    },
  },
  typography: {
    fontFamily: font.body,
    // rem units so text still scales with the user's browser font-size setting.
    display: { ...display, fontSize: '2.5rem', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
    h1: { ...display, fontSize: '1.875rem', lineHeight: 1.2 }, // page title, 30px
    h2: { ...display, fontSize: '1.5rem', lineHeight: 1.25 },
    h3: { ...display, fontSize: '1.25rem', lineHeight: 1.3 }, // section heading, 20px
    h4: { ...display, fontSize: '1.125rem', lineHeight: 1.3 }, // 18px
    h5: { ...display, fontSize: '1.125rem', lineHeight: 1.3 },
    h6: { ...display, fontSize: '1.125rem', lineHeight: 1.3 },
    subtitle1: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 600 },
    subtitle2: { fontSize: '0.875rem', lineHeight: 1.4, fontWeight: 500 }, // labels, 14px
    body1: { fontSize: '1rem', lineHeight: 1.55, fontWeight: 400 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5, fontWeight: 400 }, // secondary text
    button: { fontSize: '1rem', lineHeight: 1.25, fontWeight: 600, textTransform: 'none' },
    caption: { fontSize: '0.75rem', lineHeight: 1.4, fontWeight: 400 },
    overline: { fontSize: '0.75rem', lineHeight: 1.4, fontWeight: 500, textTransform: 'none', letterSpacing: 0 },
  },
  transitions: {
    // Subtle and brief.
    duration: {
      shortest: motion.fast,
      shorter: motion.fast,
      short: motion.standard,
      standard: motion.standard,
      complex: motion.standard,
      enteringScreen: motion.standard,
      leavingScreen: motion.fast,
    },
    easing: { easeInOut: easing.standard, easeOut: easing.standard, easeIn: easing.standard, sharp: easing.standard },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: c.background, color: c.textPrimary },
        // Respect "reduce motion": state changes still happen, just instantly.
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            transitionDuration: '0.01ms !important',
            transitionDelay: '0ms !important',
            animationDuration: '0.01ms !important',
          },
        },
      },
    },
    MuiButtonBase: {
      // Press feedback comes from colour changes, not a ripple.
      defaultProps: { disableRipple: true },
      styleOverrides: { root: { '&.Mui-focusVisible': FOCUS_RING } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: radius.control,
          minHeight: size.secondaryButton,
          paddingInline: 20,
          '&.Mui-disabled': { color: c.textDisabled },
        },
        sizeSmall: { minHeight: size.touchTarget, paddingInline: 12, borderRadius: radius.small },
        sizeLarge: { minHeight: size.control, fontSize: '1rem', lineHeight: 1.25 },
        // Primary: solid blue, white text, 54px tall.
        contained: {
          minHeight: size.control,
          '&.Mui-disabled, &.MuiButton-colorPrimary.Mui-disabled, &.MuiButton-colorError.Mui-disabled': {
            backgroundColor: c.surface2,
            color: c.textDisabled,
          },
        },
        colorPrimary: {
          '&.MuiButton-contained': { backgroundColor: c.accentPrimary, color: c.onAccent },
          '&.MuiButton-contained:hover': { backgroundColor: c.accentHover },
        },
        colorError: {
          '&.MuiButton-contained': { backgroundColor: c.error, color: c.onError },
          '&.MuiButton-contained:hover': { backgroundColor: c.error, filter: 'brightness(1.08)' },
        },
        // Neutral / secondary outlined button: quiet surface, subtle border.
        outlined: {
          backgroundColor: c.surface2,
          borderColor: c.border,
          color: c.textPrimary,
          '&:hover': { backgroundColor: c.surface2, borderColor: c.textSubtle },
          '&.Mui-disabled': { borderColor: c.border },
        },
        // Ghost: transparent, no border.
        text: {
          color: c.textPrimary,
          '&:hover': { backgroundColor: c.surface1 },
          '&:active': { backgroundColor: c.surface2 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: size.touchTarget,
          minHeight: size.touchTarget,
          borderRadius: radius.small,
          backgroundColor: c.surface1,
          '&:hover': { backgroundColor: c.surface2 },
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
        root: {
          borderRadius: radius.control,
          backgroundColor: c.surface1,
          border: `${border.width}px solid ${c.border}`,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: size.control,
          borderRadius: radius.control,
          backgroundColor: c.surface1,
          fontSize: '1rem',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: c.border, borderWidth: border.width },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.textSubtle },
          // Focused: blue border and a subtle blue halo.
          '&.Mui-focused': { boxShadow: FIELD_HALO },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.accentPrimary, borderWidth: border.widthEmphasis },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: c.error },
          '&.Mui-error.Mui-focused': { boxShadow: `0 0 0 3px ${c.error}40` },
          '&.Mui-disabled': { backgroundColor: c.surface2 },
        },
        input: {
          paddingInline: 16,
          '&::placeholder': { color: c.textSubtle, opacity: 1 },
          '&.Mui-disabled': { WebkitTextFillColor: c.textDisabled },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: c.textSecondary,
          fontSize: '0.875rem',
          fontWeight: 500,
          '&.Mui-focused': { color: c.accentText },
          '&.Mui-error': { color: c.error },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { marginInline: 4, color: c.textSecondary, fontSize: '0.8125rem', '&.Mui-error': { color: c.error } } },
    },
    MuiFormLabel: { styleOverrides: { root: { '&.Mui-focused': { color: c.accentText } } } },
    MuiRadio: {
      styleOverrides: {
        root: { color: c.textSubtle, padding: 10, '&.Mui-checked': { color: c.accentPrimary } },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { width: 52, height: 32, padding: 0, overflow: 'visible' },
        switchBase: {
          padding: 3,
          '&.Mui-checked': { transform: 'translateX(20px)', color: c.onAccent },
          '&.Mui-checked + .MuiSwitch-track': { backgroundColor: c.accentPrimary, opacity: 1 },
        },
        thumb: { width: 26, height: 26, backgroundColor: c.onAccent, boxShadow: 'none' },
        track: { borderRadius: radius.pill, backgroundColor: c.toggleTrackOff, opacity: 1 },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surface1,
          border: `${border.width}px solid ${c.border}`,
          borderRadius: radius.control,
          boxShadow: 'none',
          marginTop: 8,
        },
        listbox: { padding: 8 },
        option: {
          borderRadius: radius.small,
          minHeight: size.secondaryButton,
          marginBottom: 8,
          '&:last-of-type': { marginBottom: 0 },
          '&.Mui-focused': { backgroundColor: c.surface2 },
          // Selected: tinted background plus a visible blue border.
          '&[aria-selected="true"]': { backgroundColor: c.accentTint, boxShadow: `inset 0 0 0 ${border.widthEmphasis}px ${c.accentPrimary}` },
        },
        loading: { color: c.textSecondary },
        noOptions: { color: c.textSecondary },
      },
    },
    MuiAlert: {
      // `filled` makes MUI paint the message from the palette (success.main etc.); the text colour
      // on each comes from getContrastText below. Used by every message in the app.
      defaultProps: { variant: 'filled' },
      styleOverrides: {
        // `root` is emitted last, so these win over Paper's own box-shadow and Alert's defaults.
        root: ({ ownerState }) => ({
          borderRadius: radius.control,
          alignItems: 'flex-start',
          fontSize: '0.875rem',
          fontWeight: 500,
          // Quiet inset ring instead of a border (MUI resets borders on filled messages).
          ...(ownerState.severity === 'warning' && { boxShadow: `inset 0 0 0 ${border.width}px ${c.warningBorder}` }),
          ...(ownerState.severity === 'info' && {
            backgroundColor: c.surface1,
            color: c.textPrimary,
            boxShadow: `inset 0 0 0 ${border.width}px ${c.border}`,
            '& .MuiAlert-icon': { color: c.accentText },
          }),
          ...((ownerState.severity === 'success' || ownerState.severity === 'error') && {
            boxShadow: 'none',
            '& .MuiAlert-icon': { color: 'inherit' },
          }),
        }),
        // The close button inherits the message colour and sits flat on it.
        action: { padding: 0, '& .MuiIconButton-root': { backgroundColor: 'transparent', color: 'inherit', '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.12)' } } },
      },
    },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: c.overlay } } },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surface1,
          border: `${border.width}px solid ${c.border}`,
          borderRadius: radius.sheet,
          boxShadow: 'none',
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { ...display, fontSize: '1.25rem', lineHeight: 1.3, padding: '24px 24px 8px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px', fontSize: '0.9375rem' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px', gap: 8 } } },
    MuiDivider: { styleOverrides: { root: { borderColor: c.border } } },
  },
})

/**
 * MUI decides the text colour on a coloured background by calling `palette.getContrastText()`,
 * which only ever returns near-black or white. The design wants specific colours instead (dark
 * green-black on success, dark red-black on error, light amber on the dark amber warning).
 * Overriding the function means every MUI component that asks "what text goes on this
 * background?" gets the design's answer, without per-component CSS tricks.
 */
const TEXT_ON: Record<string, string> = {
  [c.success.toLowerCase()]: c.onSuccess,
  [c.error.toLowerCase()]: c.onError,
  [c.warningSurface.toLowerCase()]: c.warningText,
  [c.accentPrimary.toLowerCase()]: c.onAccent,
  [c.accentHover.toLowerCase()]: c.onAccent,
}

export const theme = createTheme(baseTheme, {
  palette: {
    getContrastText: (background: string) =>
      TEXT_ON[background.toLowerCase()] ?? baseTheme.palette.getContrastText(background),
  },
})
