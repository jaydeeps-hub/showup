import { tokens } from './tokens'
import { home } from './homeTokens'

/**
 * The Squad page's own colours, for the two stat chips on a squad-mate's row (the design's `.sx .sp` and `.sp.w`).
 * Everything else on the page uses the shared tokens.
 */
export const squad = {
  /** "<n> showups": the soft accent chip. */
  showupsChip: {
    background: tokens.color.accentTint,
    border: home.color.accentBorder,
    text: '#B8C4EE',
    number: tokens.color.onAccent,
  },
  /** "<n> weeks in a row": the grey chip. */
  weeksChip: {
    background: tokens.color.surface2,
    border: '#2E3A55',
    text: '#A7AFBD',
    number: '#F4F4F6',
  },
} as const
