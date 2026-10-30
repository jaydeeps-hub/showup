// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testGym } from '../test/fixtures'
import type { Gym, Profile } from '../types'
import { theme } from './theme'

/**
 * Regression tests for the problems three independent reviews found in the Add gym screen and "Gyms near me". Each test
 * describes a situation a person can really get into, and fails against the behaviour that was there before the fix.
 * The REAL App, screen, search view and hooks are used; only the outside world is faked.
 */

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-in',
    session: { user: { id: 'user-1', email: 'asha@example.com', user_metadata: {} } } as unknown as Session,
  }),
}))
vi.mock('../services/authService', () => ({ getIdentity: () => ({ id: 'user-1', username: 'Asha' }), signOut: vi.fn() }))

const profile: Profile = {
  id: 'user-1',
  firstName: 'Asha',
  lastName: 'Rao',
  dateOfBirth: null,
  isAdmin: false,
  placeSearchMode: 'fitness_only',
  quickstartCompletedAt: '2026-10-19T10:00:00Z',
  createdAt: '2026-10-19T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
}
vi.mock('../services/profileService', () => ({
  fetchProfile: vi.fn(async () => ({ status: 'found', profile })),
  updateProfile: vi.fn(),
  updatePlaceSearchMode: vi.fn(),
}))
vi.mock('../services/homeSummaryService', () => ({
  fetchHomeSummary: vi.fn(async () => ({ status: 'ok', summary: { weeksInARow: 2, bestWeeksInARow: 2, goalDays: 3, showupDaysThisWeek: 1, passesLeft: 3, totalShowups: 8 } })),
  fetchPauseState: vi.fn(async () => ({ status: 'ok', pause: { activePauses: [] } })),
}))
vi.mock('../services/calendarService', () => ({
  fetchCalendar: vi.fn(async () => ({ status: 'ok', calendar: { month: '2026-10-01', earliestMonth: '2026-10-01', latestMonth: '2026-10-01', gridFrom: '2026-09-28', gridTo: '2026-11-01', showupDates: [], weeks: [] } })),
}))
vi.mock('../services/goalService', () => ({
  fetchGoalState: vi.fn(async () => ({ status: 'ok', goal: { hasGoal: true, currentGoal: 3, pendingGoal: null, pendingFrom: null } })),
  setWeeklyGoal: vi.fn(),
}))
vi.mock('../services/timezoneService', () => ({ saveDeviceTimezone: vi.fn() }))
vi.mock('../services/appConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/appConfig')>()),
  loadAppConfig: vi.fn(async () => ({})),
}))
vi.mock('../services/showupSessionService', () => ({
  getShowupState: vi.fn(async () => ({ ok: true, value: { today: '2026-10-26', showed_up_today: false, session: null } })),
  startShowup: vi.fn(),
  checkShowup: vi.fn(),
  cancelShowup: vi.fn(),
}))
vi.mock('../services/wakeLock', () => ({ acquireWakeLock: vi.fn(), releaseWakeLock: vi.fn(), reacquireWakeLockIfWanted: vi.fn() }))

const db = vi.hoisted(() => ({ fetchActiveGym: vi.fn(), saveActiveGym: vi.fn() }))
vi.mock('../services/gymService', () => ({ fetchActiveGym: db.fetchActiveGym, saveActiveGym: db.saveActiveGym }))

const device = vi.hoisted(() => ({ getNearMePosition: vi.fn() }))
vi.mock('../services/devicePosition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/devicePosition')>()),
  getNearMePosition: device.getNearMePosition,
}))

const maps = vi.hoisted(() => ({ searchPlaces: vi.fn(), searchNearbyGyms: vi.fn(), getPlaceDetails: vi.fn(), createSearchSession: vi.fn() }))
vi.mock('../services/mapsService', () => ({ isMapsConfigured: () => true, ...maps }))

const { App } = await import('./App')
const { resetNearMeCache } = await import('../hooks/useNearMeSearch')
const { GYM_SAVED_PAUSE_MS } = await import('../features/gym/GymSetupScreen')

const savedGym: Gym = { ...testGym, id: 'gym-1', userId: 'user-1', name: 'Iron Gym' }
const newGym: Gym = { ...savedGym, id: 'gym-2', name: 'Pulse Fitness' }
const HERE = { lat: 12.9716, lng: 77.5946, accuracy: 30 }

const NEARBY = [
  { placeId: 'n1', primaryText: 'Iron Gym', secondaryText: '1 Main Road', distanceMeters: 640, nearby: { place: { googlePlaceId: 'n1', name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 1, longitude: 1 }, types: ['gym'] } },
]
const TYPED = [
  { placeId: 't1', primaryText: 'Ironworks Fitness', secondaryText: 'Linking Road', prediction: {} },
  { placeId: 't2', primaryText: 'Pulse Fitness', secondaryText: 'Juhu Tara Road', prediction: {} },
]

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

