import { tokens } from './tokens'

/**
 * Names for the Home screen, calendar, goal and pause screens, taken from the design prototype
 * (docs/design/showup-prototype.html). The shared values come from tokens.ts so there is one
 * definition of each colour; only the few values used by these screens alone are defined here.
 */
export const home = {
  color: {
    bg: tokens.color.background,
    surface: tokens.color.surface1,
    surface2: tokens.color.surface2,
    line: tokens.color.border,
    text: tokens.color.textPrimary,
    muted: tokens.color.textSecondary,
    accent: tokens.color.accentPrimary,
    accentSoft: tokens.color.accentTint,
    accentBorder: '#2A3C7A',
    accentText: tokens.color.accentText,
    onAccent: tokens.color.onAccent,
    ok: tokens.color.success,
    okSoft: tokens.color.successSurface,
    /** Day numbers. */
    day: tokens.color.textBody,
    /** Day numbers that are still in the future. */
    dayFuture: '#5C626E',
    /** The label under the big Total showups number. */
    kpiLabel: '#C3CCE8',
  },
  font: {
    heading: tokens.font.display,
    body: tokens.font.body,
  },
} as const
