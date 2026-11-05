import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader } from '../../components/Loader'
import { MascotPictureImage } from '../../components/MascotRow'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SearchBox } from '../../components/SearchBox'
import { Toast, type ToastContent } from '../../components/Toast'
import { tokens } from '../../design-system/tokens'
import { useMascotContent } from '../../hooks/useMascot'
import { usePeopleSearch } from '../../hooks/usePeopleSearch'
import { useSquad } from '../../hooks/useSquad'
import { getCachedAppConfig, loadAppConfig } from '../../services/appConfig'
import type { MascotContent, MascotPicture, SquadState } from '../../types'
import type { InviteBrowser } from '../../utils/invite'
import { imageFor } from '../../utils/mascot'
import { friendsText } from '../../utils/squad'
import { InviteSheet } from './InviteSheet'
import { PeopleSearchResults } from './PeopleSearchResults'
import { SquadOverview } from './SquadOverview'

/** While the squad loads, and when it could not be loaded. */
export const LOADING_SQUAD = 'Loading your squad…'
export const SQUAD_LOAD_FAILED = 'Couldn’t load your squad'

/** The empty state's mascot, in pixels (the design's 96px box). */
export const SQUAD_EMPTY_MASCOT_SIZE = 96

interface SquadScreenProps {
  /** The browser features the invite uses; the real ones by default. Tests pass fakes. */
  inviteBrowser?: InviteBrowser
}

/**
 * The Squad tab (the design's #s9): the header with the squad's size, the people search, and the invite sheet. While
 * the search box has text, the search takes the place of the rest of the page. With it empty, the page shows the
 * squad from `get_squad` (task 5): its requests, the squad-mates with their stats and the requests sent; or the empty
 * state when there is nothing at all; the shared loader while it loads, and a message with Retry if it fails.
 */
export function SquadScreen({ inviteBrowser }: SquadScreenProps) {
  const content = useMascotContent()
  const wave = useMemo(() => imageFor(content, 'wave'), [content])
  // The avatar in every row (the design shows the smiling mascot for everyone).
  const smile = useMemo(() => imageFor(content, 'smile'), [content])
  const [searchText, setSearchText] = useState('')
  const search = usePeopleSearch(searchText)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [toast, setToast] = useState<ToastContent | null>(null)
  // The app link, from config.invite_url. The cached copy at once, then the fresh one when it has loaded.
  const [inviteUrl, setInviteUrl] = useState(() => getCachedAppConfig().inviteUrl)
  const configRequested = useRef(false)
  useEffect(() => {
    if (configRequested.current) return
    configRequested.current = true
    let cancelled = false
    void loadAppConfig().then((config) => {
      if (!cancelled) setInviteUrl(config.inviteUrl)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // The squad, its requests and their counts (the tab's badge is kept in step by useSquad itself).
  const { state: squadState, refresh } = useSquad()
  const loaded = squadState.status === 'ready' ? squadState.squad : null
  const squadCount = loaded?.squadCount ?? 0

  return (
    <ScreenLayout hasTabBar>
      {/* The design's .sqh: the title and the count on the left, Invite on the right. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" component="h1" sx={{ m: 0 }}>
            My squad
          </Typography>
          <Box component="p" sx={{ m: 0, mt: '2px', fontSize: 14, color: tokens.color.textSecondary }}>
            {friendsText(squadCount)}
          </Box>
        </Box>
        <Button
          variant="contained"
          onClick={() => setInviteOpen(true)}
          startIcon={<InviteIcon />}
          sx={{ height: 46, px: 4, borderRadius: `${tokens.radius.control}px`, fontWeight: 600, fontSize: 15, flex: 'none' }}
        >
          Invite
        </Button>
      </Box>

      {/* The people search, 18px under the header, as in the design. */}
      <Box data-testid="squad-search-slot" sx={{ mt: '18px' }}>
        <SearchBox
          value={searchText}
          onChange={setSearchText}
          onClear={() => setSearchText('')}
          label="Search people on Showup"
          placeholder="Search by username or name"
          autoCapitalize="none"
        />
      </Box>

      {search.status !== 'idle' ? (
        // Once there is something to search for (2 characters, a leading "@" not counted), the search takes the place
        // of the rest of the page. One character asks nothing, so the page stays as it is until a second one.
        <Box sx={{ mt: '16px' }}>
          <PeopleSearchResults
            search={search}
            avatar={smile}
            content={content}
            onToast={setToast}
            onInvite={() => setInviteOpen(true)}
            maxSize={loaded?.maxSize}
            onChanged={refresh}
          />
        </Box>
      ) : squadState.status === 'loading' ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: '36px' }}>
          <Box component="span" role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: tokens.color.textSecondary, fontSize: 14 }}>
            <Loader size={18} />
            {LOADING_SQUAD}
          </Box>
        </Box>
      ) : squadState.status === 'error' ? (
        <Box sx={{ mt: '16px', pt: '28px', textAlign: 'center', px: 3 }}>
          <Box component="h2" sx={{ m: 0, mb: '6px', font: `700 18px ${tokens.font.display}`, color: tokens.color.textPrimary }}>
            {SQUAD_LOAD_FAILED}
          </Box>
          <Box component="p" sx={{ m: 0, fontSize: 14, color: tokens.color.textSecondary }}>
            {squadState.message}
          </Box>
          <SoftButton onClick={refresh}>Retry</SoftButton>
        </Box>
      ) : isEmpty(squadState.squad) ? (
        <SquadEmptyState wave={wave} content={content} onInvite={() => setInviteOpen(true)} />
      ) : (
        <Box sx={{ mt: '16px' }}>
          <SquadOverview squad={squadState.squad} avatar={smile} content={content} onToast={setToast} onChanged={refresh} />
        </Box>
      )}

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} inviteUrl={inviteUrl} onToast={setToast} browser={inviteBrowser} />
      <Toast toast={toast} onClose={() => setToast(null)} aboveTabBar />
    </ScreenLayout>
  )
}

