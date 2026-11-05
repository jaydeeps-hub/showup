import SearchRounded from '@mui/icons-material/SearchRounded'
import Box from '@mui/material/Box'
import { useRef } from 'react'
import { tokens } from '../design-system/tokens'

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  /** Empties the box. The box then puts the cursor back in itself, so the person can type again at once. */
  onClear: () => void
  /** What a screen reader calls the box, for example "Search gyms". */
  label: string
  placeholder: string
  disabled?: boolean
  /** `none` for a box where people type usernames (no capital at the start); the browser's own choice otherwise. */
  autoCapitalize?: 'none' | 'sentences'
}

/**
 * The design's search box (`.sbox` with `.clr`), shared by the gym search and the people search: a magnifier on the
 * left, the box itself (54px, the design's border and focus halo), and a clear ✕ on the right that shows only when
 * there is text and puts the cursor back in the box. It is a real `type="search"` box with `enterkeyhint=search` and
 * no autocomplete; the browser's own clear button is hidden, so it never sits on top of ours.
 */
export function SearchBox({ value, onChange, onClear, label, placeholder, disabled = false, autoCapitalize }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Box sx={{ position: 'relative', flex: 'none' }}>
      <SearchRounded aria-hidden sx={{ position: 'absolute', left: 16, top: 17, fontSize: 20, color: tokens.color.textSecondary, pointerEvents: 'none' }} />
      <Box
        component="input"
        ref={inputRef}
        type="search"
        role="searchbox"
        aria-label={label}
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        sx={{
          width: '100%',
          height: tokens.size.control,
          boxSizing: 'border-box',
          borderRadius: `${tokens.radius.control}px`,
          backgroundColor: tokens.color.surface1,
          border: `1.5px solid ${tokens.color.border}`,
          color: tokens.color.textPrimary,
          font: `400 16px ${tokens.font.body}`,
          pl: '46px',
          pr: '46px',
          transition: 'border-color 0.15s',
          '&::placeholder': { color: tokens.color.textSubtle, opacity: 1 },
          // The browser's own clear button would sit on top of ours.
          '&::-webkit-search-cancel-button': { display: 'none' },
          '&:focus': { outline: 'none', borderColor: tokens.color.accentPrimary, boxShadow: '0 0 0 3px rgba(43, 80, 217, 0.28)' },
          '&:disabled': { backgroundColor: tokens.color.surface2 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      />
      {value !== '' && (
        <Box
          component="button"
          type="button"
          disabled={disabled}
          aria-label="Clear search"
          onClick={() => {
            onClear()
            inputRef.current?.focus()
          }}
          sx={{
            position: 'absolute',
            right: 6,
            top: 5,
            width: 44,
            height: 44,
            border: 0,
            background: 'none',
            color: tokens.color.textSecondary,
            fontSize: 18,
            cursor: 'pointer',
            borderRadius: `${tokens.radius.small}px`,
            '&:focus-visible': { outline: `2px solid ${tokens.color.focusRing}` },
          }}
        >
          ✕
        </Box>
      )}
    </Box>
  )
}
