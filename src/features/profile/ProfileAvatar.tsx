import Box from '@mui/material/Box'
import { home } from '../../design-system/homeTokens'

interface ProfileAvatarProps {
  /** One or two capital letters. Empty shows a plain circle. */
  initials: string
}

/**
 * The round picture at the top of the Profile page. For now it shows the person's initials; it is
 * its own small component so a picture (the mascot's head) can replace them later without touching
 * the page. Decorative: the full name is written out right below it, so screen readers skip it.
 */
export function ProfileAvatar({ initials }: ProfileAvatarProps) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 104,
        height: 104,
        borderRadius: '50%',
        bgcolor: home.color.surface2,
        border: `2px solid ${home.color.accentBorder}`,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        color: home.color.text,
        fontFamily: home.font.heading,
        fontWeight: 700,
        fontSize: 34,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initials}
    </Box>
  )
}