/** The design's invite icon: a person with a plus. */
function InviteIcon() {
  return (
    <Box
      component="svg"
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      sx={{ width: 18, height: 18 }}
    >
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3 20c.8-4.5 12.2-4.5 14 0M19 8v6M16 11h6" />
    </Box>
  )
}

/** The design's empty state (.msg): the waving mascot, the words and Invite friends. Nothing in the squad, no requests. */
function SquadEmptyState({ wave, content, onInvite }: { wave: MascotPicture | null; content: MascotContent; onInvite: () => void }) {
  return (
  <Box sx={{ mt: '16px', pt: '36px', textAlign: 'center', px: 3 }}>
    <Box
      data-testid="squad-empty-mascot"
      sx={{ width: SQUAD_EMPTY_MASCOT_SIZE, height: SQUAD_EMPTY_MASCOT_SIZE, mx: 'auto', mb: 3, display: 'grid', placeItems: 'center' }}
    >
      {wave && <MascotPictureImage key={wave.url} picture={wave} content={content} height={SQUAD_EMPTY_MASCOT_SIZE} />}
    </Box>
    <Box component="h2" sx={{ m: 0, mb: '6px', font: `700 18px ${tokens.font.display}`, color: tokens.color.textPrimary }}>
      Your squad is empty
    </Box>
    <Box component="p" sx={{ m: 0, fontSize: 14, color: tokens.color.textSecondary }}>
      Invite friends, or search for people who are already on Showup.
    </Box>
    <Button
      color="inherit"
      onClick={onInvite}
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
      Invite friends
    </Button>
  </Box>
  )
}

/** Nothing to show at all: no squad-mates and no requests either way. */
function isEmpty(squad: SquadState): boolean {
  return squad.squad.length === 0 && squad.incoming.length === 0 && squad.outgoing.length === 0
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
