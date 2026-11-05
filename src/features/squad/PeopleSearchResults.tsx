import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useState } from 'react'
import { Loader } from '../../components/Loader'
import { ShortText } from '../../components/ShortText'
import type { ToastContent } from '../../components/Toast'
import { home } from '../../design-system/homeTokens'
import { tokens } from '../../design-system/tokens'
import type { PeopleSearch } from '../../hooks/usePeopleSearch'
import { respondSquadRequest, sendSquadRequest } from '../../services/squadService'
import type { MascotContent, MascotPicture, SearchResult, SquadRelation } from '../../types'
import { PersonRow, RowStatus } from './PersonRow'

export const FINDING_PEOPLE = 'Finding people…'
export const RESULTS_HEADING = 'People on Showup'
export const NOTHING_FOUND_BODY = 'Check the username, or invite them to join Showup.'
export const SEARCH_FAILED = 'Couldn’t search right now'

interface PeopleSearchResultsProps {
  search: PeopleSearch
  avatar: MascotPicture | null
  content: MascotContent
  /** Shows a message in the screen's shared toast. */
  onToast: (toast: ToastContent) => void
  /** Opens the invite sheet (from "nothing found"). */
  onInvite: () => void
  /** The squad's size limit, for "Your squad is full (max N)." (unknown until the squad has loaded). */
  maxSize?: number
  /** Called after every Request or Accept, so the squad page (and the tab's badge) shows what the database now holds. */
  onChanged?: () => void
}

/**
 * What the Squad page shows while the search box has text (the design's search states): "Finding people…" while
 * searching, "People on Showup" with a row per person, "No one found for …" with Invite friends, or a failure with
 * Retry. Each row's right side follows its relation: Request, Requested, Accept or In squad. Request and Accept change
 * the row in place once the database agrees; a button is disabled while its call runs, so it can never be sent twice.
 */
export function PeopleSearchResults({ search, avatar, content, onToast, onInvite, maxSize, onChanged }: PeopleSearchResultsProps) {
  // Relations changed on this list since the search answered (after Request or Accept), by username. A new search
  // brings fresh relations from the database, so these are kept only for the query they were made on.
  const [changed, setChanged] = useState<{ query: string; relations: Record<string, SquadRelation> }>({ query: '', relations: {} })
  // The username whose call is running right now; its button is disabled until the answer is back.
  const [busy, setBusy] = useState<string | null>(null)
  const relations = changed.query === search.query ? changed.relations : {}

  function setRelation(username: string, relation: SquadRelation) {
    setChanged((current) => ({
      query: search.query,
      relations: { ...(current.query === search.query ? current.relations : {}), [username]: relation },
    }))
  }

  async function request(person: SearchResult) {
    if (busy !== null) return // one call at a time: a second tap does nothing
    setBusy(person.username)
    const result = await sendSquadRequest(person.username, maxSize)
    setBusy(null)
    onChanged?.()
    if (result.status === 'requested') {
      setRelation(person.username, 'requested')
      onToast({ severity: 'success', message: `Request sent to @${person.username}` })
    } else if (result.status === 'squad') {
      // They had already asked: asking back made you squad-mates.
      setRelation(person.username, 'squad')
      onToast({ severity: 'success', message: `@${person.username} joined your squad` })
    } else {
      onToast({ severity: 'error', message: result.message })
    }
  }

  async function accept(person: SearchResult) {
    if (busy !== null) return
    setBusy(person.username)
    const result = await respondSquadRequest(person.username, true, maxSize)
    setBusy(null)
    onChanged?.()
    if (result.status === 'squad') {
      setRelation(person.username, 'squad')
      onToast({ severity: 'success', message: `@${person.username} joined your squad` })
    } else if (result.status === 'declined') {
      // Not expected for an acceptance; treat it as "no longer a request" rather than claiming success.
      setRelation(person.username, 'none')
    } else {
      onToast({ severity: 'error', message: result.message })
    }
  }

  if (search.status === 'idle') return null

  if (search.status === 'searching') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: '10px' }}>
        <Box component="span" role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: tokens.color.textSecondary, fontSize: 14 }}>
          <Loader size={18} />
          {FINDING_PEOPLE}
        </Box>
      </Box>
    )
  }

  if (search.status === 'error') {
    return (
      <Message title={SEARCH_FAILED}>
        <SoftButton onClick={search.retry}>Retry</SoftButton>
      </Message>
    )
  }

  if (search.results.length === 0) {
    return (
      <Message
        title={
          <>
            No one found for “<ShortText text={search.query} />”
          </>
        }
        body={NOTHING_FOUND_BODY}
      >
        <SoftButton onClick={onInvite}>Invite friends</SoftButton>
      </Message>
    )
  }

  return (
    <Box>
      <Box component="h2" sx={{ m: '0 0 8px', fontSize: 13, fontWeight: 400, color: tokens.color.textSecondary }}>
        {RESULTS_HEADING}
      </Box>
      <Box component="ul" aria-label={RESULTS_HEADING} sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {search.results.map((person) => {
          const relation = relations[person.username] ?? person.relation
          return (
            <PersonRow
              key={person.username}
              person={person}
              avatar={avatar}
              content={content}
              action={
                relation === 'none' ? (
                  <RowButton label={`Send squad request to @${person.username}`} busy={busy === person.username} disabled={busy !== null} onClick={() => void request(person)}>
                    Request
                  </RowButton>
                ) : relation === 'incoming' ? (
                  <RowButton label={`Accept @${person.username}`} primary busy={busy === person.username} disabled={busy !== null} onClick={() => void accept(person)}>
                    Accept
                  </RowButton>
                ) : relation === 'requested' ? (
                  <RowStatus>Requested</RowStatus>
                ) : (
                  <RowStatus>In squad</RowStatus>
                )
              }
            />
          )
        })}
      </Box>
    </Box>
  )
}

