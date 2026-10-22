import { tokens } from '../../design-system/tokens'

/**
 * Colours and sizes for the landing page only. The colours and fonts come from
 * src/design-system/tokens.ts, so the landing page matches the rest of the app; only the sizes and
 * shapes that belong to this page alone are defined here.
 */
export const landing = {
  color: {
    page: tokens.color.background,
    container: tokens.color.background,
    containerBorder: tokens.color.border,
    primary: tokens.color.accentPrimary,
    primaryHover: tokens.color.accentHover,
    onPrimary: tokens.color.onAccent,
    heading: tokens.color.textPrimary,
    supporting: tokens.color.textBody,
    bannerBackground: tokens.color.accentTint,
    skeleton: tokens.color.surface2,
    focusRing: tokens.color.focusRing,
  },
  radius: { container: 44, banner: 36, button: tokens.radius.control },
  font: {
    display: tokens.font.display,
    body: tokens.font.body,
  },
} as const
