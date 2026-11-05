import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { ReactNode } from 'react'
import { tokens } from '../design-system/tokens'

export type AppTab = 'home' | 'pause' | 'squad' | 'profile'

/** The bar's height above the device's bottom safe area (the home indicator on iPhones). */
export const TAB_BAR_HEIGHT = 78

/** The device's bottom safe area (the home indicator on iPhones). */
export const SAFE_AREA_BOTTOM = 'env(safe-area-inset-bottom, 0px)'

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
// Order, as in the design: Pause, Home, Squad, Profile.
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
    tab: 'squad',
    label: 'Squad',
    // Two people: one in front, one behind on the right (the design's #nv9).
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-4 11.2-4 12 0" />
        <circle cx="17" cy="9" r="2.8" />
        <path d="M16 14.2c3-.3 5 1 5.5 4" />
      </>
    ),
  },
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
  /**
   * A small number on a tab (the design's `.bdg`), with what a screen reader should call the tab instead of its plain
   * label. Only the Squad tab has one: its waiting requests.
   */
  badges?: Partial<Record<AppTab, { text: string; label: string }>>
}

/**
 * The tab bar shown on Pause, Home, Squad and Profile. Fixed to the bottom of the screen, with room for
 * the device's bottom safe area. The active tab is the light accent blue; the others are muted.
 *
 * It sits at the app-bar layer, so dialogs and bottom sheets (Pause's confirmation) cover it.
 */
export function BottomNav({ active, onSelect, disabled = [], badges = {} }: BottomNavProps) {
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
          const badge = badges[tab]
          return (
            <ButtonBase
              key={tab}
              aria-current={isActive ? 'page' : undefined}
              // With a badge, the tab says what the number means ("Squad, 2 requests"); without one, its plain label.
              aria-label={badge ? badge.label : undefined}
              disabled={disabled.includes(tab)}
              onClick={() => {
                if (!isActive) onSelect(tab)
              }}
              sx={{
                position: 'relative',
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
              {badge && (
                // The design's .bdg: an accent pill just right of the icon's middle. Hidden from screen readers, which
                // hear the tab's own label instead.
                <Box
                  component="span"
                  aria-hidden
                  data-testid={`${tab}-badge`}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 'calc(50% + 4px)',
                    minWidth: 18,
                    height: 18,
                    borderRadius: '9px',
                    bgcolor: tokens.color.accentPrimary,
                    color: tokens.color.onAccent,
                    font: `700 11px/18px ${tokens.font.body}`,
                    textAlign: 'center',
                    px: '5px',
                    boxSizing: 'border-box',
                  }}
                >
                  {badge.text}
                </Box>
              )}
            </ButtonBase>
          )
        })}
      </Box>
    </Box>
  )
}
