import Box from '@mui/material/Box'
import { useState } from 'react'
import { tokens } from '../design-system/tokens'
import { useMascotContent } from '../hooks/useMascot'
import { imageFor as mascotImageFor } from '../utils/mascot'

interface CardPictureProps {
  /** The card's own picture address (already with its cache-busting suffix), or null when it has none. */
  src: string | null
  /** The picture's description; empty or null means decorative. */
  alt: string | null
  /** The mascot expression shown instead when there is no picture of its own, or it fails to load. */
  fallbackExpression: string
  /** Rounded corners in pixels. Leave out when a parent already clips the corners. */
  radius?: number
  /** Draw a 1px line around the panel. */
  bordered?: boolean
}

/**
 * The 4:3 picture area at the top of a carousel card (the landing carousel and the Quick Start). It shows the
 * card's own picture; with none, or if that picture fails to load, it shows a mascot picture centred in the
 * same space, so the card never has a hole or a broken-image icon.
 */
export function CardPicture({ src, alt, fallbackExpression, radius = 0, bordered = false }: CardPictureProps) {
  // Which picture has failed to load. A card whose own picture failed shows the mascot panel instead.
  const [failed, setFailed] = useState<string | null>(null)
  const showPicture = src !== null && failed !== src

  return (
    <Box
      sx={{
        aspectRatio: '4 / 3',
        width: '100%',
        backgroundColor: tokens.color.surface1,
        border: bordered ? `1px solid ${tokens.color.border}` : 'none',
        borderRadius: `${radius}px`,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      {showPicture ? (
        <Box
          component="img"
          src={src}
          alt={alt ?? ''}
          // Dragging the picture would start the browser's own image drag and cancel a swipe.
          draggable={false}
          onError={() => setFailed(src)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <MascotPanel expression={fallbackExpression} />
      )}
    </Box>
  )
}

/**
 * The mascot, centred. It is its own component so the mascot content is only read when a card needs it.
 * With no mascot picture available either, the panel is simply left plain.
 */
function MascotPanel({ expression }: { expression: string }) {
  const mascot = useMascotContent()
  const picture = mascotImageFor(mascot, expression)
  if (!picture) return null
  return (
    <Box
      component="img"
      src={picture.url}
      // Decorative: the card's words describe it.
      alt=""
      aria-hidden
      draggable={false}
      {...(picture.width ? { width: picture.width } : {})}
      {...(picture.height ? { height: picture.height } : {})}
      sx={{ height: '100%', width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
    />
  )
}
