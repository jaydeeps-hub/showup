// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import { landing } from './landingTheme'

/**
 * iOS Safari shows the page's ROOT background (<html>/<body>) when you pull down to refresh, not the
 * landing page's own wrapper. These tests check the root colours follow the landing page while it is
 * on screen, and that the signed-in screens get their own colours back.
 */

vi.mock('../../services/cmsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/cmsService')>()),
  fetchCmsValue: vi.fn().mockResolvedValue({ status: 'not-found' }),
}))
vi.mock('../../services/authService', () => ({
  signInWithGoogle: vi.fn(),
  consumeRedirectError: vi.fn().mockReturnValue(null),
  AuthNotConfiguredError: class extends Error {},
  AuthRedirectUnavailableError: class extends Error {},
}))
vi.mock('../../services/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))

const { LandingScreen } = await import('./LandingScreen')

const APP_BACKGROUND = 'rgb(14, 15, 18)' // what the signed-in screens use
const themeColorTag = () => document.querySelector('meta[name="theme-color"]')

function renderLanding() {
  return render(
    <ThemeProvider theme={theme}>
      <LandingScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#0E0F12" />'
  document.documentElement.style.backgroundColor = ''
  document.body.style.backgroundColor = APP_BACKGROUND
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('landing page root background (iOS pull-to-refresh area)', () => {
  it('uses #050A14 as the landing page colour', () => {
    expect(landing.color.page).toBe('#050A14')
  })

  it('paints <html> and <body> with the landing colour while the page is showing', () => {
    renderLanding()

    expect(document.documentElement.style.backgroundColor).toBe('rgb(5, 10, 20)')
    expect(document.body.style.backgroundColor).toBe('rgb(5, 10, 20)')
  })

  it('tints the browser bar (theme-color) with the same colour', () => {
    renderLanding()
    expect(themeColorTag()?.getAttribute('content')).toBe('#050A14')
  })

  it('puts the original colours back when the landing page goes away, so signed-in screens are unchanged', () => {
    const { unmount } = renderLanding()
    unmount()

    expect(document.documentElement.style.backgroundColor).toBe('')
    expect(document.body.style.backgroundColor).toBe(APP_BACKGROUND)
    expect(themeColorTag()?.getAttribute('content')).toBe('#0E0F12')
  })

  it('does not fail if the page has no theme-color tag', () => {
    document.head.innerHTML = ''
    const { unmount } = renderLanding()
    expect(document.documentElement.style.backgroundColor).toBe('rgb(5, 10, 20)')
    expect(() => unmount()).not.toThrow()
  })
})
