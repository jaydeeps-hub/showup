import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { tokens } from '../design-system/tokens'
import { BrandPieShapes } from '../features/landing/BrandMark'

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`

interface LoaderProps {
  /** Width and height in pixels. */
  size?: number
  /**
   * The colour of the ring and wedge. Defaults to the light accent blue; pass `currentColor` to take
   * the text colour of the surrounding element (for example inside a button).
   */
  color?: string
}

/**
 * The one loader used everywhere (connecting Google, searching gyms, checking location, saving, and
 * loading a page or its data): the ring-and-wedge "o" from the landing page, spinning.
 *
 * It is decorative and hidden from screen readers, so always show it next to text that says what is
 * happening (for example "Saving…"). It holds still when the user prefers reduced motion.
 */
export function Loader({ size = 20, color = tokens.color.accentText }: LoaderProps) {
  return (
    <Box
      component="svg"
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      sx={{
        display: 'inline-block',
        flexShrink: 0,
        width: size,
        height: size,
        animation: `${spin} 1.4s linear infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <BrandPieShapes color={color} />
    </Box>
  )
}
