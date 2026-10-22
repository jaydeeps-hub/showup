import Box from '@mui/material/Box'
import { landing } from './landingTheme'

/**
 * The ring and wedge drawn inside a 24 x 24 view box. Shared by the "o" in the wordmark and by the
 * Loader (src/components/Loader.tsx), so both always show the same graphic.
 */
export function BrandPieShapes({ color }: { color: string }) {
  return (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="5" />
      <path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" fill={color} />
    </>
  )
}

/**
 * The Showup "o": a blue ring with a solid blue wedge, used in the wordmark and the headline.
 * It is decorative (the word it sits in is still read as normal text), so it is hidden from
 * screen readers. Its size follows the surrounding font size.
 */
export function BrandO() {
  return (
    <Box
      component="svg"
      aria-hidden
      viewBox="0 0 24 24"
      sx={{ display: 'inline-block', width: '0.62em', height: '0.62em', verticalAlign: '-0.02em', mx: '0.02em' }}
    >
      <BrandPieShapes color={landing.color.primary} />
    </Box>
  )
}

/** The solid blue dot that sits before the wordmark. */
export function BrandDot() {
  return (
    <Box
      aria-hidden
      sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', backgroundColor: landing.color.primary }}
    />
  )
}
