import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { ReactNode } from 'react'
import { tokens } from '../design-system/tokens'

export type AppTab = 'home' | 'pause' | 'profile'

/** The bar's height above the device's bottom safe area (the home indicator on iPhones). */
export const TAB_BAR_HEIGHT = 78

const SAFE_AREA_BOTTOM = 'env(safe-area-inset-bottom, 0px)'

/** Bottom padding for a screen, so its last item can be scrolled clear of the bar. */
export const TAB_BAR_CLEARANCE = `calc(${TAB_BAR_HEIGHT + 18}px + ${SAFE_AREA_BOTTOM})`

/** Where a bottom-anchored message (a toast) sits so it appears above the bar instead of on it. */
export const ABOVE_TAB_BAR = `calc(${TAB_BAR_HEIGHT + 12}px + ${SAFE_AREA_BOTTOM})`

interface TabDefinition {
  tab: AppTab
  label: string
  icon: ReactNode
}

// The icons are the ones from the design prototype (docs/design/showup-prototype.html, #nav).
// Order: Pause on the left, Home in the centre, Profile on the right.
const TABS: readonly TabDefinition[] = [
  {
    tab: 'pause',
    label: 'Pause',
    icon: (
      <>
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </>
    ),
  },
  { tab: 'home', label: 'Home', icon: <path d="M4 11l8-7 8 7v9H4z" /> },
  {
    tab: 'profile',
    label: 'Profile',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-5 15-5 16 0" />
      </>
    ),
  },
]

interface BottomNavProps {
  active: AppTab
  onSelect: (tab: AppTab) => void
  /** Tabs that cannot be pressed right now (for example while a location check is running). */
  disabled?: readonly AppTab[]
}

/**
 * The tab bar shown on Home, Pause and Profile. Fixed to the bottom of the screen, with room for
 * the device's bottom safe area. The active tab is the light accent blue; the others are muted.
 *
 * It sits at the app-bar layer, so dialogs and bottom sheets (Pause's confirmation) cover it.
 */
export function BottomNav({ active, onSelect, disabled = [] }: BottomNavProps) {
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        boxSizing: 'border-box',
        height: `calc(${TAB_BAR_HEIGHT}px + ${SAFE_AREA_BOTTOM})`,
        pb: `calc(10px + ${SAFE_AREA_BOTTOM})`,
        bgcolor: `${tokens.color.surface1}F5`,
        borderTop: `${tokens.border.width}px solid ${tokens.color.border}`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '100%', maxWidth: 600, mx: 'auto' }}>
        {TABS.map(({ tab, label, icon }) => {
          const isActive = tab === active
          return (
            <ButtonBase
              key={tab}
              aria-current={isActive ? 'page' : undefined}
              disabled={disabled.includes(tab)}
              onClick={() => {
                if (!isActive) onSelect(tab)
              }}
              sx={{
                flexDirection: 'column',
                gap: 1,
                minWidth: 76,
                minHeight: 48,
                borderRadius: `${tokens.radius.small}px`,
                color: isActive ? tokens.color.accentText : tokens.color.textSecondary,
                fontFamily: tokens.font.body,
                fontSize: 12,
                fontWeight: 500,
                '&.Mui-disabled': { opacity: 0.5 },
              }}
            >
              <Box
                component="svg"
                aria-hidden
                focusable="false"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                sx={{ width: 22, height: 22 }}
              >
                {icon}
              </Box>
              {label}
            </ButtonBase>
          )
        })}
      </Box>
    </Box>
  )
}
