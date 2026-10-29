import Box from '@mui/material/Box'
import { tokens } from '../design-system/tokens'

/**
 * The dots under a carousel: one per card, the active one wider. They only repeat what the cards already
 * say, so screen readers skip them. The width change is not animated for people who ask for reduced motion.
 */
export function CarouselDots({ count, active }: { count: number; active: number }) {
  return (
    <Box aria-hidden sx={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, index) => (
        <Box
          key={index}
          component="i"
          data-active={index === active ? 'true' : 'false'}
          sx={{
            display: 'block',
            height: 8,
            width: index === active ? 24 : 8,
            borderRadius: '4px',
            backgroundColor: index === active ? tokens.color.accentPrimary : tokens.color.surface2,
            transition: 'width 0.2s, background-color 0.2s',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      ))}
    </Box>
  )
}
