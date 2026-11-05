/**
 * The Squad invite: what is shared and how. It only ever shares the plain app link (`config.invite_url`), never a
 * per-person link. The browser features it uses (the clipboard, the share sheet) are passed in, so it works the same
 * in a test and on a phone, and a missing feature is handled here rather than crashing.
 */

/** The sentence that goes with the link. */
export const INVITE_TEXT = 'Join me on Showup. Show up for yourself and keep each other going.'

/** The title the phone's share sheet shows. */
export const INVITE_SHARE_TITLE = 'Showup'

/** The whole message, for WhatsApp and for copying when the phone has no share sheet. */
export function inviteMessage(inviteUrl: string): string {
  return `Join me on Showup. Show up for yourself and keep each other going: ${inviteUrl}`
}

/** WhatsApp's "send a message" link, with the message filled in. */
export function whatsAppUrl(inviteUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(inviteMessage(inviteUrl))}`
}

/** The parts of the browser the invite uses. In the app these are the real `navigator` and `window`. */
export interface InviteBrowser {
  /** Puts text on the clipboard. Missing where the browser has no clipboard access. */
  writeText?: (text: string) => Promise<void>
  /** Opens the phone's share sheet. Missing on most desktop browsers. */
  share?: (data: { title: string; text: string; url: string }) => Promise<void>
  /** Opens an address in a new tab. */
  open: (url: string, target: string, features: string) => void
}

/** The real browser. Read each time, so a test can replace `navigator` before it is used. */
export function realInviteBrowser(): InviteBrowser {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const clipboard = nav?.clipboard
  return {
    writeText: clipboard && typeof clipboard.writeText === 'function' ? (text) => clipboard.writeText(text) : undefined,
    share: nav && typeof nav.share === 'function' ? (data) => nav.share(data) : undefined,
    open: (url, target, features) => {
      window.open(url, target, features)
    },
  }
}

/** True when the text reached the clipboard. Never throws: a missing or refused clipboard is just `false`. */
export async function copyText(browser: InviteBrowser, text: string): Promise<boolean> {
  if (!browser.writeText) return false
  try {
    await browser.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * What happened when "Share invite" was pressed:
 * - `shared`: the share sheet was used (or is still open: the phone does not say which app was picked);
 * - `cancelled`: the person closed the share sheet, which is not an error, so nothing is said;
 * - `copied`: there is no share sheet, so the whole message was copied instead;
 * - `failed`: neither worked, so the person should copy the link from the box.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed'

export async function shareInvite(browser: InviteBrowser, inviteUrl: string): Promise<ShareOutcome> {
  if (browser.share) {
    try {
      await browser.share({ title: INVITE_SHARE_TITLE, text: INVITE_TEXT, url: inviteUrl })
      return 'shared'
    } catch (error) {
      // Closing the share sheet rejects with an AbortError. That is the person changing their mind, not a failure.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // Any other refusal (for example a browser that blocks sharing): fall back to copying the message.
    }
  }
  return (await copyText(browser, inviteMessage(inviteUrl))) ? 'copied' : 'failed'
}

/** Opens WhatsApp with the message, in a new tab that cannot reach back into the app (`noopener`). */
export function openWhatsApp(browser: InviteBrowser, inviteUrl: string): void {
  browser.open(whatsAppUrl(inviteUrl), '_blank', 'noopener')
}
