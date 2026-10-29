import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { tokens } from '../../design-system/tokens'
import type { CtaMode } from '../../utils/ctaMode'
import { landing } from './landingTheme'

/** The glass look. More solid where the browser cannot blur what is behind, or the person asked for less transparency. */
const GLASS = 'rgba(14, 21, 34, 0.82)'
const SOLID = 'rgba(14, 21, 34, 0.96)'

interface SignInBoxProps {
  /** How it is shown. Decided by useCtaMode from the room on screen. */
  mode: CtaMode
  /** Attached to the box so its real height can be measured. */
  boxRef: (element: HTMLElement | null) => void
  /** Everything inside, below the heading: messages, the two buttons and the Terms line. */
  children: ReactNode
}

/**
 * The sign-in box at the end of the landing page. In `full` and `compact` mode it floats at the bottom of the
 * screen over the content; in `static` mode it is an ordinary block at the end of the page.
 *
 * Which parts are drawn in which mode is done in CSS from `data-mode`, so the same box can be measured in
 * each mode (see useCtaMode) without changing what React renders. The children mark the parts that change
 * size with `data-cta="primary"` and `data-cta="secondary"`.
 *
 * It floats with `position: sticky`: the page has no scrolling container of its own, so it sticks to the
 * bottom of the screen until the page reaches its own end, where it rests in place. It never traps focus.
 */
export function SignInBox({ mode, boxRef, children }: SignInBoxProps) {
  return (
    <Box
      component="section"
      aria-label="Sign in"
      ref={boxRef}
      data-mode={mode}
      sx={{
        position: 'sticky',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        zIndex: 5,
        mt: '24px',
        p: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backgroundColor: GLASS,
        WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
        backdropFilter: 'blur(18px) saturate(1.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': { backgroundColor: SOLID },
        '@media (prefers-reduced-transparency: reduce)': { backgroundColor: SOLID },

        // Not floating: an ordinary block at the end of the page.
        '&[data-mode="static"]': { position: 'static' },
        // Compact: no heading, less padding, shorter buttons.
        '&[data-mode="compact"]': { p: '12px' },
        '&[data-mode="compact"] [data-cta="heading"]': { display: 'none' },
        '&[data-mode="compact"] [data-cta="primary"]': { minHeight: 48 },
        '&[data-mode="compact"] [data-cta="secondary"]': { minHeight: 44 },
      }}
    >
      <Typography
        component="h2"
        data-cta="heading"
        sx={{
          fontFamily: landing.font.display,
          fontWeight: 700,
          fontSize: 17,
          lineHeight: 1.3,
          textAlign: 'center',
          color: tokens.color.textPrimary,
          m: '0 0 2px',
        }}
      >
        Get started today.
      </Typography>
      {children}
    </Box>
  )
}
