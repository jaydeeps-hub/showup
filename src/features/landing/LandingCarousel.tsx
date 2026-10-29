import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CardPicture } from '../../components/CardPicture'
import { CarouselDots } from '../../components/CarouselDots'
import { tokens } from '../../design-system/tokens'
import { useLandingCarouselItems } from '../../hooks/useCmsContent'
import { useLandingContent } from '../../hooks/useLandingContent'
import type { CmsItem } from '../../types'
import { fallbackExpression, imageFor as cardImageFor } from '../../utils/cms'
import { landing } from './landingTheme'

/** The page's side padding, which the track cancels out so the cards can scroll right to the screen edge. */
const PAGE_PADDING = { xs: 5, sm: 8 } as const

/**
 * "Why it works": the heading and a swipeable row of cards, one per active row of the `landing_carousel`
 * category. The number of cards is simply the number of rows. If the category is missing or empty it is
 * switched off, and nothing at all is drawn: no heading, no carousel, no dots.
 */
export function LandingCarousel() {
  const items = useLandingCarouselItems()
  const { content } = useLandingContent()

  if (items.length === 0) return null

  return (
    <Box component="section" aria-label={content.carouselHeading} sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Typography
        variant="h2"
        component="h2"
        sx={{ fontFamily: landing.font.display, fontWeight: 700, fontSize: 18, lineHeight: 1.3, color: landing.color.heading }}
      >
        {content.carouselHeading}
      </Typography>
      <CardTrack items={items} label={content.carouselHeading} />
    </Box>
  )
}

function CardTrack({ items, label }: { items: readonly CmsItem[]; label: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  /**
   * Which card is in front: the one whose left edge is nearest where the first card sits when the track is
   * scrolled to the start. Real screen positions are compared, so it does not depend on any parent layout.
   */
  const updateActive = useCallback(() => {
    const element = track.current
    if (!element) return
    const cards = Array.from(element.children) as HTMLElement[]
    if (cards.length === 0) return
    const rest = element.getBoundingClientRect().left + parsePadding(element)
    let nearest = 0
    let best = Number.POSITIVE_INFINITY
    cards.forEach((card, index) => {
      const distance = Math.abs(card.getBoundingClientRect().left - rest)
      if (distance < best) {
        best = distance
        nearest = index
      }
    })
    setActive(nearest)
  }, [])

  // Scrolling fires many events; one update per frame is plenty.
  const frame = useRef<number | null>(null)
  const onScroll = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      updateActive()
    })
  }, [updateActive])
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  // If cards are added or removed while the page is open, keep the dot in range.
  const lastIndex = items.length - 1
  const shownActive = Math.min(active, lastIndex)

  return (
    <>
      <Box
        ref={track}
        onScroll={onScroll}
        // A focusable region: with focus on it, the arrow keys scroll it natively.
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        sx={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          // Cancel the page padding so cards run to the screen edge, then give it back inside.
          mx: { xs: -5, sm: -8 },
          px: PAGE_PADDING,
          scrollPaddingInline: { xs: '20px', sm: '32px' },
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          WebkitOverflowScrolling: 'touch',
          '&:focus-visible': { outline: `2px solid ${landing.color.focusRing}`, outlineOffset: 2 },
        }}
      >
        {items.map((item, index) => (
          <CarouselCard key={item.id} item={item} index={index} />
        ))}
      </Box>

      <CarouselDots count={items.length} active={shownActive} />
    </>
  )
}

/** The track's left padding in pixels (the cards start that far in), read from the browser. */
function parsePadding(element: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(element).paddingLeft)
  return Number.isFinite(value) ? value : 0
}

function CarouselCard({ item, index }: { item: CmsItem; index: number }) {
  return (
    <Box
      role="group"
      aria-roledescription="slide"
      aria-label={item.image_alt && item.image_alt.trim() !== '' ? item.image_alt : item.heading}
      sx={{
        flex: '0 0 84%',
        scrollSnapAlign: 'start',
        backgroundColor: tokens.color.surface1,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: '24px',
        overflow: 'hidden',
      }}
    >
      <CardPicture src={cardImageFor(item)} alt={item.image_alt} fallbackExpression={fallbackExpression(index)} />

      <Box sx={{ p: '16px 18px 20px' }}>
        <Typography
          component="h3"
          sx={{ fontFamily: landing.font.display, fontWeight: 700, fontSize: 20, lineHeight: 1.25, color: landing.color.heading, m: 0 }}
        >
          {item.heading}
        </Typography>
        {item.subheading !== '' && (
          <Typography component="p" sx={{ fontFamily: landing.font.body, fontSize: 14, lineHeight: 1.5, color: tokens.color.textBody, m: 0, mt: 2 }}>
            {item.subheading}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
