import { describe, expect, it } from 'vitest'
import { chooseRedirectUrl, describeRedirectError, normalizeSiteUrl } from './authRedirect'

const VERCEL = 'https://showup-abc123.vercel.app'

describe('chooseRedirectUrl', () => {
  it('uses the address the app is running on in production (no configuration needed)', () => {
    expect(chooseRedirectUrl({ currentOrigin: VERCEL })).toBe(VERCEL)
  })

  it('uses the local address during development', () => {
    expect(chooseRedirectUrl({ currentOrigin: 'http://localhost:5173' })).toBe('http://localhost:5173')
    expect(chooseRedirectUrl({ currentOrigin: 'http://127.0.0.1:4173' })).toBe('http://127.0.0.1:4173')
  })

  it('never returns localhost when the page is running on the production domain', () => {
    expect(chooseRedirectUrl({ currentOrigin: VERCEL })).not.toMatch(/localhost/)
  })

  it('works for each Vercel preview deployment automatically', () => {
    const preview = 'https://showup-git-feature-me.vercel.app'
    expect(chooseRedirectUrl({ currentOrigin: preview })).toBe(preview)
  })

  it('lets VITE_SITE_URL override the production address', () => {
    expect(chooseRedirectUrl({ currentOrigin: VERCEL, configuredSiteUrl: 'https://showup.example.com/' })).toBe(
      'https://showup.example.com',
    )
  })

  it('ignores VITE_SITE_URL when running on localhost, so development stays local', () => {
    expect(chooseRedirectUrl({ currentOrigin: 'http://localhost:5173', configuredSiteUrl: VERCEL })).toBe(
      'http://localhost:5173',
    )
  })

  it('ignores an invalid VITE_SITE_URL and falls back to the current address', () => {
    for (const bad of ['', '   ', 'not a url', 'javascript:alert(1)', 'http://evil.example.com', 'ftp://x.com']) {
      expect(chooseRedirectUrl({ currentOrigin: VERCEL, configuredSiteUrl: bad })).toBe(VERCEL)
    }
  })

  it('strips any path, query or fragment from the result', () => {
    expect(chooseRedirectUrl({ currentOrigin: VERCEL, configuredSiteUrl: `${VERCEL}/some/path?x=1#y` })).toBe(VERCEL)
  })

  it('returns null rather than an invalid redirect when the page has no usable address', () => {
    expect(chooseRedirectUrl({ currentOrigin: 'null' })).toBeNull() // e.g. opened from a file
    expect(chooseRedirectUrl({ currentOrigin: '' })).toBeNull()
    expect(chooseRedirectUrl({ currentOrigin: 'http://example.com' })).toBeNull() // plain http on the internet
  })
})

describe('normalizeSiteUrl', () => {
  it('accepts https and local http only', () => {
    expect(normalizeSiteUrl('https://a.example.com')).toBe('https://a.example.com')
    expect(normalizeSiteUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeSiteUrl('http://a.example.com')).toBeNull()
    expect(normalizeSiteUrl(undefined)).toBeNull()
  })
})

describe('describeRedirectError', () => {
  it('returns null for a normal URL', () => {
    expect(describeRedirectError('', '')).toBeNull()
    expect(describeRedirectError('?code=abc123', '')).toBeNull()
  })

  it('recognises the invalid_request error from the reported bug', () => {
    const result = describeRedirectError(
      '?error=invalid_request&error_code=bad_oauth_callback&error_description=OAuth+state+not+found',
      '',
    )
    expect(result?.problem).toBe('redirect-not-allowed')
    expect(result?.message).toMatch(/could not be completed/i)
    expect(result?.message).not.toMatch(/OAuth state/) // no raw jargon for the user
    expect(result?.raw).toMatch(/invalid_request/) // kept for the console
  })

  it('reads errors from the hash as well as the query string', () => {
    expect(describeRedirectError('', '#error=server_error&error_description=boom')?.problem).toBe('unknown')
  })

  it('treats a cancelled sign-in as a normal outcome', () => {
    const result = describeRedirectError('?error=access_denied&error_description=User+denied+access', '')
    expect(result?.problem).toBe('access-denied')
    expect(result?.message).toMatch(/cancelled/i)
  })

  it('gives a generic message for unknown errors', () => {
    expect(describeRedirectError('?error=server_error', '')?.message).toMatch(/did not complete/i)
  })
})
