import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { BrandMarkImage } from '../../components/BrandMarkImage'
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

/** The size of the mark before the wordmark, in pixels. */
export const BRAND_MARK_SIZE = 28

/** The solid blue dot. It is what the logo falls back to when there is no logo to show. */
export function BrandDot() {
  return (
    <Box
      aria-hidden
      sx={{ width: BRAND_MARK_SIZE, height: BRAND_MARK_SIZE, flexShrink: 0, borderRadius: '50%', backgroundColor: landing.color.primary }}
    />
  )
}

/** What sits before the wordmark: the brand logo from the database, or the blue dot if there is none. */
export function BrandMark() {
  return <BrandMarkImage size={BRAND_MARK_SIZE} fallback={<BrandDot />} />
}

/** The dot and the "Showup" wordmark (with the drawn "o"), as at the top of the landing page and the Quick Start. */
export function BrandLogo() {
  return (
    <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <BrandMark />
      <Typography
        component="p"
        sx={{
          fontFamily: landing.font.display,
          fontWeight: 700,
          fontSize: '2rem',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: landing.color.heading,
        }}
      >
        Sh
        <BrandO />
        wup
      </Typography>
    </Box>
  )
}
