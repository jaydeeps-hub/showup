import Box from '@mui/material/Box'
import { useState, type ReactNode } from 'react'
import { useMascotContent } from '../hooks/useMascot'
import { logoFrom } from '../utils/mascot'

interface BrandMarkImageProps {
  /** The width and height of the mark, in pixels. It is always this size, so nothing around it moves. */
  size: number
  /** What to draw when there is no logo, or it cannot be loaded: the shape that was there before the logo existed. */
  fallback: ReactNode
}

/**
 * The little mark beside the "Showup" name: the brand logo (`logo_white` in the `mascot_images` table), picked up from
 * the same content the mascot uses, so it is saved for the next visit and refreshed in the background.
 *
 * It is drawn at a fixed `size` square, so the name beside it never shifts. If the table has no logo, or its address
 * fails to load, `fallback` is drawn in the same space, so the screen looks exactly as it did before there was a logo
 * and never shows a hole or a broken-image icon.
 *
 * The picture is decorative: the name next to it already says "Showup", so it has no alt text and screen readers
 * skip it (otherwise the name would be read twice).
 */
export function BrandMarkImage({ size, fallback }: BrandMarkImageProps) {
  const logo = logoFrom(useMascotContent())
  // The address that failed to load. A different (replaced) logo is tried again.
  const [failed, setFailed] = useState<string | null>(null)

  if (!logo || failed === logo.url) return <>{fallback}</>

  return (
    <Box
      component="img"
      src={logo.url}
      alt=""
      aria-hidden
      width={size}
      height={size}
      onError={() => setFailed(logo.url)}
      sx={{ width: size, height: size, flexShrink: 0, display: 'block', objectFit: 'contain' }}
    />
  )
}
