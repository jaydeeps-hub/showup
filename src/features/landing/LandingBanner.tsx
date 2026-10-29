import ImageNotSupportedOutlined from '@mui/icons-material/ImageNotSupportedOutlined'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import { useState } from 'react'
import { useLandingContent } from '../../hooks/useLandingContent'
import { DEFAULT_BANNER_URL } from '../../services/landingContent'
import { landing } from './landingTheme'

/**
 * The mascot banner. The picture's address comes from the Supabase `config` table (renamed from `cms` in
 * Phase 9; `content_type = 'lpage_banner'`). If the table has none, or it is unusable, or the picture
 * itself cannot be loaded, the built-in banner (the design's mascot picture) is shown instead, so the
 * landing page never has a hole where the picture should be.
 *
 * The space is reserved with a fixed aspect ratio from the start, so the page does not jump when the
 * image arrives. While the table is being read it shows a skeleton, so a visitor does not see the built-in
 * picture flash and then change to the configured one.
 */
export function LandingBanner() {
  const { content, status } = useLandingContent()
  // Every address that failed to load. A bad configured address falls back to the built-in picture, once;
  // if the built-in picture fails too, a quiet frame is shown. Nothing is ever retried in a loop.
  const [failed, setFailed] = useState<readonly string[]>([])

  const wanted = content.bannerUrl
  const url = failed.includes(wanted) ? DEFAULT_BANNER_URL : wanted
  const nothingToShow = failed.includes(url)

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1.36 / 1', // matches the reference banner, so layout stays put while loading
        borderRadius: `${landing.radius.banner}px`,
        overflow: 'hidden',
        backgroundColor: landing.color.bannerBackground,
      }}
    >
      {status === 'loading' && (
        <Skeleton variant="rectangular" animation="wave" sx={{ position: 'absolute', inset: 0, height: '100%', bgcolor: landing.color.skeleton }} />
      )}

      {status !== 'loading' && !nothingToShow && (
        <Box
          component="img"
          src={url}
          alt="The Showup mascot, a cheerful hamster in a blue cap and headphones, lifting a barbell in a blue-lit gym"
          onError={() => setFailed((list) => (list.includes(url) ? list : [...list, url]))}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
      )}

      {status !== 'loading' && nothingToShow && (
        <Box
          role="img"
          aria-label="The banner image is unavailable"
          sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: landing.color.supporting }}
        >
          <ImageNotSupportedOutlined sx={{ fontSize: 40, opacity: 0.6 }} />
        </Box>
      )}
    </Box>
  )
}
