import Box from '@mui/material/Box'
import { ShortText } from '../../components/ShortText'
import { home } from '../../design-system/homeTokens'

/**
 * The name of the person's gym on Home, as a plain line directly under the Show up button (the design's `.where`):
 * centred and semi-bold, with no card around it.
 *
 * A name longer than 25 characters (spaces count) is cut and ends with "...", so one long Google Maps name cannot take
 * over the screen. The full name is the tooltip and is what a screen reader gets (see ShortText).
 */
export function GymNameLine({ name }: { name: string }) {
  return (
    <Box
      component="p"
      title={name}
      sx={{ position: 'relative', m: 0, mt: 3, textAlign: 'center', fontWeight: 600, fontFamily: home.font.body, color: home.color.text, maxWidth: '100%', overflowWrap: 'anywhere' }}
    >
      <ShortText text={name} />
    </Box>
  )
}
