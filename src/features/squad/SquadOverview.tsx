import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useState } from 'react'
import { Loader } from '../../components/Loader'
import type { ToastContent } from '../../components/Toast'
import { home } from '../../design-system/homeTokens'
import { squad as squadColors } from '../../design-system/squadTokens'
import { tokens } from '../../design-system/tokens'
import { cancelSquadRequest, respondSquadRequest } from '../../services/squadService'
import type { MascotContent, MascotPicture, SquadMember, SquadRequest, SquadState } from '../../types'
import { showupsText, weeksInARowText } from '../../utils/squad'
import { PersonIdentity, PersonRow } from './PersonRow'

export const NO_SQUAD_YET = 'No one in your squad yet. Accept a request or search for people.'

interface SquadOverviewProps {
  squad: SquadState
  avatar: MascotPicture | null
  content: MascotContent
  onToast: (toast: ToastContent) => void
  /** Loads the page again; called after every action so it shows what the database now holds. */
  onChanged: () => void
}

/**
 * What the Squad page shows with the search box empty and something to show (the design's `squad()` with no query):
 * "Squad requests · N" (Accept / Reject), "Your squad" with each member's stats, and "Sent requests" (Cancel). With no
 * squad but requests waiting, a line says so under the requests. The page's empty state (nothing at all) is not drawn
 * here. There is no "Remove from squad" yet.
 */
export function SquadOverview({ squad, avatar, content, onToast, onChanged }: SquadOverviewProps) {
  // The button whose call is running ("accept:jay", "reject:jay", "cancel:jay"); every action button is disabled until its
  // answer is back, and the one that was pressed shows the loader.
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, call: () => Promise<void>) {
    if (busy !== null) return // one call at a time: a second tap does nothing
    setBusy(key)
    try {
      await call()
    } finally {
      setBusy(null)
      onChanged() // show what the database now holds (and refresh the tab's badge with it)
    }
  }

  function answer(request: SquadRequest, accept: boolean) {
    void run(`${accept ? 'accept' : 'reject'}:${request.username}`, async () => {
      const result = await respondSquadRequest(request.username, accept, squad.maxSize)
      if (result.status === 'squad') onToast({ severity: 'success', message: `@${request.username} joined your squad` })
      else if (result.status === 'declined') onToast({ severity: 'warning', message: 'Request rejected' })
      else onToast({ severity: 'error', message: result.message })
    })
  }

  function cancel(request: SquadRequest) {
    void run(`cancel:${request.username}`, async () => {
      const result = await cancelSquadRequest(request.username)
      // `done: false` means there was nothing to cancel (they answered meanwhile); the page refresh shows the truth.
      if (result.status === 'ok') onToast({ severity: 'warning', message: 'Request cancelled' })
      else onToast({ severity: 'error', message: result.message })
    })
  }

  return (
    <Box>
      {squad.incoming.length > 0 && (
        <Section title={`Squad requests · ${squad.incoming.length}`} gapAfter>
          {squad.incoming.map((request) => (
            <Box
              component="li"
              key={request.username}
              sx={{ listStyle: 'none', bgcolor: tokens.color.surface1, borderRadius: '16px', p: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <PersonIdentity person={request} avatar={avatar} content={content} />
              </Box>
              <Box sx={{ display: 'flex', gap: '8px' }}>
                <ActionButton
                  kind="primary"
                  label={`Accept @${request.username}`}
                  busy={busy === `accept:${request.username}`}
                  disabled={busy !== null}
                  onClick={() => answer(request, true)}
                  grow
                >
                  Accept
                </ActionButton>
                <ActionButton
                  kind="soft"
                  label={`Reject @${request.username}`}
                  busy={busy === `reject:${request.username}`}
                  disabled={busy !== null}
                  onClick={() => answer(request, false)}
                  grow
                >
                  Reject
                </ActionButton>
              </Box>
            </Box>
          ))}
        </Section>
      )}

      {squad.squad.length > 0 ? (
        <Section title="Your squad">
          {squad.squad.map((member) => (
            <PersonRow key={member.username} person={member} avatar={avatar} content={content} action={<Stats member={member} />} />
          ))}
        </Section>
      ) : (
        <Box component="p" sx={{ m: 0, fontSize: 14, color: tokens.color.textSecondary }}>
          {NO_SQUAD_YET}
        </Box>
      )}

      {squad.outgoing.length > 0 && (
        <Section title="Sent requests" gapBefore>
          {squad.outgoing.map((request) => (
            <PersonRow
              key={request.username}
              person={request}
              avatar={avatar}
              content={content}
              action={
                <ActionButton
                  kind="quiet"
                  label={`Cancel request to @${request.username}`}
                  busy={busy === `cancel:${request.username}`}
                  disabled={busy !== null}
                  onClick={() => cancel(request)}
                >
                  Cancel
                </ActionButton>
              }
            />
          ))}
        </Section>
      )}
    </Box>
  )
}

/** A heading (the design's `.gl`) and its list. */
function Section({ title, children, gapAfter = false, gapBefore = false }: { title: string; children: React.ReactNode; gapAfter?: boolean; gapBefore?: boolean }) {
  return (
    <Box component="section" sx={{ mt: gapBefore ? '22px' : 0, mb: gapAfter ? '22px' : 0 }}>
      <Box component="h2" sx={{ m: '0 0 8px', fontSize: 13, fontWeight: 400, color: tokens.color.textSecondary }}>
        {title}
      </Box>
      <Box component="ul" aria-label={title} sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {children}
      </Box>
    </Box>
  )
}

/** A squad-mate's two chips (the design's `stats()`): each shows only when its number is above 0. */
function Stats({ member }: { member: SquadMember }) {
  if (member.totalShowups <= 0 && member.weeksInARow <= 0) return null
  return (
    <Box data-testid="member-stats" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flex: 'none' }}>
      {member.totalShowups > 0 && <Chip colors={squadColors.showupsChip} number={member.totalShowups} text={showupsText(member.totalShowups)} />}
      {member.weeksInARow > 0 && <Chip colors={squadColors.weeksChip} number={member.weeksInARow} text={weeksInARowText(member.weeksInARow)} />}
    </Box>
  )
}

