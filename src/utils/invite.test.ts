import { describe, expect, it, vi } from 'vitest'
import { copyText, INVITE_SHARE_TITLE, INVITE_TEXT, inviteMessage, openWhatsApp, shareInvite, whatsAppUrl, type InviteBrowser } from './invite'

const URL_ = 'https://showup-pied.vercel.app'

function browser(overrides: Partial<InviteBrowser> = {}): InviteBrowser {
  return { writeText: vi.fn(async () => {}), share: vi.fn(async () => {}), open: vi.fn(), ...overrides }
}
const abort = () => Object.assign(new Error('Share canceled'), { name: 'AbortError' })

describe('the words', () => {
  it('uses the design’s sentence, and the message ends with the plain app link', () => {
    expect(INVITE_TEXT).toBe('Join me on Showup. Show up for yourself and keep each other going.')
    expect(INVITE_SHARE_TITLE).toBe('Showup')
    expect(inviteMessage(URL_)).toBe('Join me on Showup. Show up for yourself and keep each other going: https://showup-pied.vercel.app')
  })

  it('never adds a per-person path to the link', () => {
    expect(inviteMessage(URL_)).not.toMatch(/join\//)
  })
})

describe('whatsAppUrl', () => {
  it('is wa.me with the whole message encoded', () => {
    expect(whatsAppUrl(URL_)).toBe(
      'https://wa.me/?text=Join%20me%20on%20Showup.%20Show%20up%20for%20yourself%20and%20keep%20each%20other%20going%3A%20https%3A%2F%2Fshowup-pied.vercel.app',
    )
  })

  it('decodes back to exactly the message', () => {
    const text = new URL(whatsAppUrl(URL_)).searchParams.get('text')
    expect(text).toBe(inviteMessage(URL_))
  })

  it('encodes characters that would otherwise break the address', () => {
    const odd = 'https://showup.app:8443'
    expect(new URL(whatsAppUrl(odd)).searchParams.get('text')).toBe(inviteMessage(odd))
    expect(whatsAppUrl(odd)).not.toContain(' ')
  })
})

describe('openWhatsApp', () => {
  it('opens wa.me in a new tab with noopener', () => {
    const b = browser()
    openWhatsApp(b, URL_)
    expect(b.open).toHaveBeenCalledWith(whatsAppUrl(URL_), '_blank', 'noopener')
  })
})

describe('copyText', () => {
  it('is true when the clipboard took the text', async () => {
    const b = browser()
    expect(await copyText(b, URL_)).toBe(true)
    expect(b.writeText).toHaveBeenCalledWith(URL_)
  })

  it('is false, without throwing, when the clipboard refuses', async () => {
    expect(await copyText(browser({ writeText: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) }), URL_)).toBe(false)
  })

  it('is false when there is no clipboard at all', async () => {
    expect(await copyText(browser({ writeText: undefined }), URL_)).toBe(false)
  })
})

describe('shareInvite', () => {
  it('uses the share sheet with the title, the sentence and the plain link', async () => {
    const b = browser()
    expect(await shareInvite(b, URL_)).toBe('shared')
    expect(b.share).toHaveBeenCalledWith({ title: 'Showup', text: 'Join me on Showup. Show up for yourself and keep each other going.', url: URL_ })
    expect(b.writeText).not.toHaveBeenCalled()
  })

  it('a share sheet the person closes is "cancelled", not an error, and copies nothing', async () => {
    const b = browser({ share: vi.fn(async () => Promise.reject(abort())) })
    expect(await shareInvite(b, URL_)).toBe('cancelled')
    expect(b.writeText).not.toHaveBeenCalled()
  })

  it('with no share sheet, copies the whole message instead', async () => {
    const b = browser({ share: undefined })
    expect(await shareInvite(b, URL_)).toBe('copied')
    expect(b.writeText).toHaveBeenCalledWith(inviteMessage(URL_))
  })

  it('with no share sheet and no clipboard, is "failed"', async () => {
    expect(await shareInvite(browser({ share: undefined, writeText: undefined }), URL_)).toBe('failed')
  })

  it('a share sheet that is refused for another reason falls back to copying the message', async () => {
    const b = browser({ share: vi.fn(async () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))) })
    expect(await shareInvite(b, URL_)).toBe('copied')
    expect(b.writeText).toHaveBeenCalledWith(inviteMessage(URL_))
  })

  it('and if that copy fails too, is "failed"', async () => {
    const b = browser({
      share: vi.fn(async () => Promise.reject(new Error('blocked'))),
      writeText: vi.fn(async () => Promise.reject(new Error('no'))),
    })
    expect(await shareInvite(b, URL_)).toBe('failed')
  })
})
