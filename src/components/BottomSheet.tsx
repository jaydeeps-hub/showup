import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useId, type ReactNode } from 'react'
import { tokens } from '../design-system/tokens'

interface BottomSheetProps {
  open: boolean
  /** Called when the person dismisses the sheet without choosing (Escape, or a tap on the dark area behind it). */
  onClose: () => void
  /** The sheet's title, set in the heading font. */
  title: string
  /** The sentence under the title. */
  children: ReactNode
  /** The buttons, stacked at the bottom of the sheet. */
  actions: ReactNode
}

/**
 * A sheet at the bottom of the screen over a dark scrim (the design's `.sheet` and `.sp`): the full
 * width of the screen, rounded at the top, with a title, a sentence and stacked buttons. It is a real dialog, so
 * it traps focus while open, puts focus back where it was when it closes, and closes on Escape or a tap on the
 * scrim. The page behind it cannot be used while it is open.
 */
export function BottomSheet({ open, onClose, title, children, actions }: BottomSheetProps) {
  // The dialog is named by its own visible title, so what a screen reader announces is what is on screen.
  const titleId = useId()
  // MUI does not look at this setting by itself, so the sheet checks it and skips its fade when asked to.
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      // Anchored to the bottom edge and as wide as the screen allows, instead of floating in the middle.
      slotProps={{
        paper: {
          sx: {
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            m: 0,
            width: '100%',
            maxWidth: 'none',
            borderRadius: `${tokens.radius.sheet}px ${tokens.radius.sheet}px 0 0`,
            border: 0,
            borderTop: `1px solid ${tokens.color.border}`,
            backgroundColor: tokens.color.surface1,
            // Room for the home indicator on phones that have one.
            p: '24px 24px calc(32px + env(safe-area-inset-bottom, 0px))',
          },
        },
      }}
      // A short fade (the design shows and hides the sheet with no motion at all); none for people who ask for less.
      transitionDuration={reduceMotion ? 0 : { enter: 150, exit: 100 }}
    >
      <Box component="h2" id={titleId} sx={{ m: 0, font: `700 20px ${tokens.font.display}`, color: tokens.color.textPrimary }}>
        {title}
      </Box>
      <Box component="p" sx={{ color: tokens.color.textBody, m: '6px 0 18px', fontSize: 14 }}>
        {children}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{actions}</Box>
    </Dialog>
  )
}