/** One chip: the number in the display font, the rest small. Read as one phrase ("12 weeks in a row"). */
function Chip({ colors, number, text }: { colors: { background: string; border: string; text: string; number: string }; number: number; text: string }) {
  const rest = text.slice(String(number).length)
  return (
    <Box
      component="span"
      aria-label={text}
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '5px',
        p: '5px 11px',
        borderRadius: '999px',
        fontSize: 11,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        bgcolor: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.text,
      }}
    >
      <Box component="b" aria-hidden sx={{ font: `700 15px ${tokens.font.display}`, color: colors.number }}>
        {number}
      </Box>
      <span aria-hidden>{rest.trim()}</span>
    </Box>
  )
}

/**
 * The design's small action buttons: `primary` is Accept (`.ab.p`, full blue), `soft` is Reject (`.ab`, soft blue) and
 * `quiet` is Cancel (`.ab.cn`, no fill, a line border, muted).
 */
function ActionButton(props: {
  children: string
  label: string
  kind: 'primary' | 'soft' | 'quiet'
  busy: boolean
  disabled: boolean
  onClick: () => void
  grow?: boolean
}) {
  const { children, label, kind, busy, disabled, onClick, grow = false } = props
  const look = {
    primary: { bg: tokens.color.accentPrimary, border: tokens.color.accentPrimary, color: tokens.color.onAccent, weight: 600, hover: tokens.color.accentHover },
    soft: { bg: tokens.color.accentTint, border: home.color.accentBorder, color: home.color.kpiLabel, weight: 600, hover: tokens.color.accentTint },
    quiet: { bg: 'transparent', border: tokens.color.border, color: tokens.color.textSecondary, weight: 500, hover: 'transparent' },
  }[kind]
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-busy={busy}
      startIcon={busy ? <Loader size={14} color="currentColor" /> : undefined}
      sx={{
        flex: grow ? 1 : 'none',
        height: grow ? 42 : 40,
        px: '16px',
        borderRadius: `${tokens.radius.small}px`,
        border: `1.5px solid ${look.border}`,
        bgcolor: look.bg,
        color: look.color,
        fontWeight: look.weight,
        fontSize: 14,
        textTransform: 'none',
        '&:hover': { bgcolor: look.hover },
        '&.Mui-disabled': { opacity: 0.55, color: look.color },
      }}
    >
      {children}
    </Button>
  )
}
