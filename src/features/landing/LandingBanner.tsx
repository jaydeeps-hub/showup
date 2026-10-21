import ImageNotSupportedOutlined from '@mui/icons-material/ImageNotSupportedOutlined'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import { useState } from 'react'
import { useCmsValue } from '../../hooks/useCmsValue'
import { CMS_ENTRIES, toSafeImageUrl } from '../../services/cmsService'
import { landing } from './landingTheme'

/**
 * The mascot banner. The image address comes from the Supabase `cms` table (`id = 1`,
 * `content_type = 'lpage_banner'`); there is no built-in fallback picture.
 *
 * The space is reserved with a fixed aspect ratio from the start, so the page does not jump when
 * the image arrives. While loading it shows a skeleton; if the content or the image itself cannot
 * be loaded it shows a quiet empty frame rather than a broken-image icon.
 */
export function LandingBanner() {
  const banner = useCmsValue(CMS_ENTRIES.landingBanner)
  const [imageFailed, setImageFailed] = useState(false)

  const imageUrl = banner.status === 'found' ? toSafeImageUrl(banner.value) : null
  const unavailable = banner.status === 'not-found' || banner.status === 'error' || (banner.status === 'found' && !imageUrl) || imageFailed

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
      {banner.status === 'loading' && (
        <Skeleton variant="rectangular" animation="wave" sx={{ position: 'absolute', inset: 0, height: '100%', bgcolor: landing.color.skeleton }} />
      )}

      {imageUrl && !imageFailed && (
        <Box
          component="img"
          src={imageUrl}
          alt="The Showup mascot, a cheerful rat in a blue cap and headphones, lifting a barbell in a blue-lit gym"
          onError={() => setImageFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
      )}

      {unavailable && (
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
