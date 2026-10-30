import Box from '@mui/material/Box'
import { useMemo, useState, type ReactNode } from 'react'
import { home } from '../design-system/homeTokens'
import { MASCOT_HEIGHT } from '../config/mascotLayout'
import type { MascotContent, MascotPicture } from '../types'
import { imageFor } from '../utils/mascot'

const c = home.color

interface MascotRowProps {
  /** The picture to show, or null to show only the speech bubble. */
  picture: MascotPicture | null
  /** The mascot content, so a picture that fails to load can fall back to the `smile` one. */
  content: MascotContent
  /** What the mascot says, or null to leave the bubble out (the row keeps its height either way). */
  text: string | null
  /** The picture's height in pixels. The row is always at least this tall, so nothing jumps while content loads. */
  height?: number
  /** Space above the row. */
  marginTop?: string | number
  /** Anything to add inside the bubble after the text. */
  children?: ReactNode
}

/**
 * The mascot as the screens show it: a picture on the left and a speech bubble on the right (the design's `.say`
 * and `.bub`). It only draws; what to say and which picture comes from the caller, so Home (which picks from the
 * Home rows and the Show Up timer) and the goal screen (which picks from the goal rows) look exactly alike.
 */
export function MascotRow({ picture, content, text, height = MASCOT_HEIGHT, marginTop = '14px', children }: MascotRowProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mt: marginTop, minHeight: height, fontFamily: home.font.body }}>
      {picture && <MascotPictureImage key={picture.url} picture={picture} content={content} height={height} />}
      {text !== null && (
        <Box
          // Read out politely when the words change (a screen reader is not interrupted mid-sentence).
          aria-live="polite"
          sx={{
            bgcolor: c.surface,
            border: `1px solid ${c.line}`,
            borderRadius: '16px',
            p: '10px 14px',
            fontSize: 14,
            color: '#D5D8E0',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {text}
          {children}
        </Box>
      )}
    </Box>
  )
}

/**
 * The mascot's picture. Decorative: the words say everything, so it is hidden from screen readers.
 * If it fails to load, try the `smile` picture once; if that fails too, show nothing (the bubble stays).
 * The row's height is fixed by the parent, and the width/height attributes reserve the shape, so
 * nothing jumps while it loads.
 */
function MascotPictureImage({ picture, content, height }: { picture: MascotPicture; content: MascotContent; height: number }) {
  const [useFallback, setUseFallback] = useState(false)
  const [failed, setFailed] = useState(false)

  const smile = useMemo(() => imageFor({ images: content.images }, 'smile'), [content.images])
  const shown = useFallback && smile ? smile : picture
  if (failed) return null

  return (
    <Box
      component="img"
      src={shown.url}
      alt=""
      aria-hidden
      // The attributes let the browser reserve the right shape before the picture arrives.
      {...(shown.width ? { width: shown.width } : {})}
      {...(shown.height ? { height: shown.height } : {})}
      onError={() => {
        // First failure: try the smile picture (unless that is what just failed). Second: give up quietly.
        if (!useFallback && smile && smile.url !== picture.url) setUseFallback(true)
        else setFailed(true)
      }}
      sx={{ height, width: 'auto', flex: 'none', objectFit: 'contain', display: 'block' }}
    />
  )
}
