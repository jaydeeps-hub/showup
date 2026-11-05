import Box from '@mui/material/Box'
import type { KeyboardEvent, Ref } from 'react'
import { tokens } from '../design-system/tokens'
import type { UsernameCheckStatus } from '../hooks/useUsernameCheck'
import { cleanUsernameInput, USERNAME_MAX_LENGTH } from '../utils/username'
import { Loader } from './Loader'

/** The colour of the hint for each state: muted by default and while checking, green when ok, red on error. */
const HINT_COLOR: Record<UsernameCheckStatus, string> = {
  idle: tokens.color.textSecondary,
  checking: tokens.color.textSecondary,
  ok: tokens.color.success,
  error: tokens.color.error,
}

interface UsernameFieldProps {
  /** The id of the input. Its label points at it, and the hint is `${id}-hint`. */
  id: string
  /** The cleaned value. */
  value: string
  /** Gets the CLEANED value of every keystroke or paste (lowercase, only a-z, 0-9 and _, at most 20). */
  onChange: (cleaned: string) => void
  /** What to show under the field, and in which colour. Red also turns the field's border red. */
  status: UsernameCheckStatus
  hint: string
  disabled?: boolean
  /** Enter moves here (the next field) and never submits. */
  onEnter?: () => void
  inputRef?: Ref<HTMLInputElement>
  required?: boolean
}

/**
 * The username field of the design (`.unw` and `.uh`), shared by onboarding and Profile so they look and behave the
 * same: the "Username" label, an input with an "@" inside its left edge, and the live hint under it. It cleans what is
 * typed; it does not check anything itself (pair it with `useUsernameCheck`) and it never saves.
 *
 * The box is the design's: 54px, surface fill, 1.5px line border, blue halo on focus, red border when the hint is red.
 */
export function UsernameField(props: UsernameFieldProps) {
  const { id, value, onChange, status, hint, disabled = false, onEnter, inputRef, required = false } = props
  const bad = status === 'error'
  const hintId = `${id}-hint`

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    onEnter?.()
  }

  return (
    <Box>
      <Box component="label" htmlFor={id} sx={{ display: 'block', fontSize: 14, fontWeight: 500, mb: 2, color: tokens.color.textPrimary }}>
        Username
      </Box>
      {/* The design's .unw: an "@" inside the left of the field, and the text starting after it. */}
      <Box sx={{ position: 'relative' }}>
        <Box
          component="span"
          aria-hidden
          sx={{
            position: 'absolute',
            left: '16px',
            top: 0,
            height: tokens.size.control,
            display: 'grid',
            placeItems: 'center',
            color: tokens.color.textSecondary,
            fontSize: 16,
            pointerEvents: 'none',
          }}
        >
          @
        </Box>
        <Box
          component="input"
          id={id}
          ref={inputRef}
          value={value}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(cleanUsernameInput(event.target.value))}
          onKeyDown={handleKeyDown}
          maxLength={USERNAME_MAX_LENGTH}
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="jay_shows_up"
          disabled={disabled}
          required={required}
          aria-invalid={bad}
          aria-describedby={hintId}
          sx={{
            width: '100%',
            height: tokens.size.control,
            boxSizing: 'border-box',
            borderRadius: `${tokens.radius.control}px`,
            backgroundColor: tokens.color.surface1,
            border: `1.5px solid ${bad ? tokens.color.error : tokens.color.border}`,
            color: tokens.color.textPrimary,
            font: `400 16px ${tokens.font.body}`,
            pl: '34px',
            pr: '16px',
            transition: 'border-color 0.15s',
            colorScheme: 'dark',
            '&::placeholder': { color: tokens.color.textSubtle, opacity: 1 },
            '&:focus': {
              outline: 'none',
              borderColor: bad ? tokens.color.error : tokens.color.accentPrimary,
              boxShadow: bad ? `0 0 0 3px ${tokens.color.error}40` : '0 0 0 3px rgba(43, 80, 217, 0.28)',
            },
            '&:disabled': { backgroundColor: tokens.color.surface2, color: tokens.color.textDisabled },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
      </Box>
      {/* The design's .uh: always in the page, so the field can point at it, and read out politely when it changes. */}
      <Box
        id={hintId}
        aria-live="polite"
        data-status={status}
        sx={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 20, mt: '6px', fontSize: 13, color: HINT_COLOR[status] }}
      >
        {status === 'checking' && <Loader size={16} />}
        <span>{hint}</span>
      </Box>
    </Box>
  )
}