/** The design's `.ab` (Request) and `.ab.p` (Accept): 40px, rounded, soft blue or full blue. */
function RowButton(props: { children: string; label: string; primary?: boolean; busy: boolean; disabled: boolean; onClick: () => void }) {
  const { children, label, primary = false, busy, disabled, onClick } = props
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-busy={busy}
      startIcon={busy ? <Loader size={14} color="currentColor" /> : undefined}
      sx={{
        flex: 'none',
        height: 40,
        px: '16px',
        borderRadius: `${tokens.radius.small}px`,
        border: `1.5px solid ${primary ? tokens.color.accentPrimary : home.color.accentBorder}`,
        bgcolor: primary ? tokens.color.accentPrimary : tokens.color.accentTint,
        color: primary ? tokens.color.onAccent : home.color.kpiLabel,
        fontWeight: 600,
        fontSize: 14,
        textTransform: 'none',
        '&:hover': { bgcolor: primary ? tokens.color.accentHover : tokens.color.accentTint },
        '&.Mui-disabled': { opacity: 0.55, color: primary ? tokens.color.onAccent : home.color.kpiLabel },
      }}
    >
      {children}
    </Button>
  )
}

/** The design's `.msg`: a centred title, a line of help, and a button. */
function Message({ title, body, children }: { title: React.ReactNode; body?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', px: '12px', pt: '28px' }}>
      <Box component="h2" sx={{ m: 0, mb: '6px', font: `700 18px ${tokens.font.display}`, color: tokens.color.textPrimary, overflowWrap: 'anywhere', position: 'relative' }}>
        {title}
      </Box>
      {body && (
        <Box component="p" sx={{ m: 0, fontSize: 14, color: tokens.color.textSecondary }}>
          {body}
        </Box>
      )}
      {children}
    </Box>
  )
}

function SoftButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button
      color="inherit"
      onClick={onClick}
      sx={{
        mt: 2,
        height: 46,
        px: '22px',
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: tokens.color.surface2,
        color: tokens.color.textPrimary,
        fontWeight: 600,
        '&:hover': { bgcolor: tokens.color.border },
      }}
    >
      {children}
    </Button>
  )
}
