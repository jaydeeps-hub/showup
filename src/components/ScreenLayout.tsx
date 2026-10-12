import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

interface ScreenLayoutProps {
  /** Optional content shown on the right of the SHOWUP header. */
  headerAction?: ReactNode
  children: ReactNode
}

/** Shared page frame: brand header and a narrow, centred column. */
export function ScreenLayout({ headerAction, children }: ScreenLayoutProps) {
  return (
    <Container maxWidth="sm" sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', py: 3 }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Typography component="p" variant="h6" sx={{ fontWeight: 800, letterSpacing: '0.12em' }}>
          SHOWUP
        </Typography>
        {headerAction}
      </Box>
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Container>
  )
}
