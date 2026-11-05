import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { MascotPictureImage } from '../../components/MascotRow'
import { ShortText } from '../../components/ShortText'
import { home } from '../../design-system/homeTokens'
import { tokens } from '../../design-system/tokens'
import type { MascotContent, MascotPicture, SquadPerson } from '../../types'
import { getDisplayName } from '../../utils/profileValidation'

/** The avatar's size in pixels (the design's `.fa`). */
export const PERSON_AVATAR_SIZE = 48

interface PersonIdentityProps {
  person: SquadPerson
  /** The mascot picture for the avatar (the `smile` one), or null for a plain circle. */
  avatar: MascotPicture | null
  content: MascotContent
}

/**
 * The avatar, "@username" in bold and the name under it (the design's `.fa` and `.ft`), shared by the plain rows and the
 * request cards. The name is cut by the 25-character rule, with the whole name kept for screen readers.
 */
export function PersonIdentity({ person, avatar, content }: PersonIdentityProps) {
  const name = getDisplayName(person, '')
  return (
    <>
      <Box
        aria-hidden
        data-testid="person-avatar"
        sx={{
          width: PERSON_AVATAR_SIZE,
          height: PERSON_AVATAR_SIZE,
          borderRadius: '50%',
          bgcolor: tokens.color.surface2,
          border: `2px solid ${home.color.accentBorder}`,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          flex: 'none',
        }}
      >
        {avatar && <MascotPictureImage key={avatar.url} picture={avatar} content={content} height={38} />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 96 }}>
        {/* A username is at most 20 characters, so it is never cut; a long one wraps. */}
        <Box component="b" sx={{ display: 'block', fontWeight: 600, fontSize: 16, color: tokens.color.textPrimary, wordBreak: 'break-all' }}>
          @{person.username}
        </Box>
        {name !== '' && (
          <Box component="span" title={name} sx={{ display: 'block', position: 'relative', fontSize: 13, color: tokens.color.textSecondary }}>
            <ShortText text={name} />
          </Box>
        )}
      </Box>
    </>
  )
}

interface PersonRowProps extends PersonIdentityProps {
  /** What goes on the right: a button, a muted word, or a squad-mate's stats. */
  action?: ReactNode
}

/** One person on the Squad page (the design's `.fr`): the identity, and the action or stats on the right. */
export function PersonRow({ person, avatar, content, action }: PersonRowProps) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        minHeight: 68,
        p: '10px 14px',
        borderRadius: '16px',
        bgcolor: tokens.color.surface1,
        listStyle: 'none',
      }}
    >
      <PersonIdentity person={person} avatar={avatar} content={content} />
      {action}
    </Box>
  )
}

/** The muted word on the right of a row ("Requested", "In squad"): not a button, so it cannot be pressed. */
export function RowStatus({ children }: { children: string }) {
  return (
    <Box component="span" sx={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, color: tokens.color.textSecondary, px: '4px' }}>
      {children}
    </Box>
  )
}
