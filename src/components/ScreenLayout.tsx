import CheckRounded from '@mui/icons-material/CheckRounded'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { tokens } from '../design-system/tokens'
import { BrandMarkImage } from './BrandMarkImage'
import { TAB_BAR_CLEARANCE } from './BottomNav'

/** The size of the mark before the "Showup" name in the header, in pixels. */
const BRAND_MARK_SIZE = 28

interface ScreenLayoutProps {
  /** Optional content shown on the right of the brand header. */
  headerAction?: ReactNode
  /** Set to false for a screen that supplies its own header (Home). Defaults to showing the brand header. */
  showBrand?: boolean
  /** True on the screens that show the bottom tab bar, so the content can scroll clear of it. */
  hasTabBar?: boolean
  /** Extra space in pixels under the content, for a bar pinned above the tab bar (for example Save / Cancel). */
  bottomSpace?: number
  children: ReactNode
}

/** Shared page frame: brand header and a narrow, centred column that never stretches on desktop. */
export function ScreenLayout({ headerAction, showBrand = true, hasTabBar = false, bottomSpace = 0, children }: ScreenLayoutProps) {
  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 4, sm: 6 },
        pt: 6,
        pb: hasTabBar ? `calc(${TAB_BAR_CLEARANCE} + ${bottomSpace}px)` : 6,
      }}
    >
      {showBrand && (
        <Box
          component="header"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, minHeight: 40, mb: 8 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* The brand logo from the database; if there is none, the blue square with a tick it used to be. */}
            <BrandMarkImage
              size={BRAND_MARK_SIZE}
              fallback={
                <Box
                  aria-hidden
                  sx={{
                    width: BRAND_MARK_SIZE,
                    height: BRAND_MARK_SIZE,
                    borderRadius: `${tokens.radius.small}px`,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <CheckRounded sx={{ fontSize: 18 }} />
                </Box>
              }
            />
            <Typography component="p" variant="h4">
              Showup
            </Typography>
          </Box>
          {headerAction}
        </Box>
      )}
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Container>
  )
}
