import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import { useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import type { ToastContent } from '../../components/Toast'
import { tokens } from '../../design-system/tokens'
import { copyText, openWhatsApp, realInviteBrowser, shareInvite, type InviteBrowser } from '../../utils/invite'

export const INVITE_TITLE = 'Invite friends to Showup'
export const INVITE_BODY = 'Share the app with friends. Once they join, search for their username and add them to your squad.'
export const COPY_FAILED = 'Copy the link from the box'

interface InviteSheetProps {
  open: boolean
  onClose: () => void
  /** The plain app link to share (`config.invite_url`). */
  inviteUrl: string
  /** Shows a message in the screen's toast (it sits above the sheet, so it can be seen while the sheet is open). */
  onToast: (toast: ToastContent) => void
  /** The browser features used; the real ones by default. Tests pass fakes. */
  browser?: InviteBrowser
}

/**
 * "Invite friends to Showup" (the design's #invs): the app link in a box with Copy, then Share invite, Send on WhatsApp
 * and Close. It shares only the plain app link, never a per-person one.
 */
export function InviteSheet({ open, onClose, inviteUrl, onToast, browser }: InviteSheetProps) {
  const [copied, setCopied] = useState(false)
  // Read the browser when a button is pressed, not when drawing, so it always sees the current one.
  const getBrowser = () => browser ?? realInviteBrowser()

  function close() {
    setCopied(false) // the next time the sheet opens, the button says "Copy" again
    onClose()
  }

  async function copyLink() {
    if (await copyText(getBrowser(), inviteUrl)) {
      setCopied(true)
      onToast({ severity: 'success', message: 'Link copied' })
    } else {
      onToast({ severity: 'error', message: COPY_FAILED })
    }
  }

  async function share() {
    const outcome = await shareInvite(getBrowser(), inviteUrl)
    if (outcome === 'copied') onToast({ severity: 'success', message: 'Invite message copied' })
    else if (outcome === 'failed') onToast({ severity: 'error', message: COPY_FAILED })
    // 'shared' says nothing (the phone's own sheet did the work); 'cancelled' is the person changing their mind.
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={INVITE_TITLE}
      actions={
        <>
          {/* The design's .lkb: the link on one line, cut with "...", and Copy on the right. */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              bgcolor: tokens.color.surface2,
              borderRadius: `${tokens.radius.control}px`,
              p: '6px 6px 6px 14px',
              mb: '6px',
              fontSize: 14,
              color: tokens.color.textPrimary,
            }}
          >
            <Box
              component="span"
              data-testid="invite-link"
              title={inviteUrl}
              sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {inviteUrl}
            </Box>
            <ButtonBase
              onClick={() => void copyLink()}
              aria-label={copied ? 'Link copied' : 'Copy the link'}
              sx={{
                height: 40,
                minWidth: 44,
                px: '14px',
                borderRadius: '10px',
                bgcolor: tokens.color.surface1,
                color: tokens.color.accentText,
                font: `600 14px ${tokens.font.body}`,
                flex: 'none',
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </ButtonBase>
          </Box>
          <Button variant="contained" size="large" fullWidth onClick={() => void share()} sx={{ minHeight: tokens.size.control }}>
            Share invite
          </Button>
          <Button
            fullWidth
            size="large"
            color="inherit"
            onClick={() => openWhatsApp(getBrowser(), inviteUrl)}
            sx={{ minHeight: tokens.size.control, bgcolor: tokens.color.surface2, color: tokens.color.textPrimary, '&:hover': { bgcolor: tokens.color.border } }}
          >
            Send on WhatsApp
          </Button>
          {/* The design's ghost button (.btn.g), as on the goal screen's sheet: no fill, 48px. */}
          <Button
            variant="text"
            color="inherit"
            fullWidth
            onClick={close}
            sx={{ minHeight: 48, height: 48, fontWeight: 500, color: tokens.color.textPrimary }}
          >
            Close
          </Button>
        </>
      }
    >
      {INVITE_BODY}
    </BottomSheet>
  )
}