const title = () => screen.findByRole('heading', { name: 'Where do you work out?' })
const box = () => screen.getByRole('searchbox', { name: /search gyms/i }) as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: 'Save gym' }) as HTMLButtonElement
const toggle = () => screen.getByRole('switch', { name: 'Gyms near me' }) as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetNearMeCache()
  db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: null })
  db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
  device.getNearMePosition.mockResolvedValue(HERE)
  maps.createSearchSession.mockResolvedValue({})
  maps.searchPlaces.mockResolvedValue(TYPED)
  maps.searchNearbyGyms.mockResolvedValue(NEARBY)
  maps.getPlaceDetails.mockImplementation(async (s: { placeId: string; primaryText: string; secondaryText: string; nearby?: { place: unknown; types: string[] } }) =>
    s.nearby ?? { place: { googlePlaceId: s.placeId, name: s.primaryText, formattedAddress: s.secondaryText, latitude: 1, longitude: 2 }, types: ['gym'] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('leaving the screen while a save is on its way (was: stranded on a gym screen with no way out)', () => {
  async function openChangeGym(user: ReturnType<typeof userEvent.setup>) {
    db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
    renderApp()
    await user.click(await screen.findByRole('button', { name: /^profile$/i }))
    await user.click(await screen.findByRole('button', { name: /edit details/i }))
    await user.click(await screen.findByRole('button', { name: /change gym/i }))
    await title()
  }
  async function chooseGym(user: ReturnType<typeof userEvent.setup>) {
    await user.type(box(), 'pulse')
    await user.click(await screen.findByRole('radio', { name: /pulse fitness/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveButton().disabled).toBe(false))
  }

  it('Back cannot be pressed while the gym is being saved', async () => {
    let finish!: (value: unknown) => void
    db.saveActiveGym.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    await openChangeGym(user)
    await chooseGym(user)
    await user.click(saveButton())

    expect((await screen.findByRole('button', { name: 'Saving…' })) as HTMLButtonElement).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finish({ status: 'ok', gym: newGym }))
  })

  it('Back cannot be pressed during the pause after saving either', async () => {
    db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: newGym })
    const user = userEvent.setup()
    await openChangeGym(user)
    await chooseGym(user)
    await user.click(saveButton())
    await screen.findByText('Pulse Fitness saved')
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('the app moves on by itself even when the timer of the gym screen is lost (the hold-back is never left on)', async () => {
    // Losing the screen's timer is what happens when the screen is unmounted during the pause, for instance when the
    // profile reloads. Here the timer function is dropped directly, so only the app's own safety net can end the hold.
    const realSetTimeout = window.setTimeout
    const lost: number[] = []
    vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
      // The screen's pause is the only timer set for exactly GYM_SAVED_PAUSE_MS; swallow that one.
      if (ms === GYM_SAVED_PAUSE_MS) {
        lost.push(1)
        return 0
      }
      return realSetTimeout(fn as () => void, ms, ...(rest as []))
    }) as typeof window.setTimeout)

    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveButton().disabled).toBe(false))
    await user.click(saveButton())

    await screen.findByText('Ironworks Fitness saved')
    expect(lost.length).toBeGreaterThan(0) // the screen's own timer really was lost
    // Only the app's safety net is left to end the hold; it does so within its limit.
    expect(await screen.findByRole('button', { name: /^show up$/i }, { timeout: 5000 })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()
  })
})

describe('"<name> saved" lasts long enough to read (was: gone after about half a second)', () => {
  it('is still on screen after the gym screen has gone, because the app owns it', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveButton().disabled).toBe(false))
    await user.click(saveButton())

    expect(await screen.findByRole('button', { name: /^show up$/i }, { timeout: 4000 })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()
    expect(screen.getByText('Ironworks Fitness saved')).toBeTruthy()
  })
})

