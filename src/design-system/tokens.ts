/**
 * Showup design tokens (Visual Design Language v1.1.0).
 * Single source of truth for colour, spacing, radius and motion.
 * Components should use these via the MUI theme (src/app/theme.ts) rather than raw values.
 */
export const tokens = {
  color: {
    backgroundCanvas: '#101216',
    backgroundElevated: '#151920',
    surfaceDefault: '#1B2028',
    surfaceRaised: '#222936',
    surfaceHover: '#293242',
    surfacePressed: '#303B4D',
    borderSubtle: '#2A313D',
    borderStrong: '#465164',
    textPrimary: '#F4F7FB',
    textSecondary: '#B3BDCC',
    textTertiary: '#8793A5',
    textDisabled: '#687385',
    brandPrimary: '#4D8DFF',
    brandHover: '#6AA0FF',
    brandPressed: '#3477E8',
    brandSubtle: '#172B49',
    brandOnPrimary: '#071426',
    success: '#45C486',
    successSubtle: '#142F27',
    warning: '#F2B84B',
    warningSubtle: '#352A17',
    error: '#FF6B72',
    errorSubtle: '#3A2027',
    info: '#72B7FF',
    infoSubtle: '#172B3E',
  },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  radius: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  motion: { instant: 100, fast: 150, standard: 200, emphasis: 280, slow: 350 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    enter: 'cubic-bezier(0, 0, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
  shadow: {
    card: '0 2px 8px rgba(0, 0, 0, 0.16)',
    dialog: '0 12px 36px rgba(0, 0, 0, 0.36)',
    focus: '0 0 0 3px rgba(77, 141, 255, 0.28)',
  },
} as const
