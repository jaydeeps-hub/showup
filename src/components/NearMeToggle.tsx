import Box from '@mui/material/Box'
import { LOCATION_OFF_NOTE } from '../config/constants'
import { tokens } from '../design-system/tokens'
import type { NearMeStatus } from '../hooks/useNearMe'

interface NearMeToggleProps {
  on: boolean
  status: NearMeStatus
  /** The person's tap. `true` means they are turning it on. */
  onChange: (wantOn: boolean) => void
  disabled?: boolean
}

/**
 * The "Gyms near me" row of the design: the label and a line under it on the left, a switch on the right, at least
 * 54px tall. While the position is being found, the line under the label says "Finding where you are…". If the
 * browser refused, or could not give a position, the switch is back off and a short note appears under the row.
 * The whole row is the tap target; the switch input itself is what a screen reader finds (`role="switch"`).
 */
export function NearMeToggle({ on, status, onChange, disabled = false }: NearMeToggleProps) {
  const finding = status === 'finding'
  return (
    <Box>
      <Box
        component="label"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          mt: '12px',
          minHeight: 54,
          p: '8px 14px',
          borderRadius: `${tokens.radius.control}px`,
          backgroundColor: tokens.color.surface1,
          cursor: disabled ? 'default' : 'pointer',
          '&:has(input:focus-visible)': { outline: `2px solid ${tokens.color.focusRing}`, outlineOffset: 2 },
        }}
      >
        <Box component="span" sx={{ minWidth: 0 }}>
          <Box component="b" sx={{ display: 'block', fontSize: 15, fontWeight: 600, color: tokens.color.textPrimary }}>
            Gyms near me
          </Box>
          <Box component="span" sx={{ fontSize: 13, color: tokens.color.textSecondary }}>
            {finding ? 'Finding where you are…' : 'Show the closest gyms first'}
          </Box>
        </Box>
        <Box
          component="input"
          type="checkbox"
          role="switch"
          aria-label="Gyms near me"
          checked={on}
          // Asking again while a position is already being found would start a second request.
          disabled={disabled || finding}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
          sx={{
            appearance: 'none',
            WebkitAppearance: 'none',
            flex: 'none',
            width: 48,
            height: 28,
            m: 0,
            borderRadius: '14px',
            backgroundColor: '#3A3F4B',
            position: 'relative',
            cursor: 'inherit',
            transition: 'background-color 0.15s',
            '&::after': {
              content: '""',
              position: 'absolute',
              top: 3,
              left: 3,
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: '#fff',
              transition: 'transform 0.15s',
            },
            '&:checked': { backgroundColor: tokens.color.accentPrimary },
            '&:checked::after': { transform: 'translateX(20px)' },
            '&:disabled': { opacity: 0.6 },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&::after': { transition: 'none' } },
          }}
        />
      </Box>

      {status === 'failed' && (
        <Box role="status" sx={{ fontSize: 13, color: tokens.color.textSecondary, mt: '8px', px: '14px' }}>
          {LOCATION_OFF_NOTE}
        </Box>
      )}
    </Box>
  )
}
