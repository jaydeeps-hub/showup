import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CardPicture } from '../../components/CardPicture'
import { CarouselDots } from '../../components/CarouselDots'
import { tokens } from '../../design-system/tokens'
import type { CmsItem } from '../../types'
import { imageFor, quickStartFallbackExpression } from '../../utils/cms'
import { BrandLogo } from '../landing/BrandMark'

/** How far (in pixels) a swipe has to travel sideways to turn the page. A shorter drag is ignored. */
const SWIPE_THRESHOLD_PX = 45

interface QuickStartScreenProps {
  /** One slide per item. The slide count, the dots and the "last slide" button all follow from this list. */
  items: readonly CmsItem[]
  /** What the button says on the last slide ("Set up my profile" or "Done"). */
  lastLabel: string
  /** Called when the person presses the last button, or Skip. Called once. */
  onFinish: () => void
}

/**
 * The Quick Start: a full screen (no tab bar) with the brand and a Skip link on top, a swipeable row of slides,
 * dots and one primary button. Swiping (or the arrow keys, with the slides focused) moves a slide at a time;
 * the button says "Next" until the last slide, where it says `lastLabel`. Skip does what the last button does.
 *
 * Which items there are, and what happens when it ends, is decided by the caller; this screen only draws.
 */
export function QuickStartScreen({ items, lastLabel, onFinish }: QuickStartScreenProps) {
  const [index, setIndex] = useState(0)
  const startX = useRef<number | null>(null)
  const finished = useRef(false)

  const lastIndex = items.length - 1
  // If slides are removed while the screen is open, stay on a slide that exists.
  const shown = Math.min(index, Math.max(lastIndex, 0))
  const isLast = shown >= lastIndex

  function go(target: number) {
    setIndex(Math.max(0, Math.min(lastIndex, target)))
  }

  /** Ends the Quick Start. A second press while it is closing is ignored, so it is only ever reported once. */
  function finish() {
    if (finished.current) return
    finished.current = true
    onFinish()
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (startX.current === null) return
    const distance = event.clientX - startX.current
    startX.current = null
    if (distance < -SWIPE_THRESHOLD_PX) go(shown + 1)
    else if (distance > SWIPE_THRESHOLD_PX) go(shown - 1)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') go(shown + 1)
    else if (event.key === 'ArrowLeft') go(shown - 1)
  }

  return (
    <Container
      component="section"
      aria-label="Quick start"
      maxWidth="sm"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', px: 6, pt: '56px', pb: '28px' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '18px' }}>
        <BrandLogo />
        <Button
          variant="text"
          onClick={finish}
          sx={{ color: tokens.color.accentText, fontSize: 15, fontWeight: 500, minHeight: 44, minWidth: 0, px: '6px' }}
        >
          Skip
        </Button>
      </Box>

      <Box
        role="group"
        aria-roledescription="carousel"
        aria-label="Quick start steps"
        // Focusable so the arrow keys can turn the page for people who do not swipe.
        tabIndex={0}
        onPointerDown={(event) => {
          startX.current = event.clientX
        }}
        onPointerCancel={() => {
          startX.current = null
        }}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        sx={{
          flex: 1,
          overflow: 'hidden',
          // Vertical scrolling still belongs to the browser; only sideways drags are ours.
          touchAction: 'pan-y',
          userSelect: 'none',
          '&:focus-visible': { outline: `2px solid ${tokens.color.focusRing}`, outlineOffset: 2 },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            transform: `translateX(-${shown * 100}%)`,
            transition: 'transform 0.3s ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          {items.map((item, position) => (
            <Box
              key={item.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} of ${items.length}`}
              aria-hidden={position !== shown}
              sx={{ flex: '0 0 100%', minWidth: 0 }}
            >
              <CardPicture
                src={imageFor(item)}
                alt={item.image_alt}
                fallbackExpression={quickStartFallbackExpression(position)}
                radius={22}
                bordered
              />
              <Typography
                component="h2"
                sx={{
                  fontFamily: tokens.font.display,
                  fontWeight: 700,
                  fontSize: 28,
                  lineHeight: 1.12,
                  letterSpacing: '-0.01em',
                  color: tokens.color.textPrimary,
                  m: '24px 0 8px',
                }}
              >
                {item.heading}
              </Typography>
              {item.subheading !== '' && (
                <Typography component="p" sx={{ fontSize: 16, color: tokens.color.textBody, m: 0 }}>
                  {item.subheading}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ my: '14px' }}>
        <CarouselDots count={items.length} active={shown} />
      </Box>

      <Button variant="contained" fullWidth onClick={() => (isLast ? finish() : go(shown + 1))}>
        {isLast ? lastLabel : 'Next'}
      </Button>
    </Container>
  )
}
