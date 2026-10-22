/**
 * Showup design tokens: the single source of truth for colour, type, spacing, shape and motion.
 * The Material UI theme (src/app/theme.ts) is built from these. Change the look here, not in
 * components.
 *
 * Direction: deep navy-black surfaces, one deep-blue accent for interaction and selection, green for
 * success, red for errors, subtle borders instead of shadows. The values match the design prototype
 * (docs/design/showup-prototype.html). homeTokens.ts and landingTheme.ts read from here, so a colour
 * is only ever defined once.
 */
export const tokens = {
  color: {
    background: '#050A14',
    surface1: '#0E1522', // cards, inputs, navigation, secondary containers
    surface2: '#172033', // elevated surfaces, secondary buttons, hover, disabled backgrounds
    border: '#232D42',

    textPrimary: '#F2F3F5',
    textSecondary: '#8D93A0',
    textBody: '#B4B9C4', // paragraph text under a heading
    textSubtle: '#626875', // placeholders and low-emphasis text
    textDisabled: '#6A707C',

    accentPrimary: '#2B50D9', // primary buttons, active controls, selection, progress
    accentHover: '#3258E6',
    accentTint: '#17234F', // selected rows, subtle accent backgrounds
    accentText: '#8FA6FF', // active navigation, links, highlighted labels
    onAccent: '#FFFFFF', // text on accentPrimary
    focusRing: '#7C97FF',

    success: '#3DBE8B',
    successSurface: '#143A2D',
    onSuccess: '#06231A', // dark text on a success background

    error: '#F0707A',
    onError: '#2A0A0D', // dark text on an error background

    warningSurface: '#241B10',
    warningBorder: '#4A3516',
    warningText: '#E8C48A',

    toggleTrackOff: '#3A3F4B',
    /** Dim backdrop behind dialogs. */
    overlay: 'rgba(0, 0, 0, 0.6)',
  },

  font: {
    /** Headings and large numbers (Lexend 700). */
    display: '"Lexend", "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    /** Everything else. */
    body: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  },

  /** 4px grid. */
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },

  radius: {
    control: 14, // inputs, buttons, standard cards and rows
    small: 12, // small controls
    card: 18, // large cards
    sheet: 24, // dialogs and the top corners of bottom sheets
    pill: 999,
  },

  size: {
    control: 54, // primary button and input height
    secondaryButton: 48,
    touchTarget: 44, // minimum for icon buttons and compact controls
  },

  border: { width: 1, widthEmphasis: 1.5 },

  motion: { fast: 120, standard: 180 },
  easing: { standard: 'cubic-bezier(0.2, 0, 0, 1)' },
} as const
