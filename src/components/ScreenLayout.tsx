import CheckRounded from '@mui/icons-material/CheckRounded'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { tokens } from '../design-system/tokens'
import { TAB_BAR_CLEARANCE } from './BottomNav'

interface ScreenLayoutProps {
  /** Optional content shown on the right of the brand header. */
  headerAction?: ReactNode
  /** True on the screens that show the bottom tab bar, so the content can scroll clear of it. */
  hasTabBar?: boolean
  children: ReactNode
}

/** Shared page frame: brand header and a narrow, centred column that never stretches on desktop. */
export function ScreenLayout({ headerAction, hasTabBar = false, children }: ScreenLayoutProps) {
  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 4, sm: 6 },
        pt: 6,
        pb: hasTabBar ? TAB_BAR_CLEARANCE : 6,
      }}
    >
      <Box
        component="header"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, minHeight: 40, mb: 8 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            aria-hidden
            sx={{
              width: 28,
              height: 28,
              borderRadius: `${tokens.radius.small}px`,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <CheckRounded sx={{ fontSize: 18 }} />
          </Box>
          <Typography component="p" variant="h4">
            Showup
          </Typography>
        </Box>
        {headerAction}
      </Box>
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Container>
  )
}