describe('the clear ✕ while a place is loading (was: a gym nobody could see could be saved)', () => {
  it('the ✕ is off while the details load', async () => {
    maps.getPlaceDetails.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await screen.findByText('Loading place details…')
    expect((screen.getByRole('button', { name: 'Clear search' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('details that arrive after the text was changed are ignored, so Save gym stays off', async () => {
    let finish!: (value: unknown) => void
    maps.getPlaceDetails.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await screen.findByText('Loading place details…')

    // The text is changed while the details are on their way (the input is off for a person, so change it directly).
    await act(async () => {
      fireEvent.change(box(), { target: { value: 'something else' } })
    })
    await act(async () => finish({ place: { googlePlaceId: 't1', name: 'Ironworks Fitness', formattedAddress: 'Linking Road', latitude: 1, longitude: 2 }, types: ['gym'] }))

    expect(saveButton().disabled).toBe(true)
  })
})

describe('a typed search that is answered from memory (was: "Finding gyms…" stuck on for ever)', () => {
  async function nearMeOn(user: ReturnType<typeof userEvent.setup>) {
    await title()
    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
  }

  it('shows the remembered rows instead of staying on the loader', async () => {
    const user = userEvent.setup()
    renderApp()
    await nearMeOn(user)
    // First search of "gym" is answered by Google and remembered.
    await user.type(box(), 'gym')
    await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 })
    expect(maps.searchPlaces).toHaveBeenCalledTimes(1)

    // A slower search for "gymx" is on its way when the person backspaces to "gym".
    let release!: (value: unknown) => void
    maps.searchPlaces.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    await user.type(box(), 'x')
    await new Promise((resolve) => setTimeout(resolve, 500))
    await user.type(box(), '{Backspace}')

    expect(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByText('Finding gyms…')).toBeNull()
    expect(maps.searchPlaces).toHaveBeenCalledTimes(2) // "gym" and "gymx"; the second "gym" came from memory
    await act(async () => release(TYPED))
  })
})

describe('the list changing under a choice (was: a gym that is not on screen could still be saved)', () => {
  it('turning "Gyms near me" off drops the choice, so Save gym goes off', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
    await user.click(await screen.findByRole('radio', { name: /iron gym/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveButton().disabled).toBe(false))

    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(false))
    expect(saveButton().disabled).toBe(true)
  })

  it('turning it on drops a typed choice too', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveButton().disabled).toBe(false))

    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
    expect(saveButton().disabled).toBe(true)
  })
})

describe('a failed "Gyms near me" list (was: no Retry)', () => {
  it('has a Retry button that asks again and shows the gyms', async () => {
    maps.searchNearbyGyms.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(true))

    expect(await screen.findByText('Couldn’t load gyms', {}, { timeout: 3000 })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('radio', { name: /iron gym/i }, { timeout: 3000 })).toBeTruthy()
    expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Couldn’t load gyms')).toBeNull()
  })
})

describe('the wait before a search starts (was: "No gyms found" flashed for a third of a second)', () => {
  it('shows "Finding gyms…" the moment the third character is typed, never "No gyms found"', async () => {
    maps.searchPlaces.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'gym')
    // Straight away, before the pause is over and before Google has been asked.
    expect(screen.queryByText(/No gyms found/)).toBeNull()
    expect(screen.getByText('Finding gyms…')).toBeTruthy()
    expect(maps.searchPlaces).not.toHaveBeenCalled()
  })

  it('the old text\'s rows do not stay selectable under new text', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 })
    maps.searchPlaces.mockReturnValue(new Promise(() => {}))
    await user.type(box(), 's')
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('an earlier failure does not show on a fresh search', async () => {
    maps.searchPlaces.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await screen.findByText('Couldn’t load gyms', {}, { timeout: 3000 })
    maps.searchPlaces.mockReturnValue(new Promise(() => {}))
    await user.type(box(), 's')
    expect(screen.queryByText('Couldn’t load gyms')).toBeNull()
  })
})

describe('suggestions that outlive their billing session (was: a pick from old results ran outside any session)', () => {
  it('after a place is picked, the same words are asked of Google again instead of being served from memory', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
    await user.type(box(), 'gym')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveButton().disabled).toBe(false))
    expect(maps.searchPlaces).toHaveBeenCalledTimes(1)

    await user.clear(box())
    await user.type(box(), 'gym')
    await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 })
    expect(maps.searchPlaces).toHaveBeenCalledTimes(2)
  })
})

describe('the layout (was: Save gym pushed off the screen by a long list)', () => {
  function rule(node: HTMLElement) {
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    return Array.from(node.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
  }

  it('the page is exactly one screen tall, so only the results scroll', async () => {
    renderApp()
    await title()
    const page = screen.getByRole('main')
    // Anchored: "min-height:100dvh" contains "height:100dvh", and a page that only has a MINIMUM height grows with its list.
    expect(rule(page)).toMatch(/(^|[;{ ])height:100dvh/)
    expect(rule(page)).not.toContain('min-height:100dvh')
    expect(rule(page)).toContain('overflow:hidden')
  })

  it('the results area is the part that scrolls', async () => {
    renderApp()
    await title()
    const scroller = (await screen.findByText(/Type at least 3 characters/)).parentElement as HTMLElement
    expect(rule(scroller)).toContain('overflow-y:auto')
    expect(rule(scroller)).toContain('min-height:0')
  })
})

describe('the small design differences', () => {
  it('the progress track is the surface colour of the design, not the border colour', async () => {
    renderApp()
    await title()
    const track = screen.getByTestId('step-progress').parentElement as HTMLElement
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(track.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ').toLowerCase()
    expect(rule).toContain('background-color:#172033')
  })

  it('the title has the design\'s 8px under it', async () => {
    renderApp()
    const heading = await title()
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(heading.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toMatch(/margin:0 0 8px/)
  })
})
