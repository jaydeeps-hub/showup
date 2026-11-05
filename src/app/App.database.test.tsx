// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testGym } from '../test/fixtures'
import type { CheckShowupResult, Gym, Profile, SelectedPlace, ShowupSession } from '../types'
import { theme } from './theme'

/**
 * Journey tests for the gym and the timed Show Up. The REAL useShowup hook, the REAL Show Up engine,
 * provider and screens are used. Only the outside world is faked: the Supabase session, the profile,
 * the gym and Show Up database calls, the device location and Google Maps.
 */

// --- Fakes -------------------------------------------------------------------------------

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-in',
    session: { user: { id: 'user-1', email: 'asha@example.com', user_metadata: {} } } as unknown as Session,
  }),
}))
vi.mock('../services/authService', () => ({
  getIdentity: () => ({ id: 'user-1', username: 'Asha' }),
  signOut: vi.fn(),
}))

const profile: Profile = {
  id: 'user-1',
  firstName: 'Asha',
  lastName: 'Rao',
  dateOfBirth: null,
  isAdmin: false,
  placeSearchMode: 'fitness_only',
  quickstartCompletedAt: '2026-10-19T10:00:00Z', // these tests predate the Quick Start: treat the person as done
  username: null,
  usernameChangedAt: null,
  createdAt: '2026-10-19T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
}
vi.mock('../services/profileService', () => ({
  fetchProfile: vi.fn(async () => ({ status: 'found', profile })),
  updateProfile: vi.fn(),
  updatePlaceSearchMode: vi.fn(),
}))

// The numbers and calendar on Home, the goal and the device time zone: not under test here.
vi.mock('../services/homeSummaryService', () => ({
  fetchHomeSummary: vi.fn(async () => ({
    status: 'ok',
    summary: { weeksInARow: 2, bestWeeksInARow: 2, goalDays: 3, showupDaysThisWeek: 1, passesLeft: 3, totalShowups: 8 },
  })),
  fetchPauseState: vi.fn(async () => ({ status: 'ok', pause: { activePauses: [] } })),
}))
vi.mock('../services/calendarService', () => ({
  fetchCalendar: vi.fn(async () => ({
    status: 'ok',
    calendar: {
      month: '2026-10-01',
      earliestMonth: '2026-10-01',
      latestMonth: '2026-10-01',
      gridFrom: '2026-09-28',
      gridTo: '2026-11-01',
      showupDates: [],
      weeks: [],
    },
  })),
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

// A fake database for the gym.
const db = vi.hoisted(() => ({ fetchActiveGym: vi.fn(), saveActiveGym: vi.fn() }))
vi.mock('../services/gymService', () => ({
  fetchActiveGym: db.fetchActiveGym,
  saveActiveGym: db.saveActiveGym,
}))

// A fake timed Show Up backend and device location. Tests choose what the "server" answers and where the user "is".
const show = vi.hoisted(() => ({
  getShowupState: vi.fn(),
  startShowup: vi.fn(),
  checkShowup: vi.fn(),
  cancelShowup: vi.fn(),
}))
vi.mock('../services/showupSessionService', () => show)
const device = vi.hoisted(() => ({ getPosition: vi.fn() }))
vi.mock('../services/devicePosition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/devicePosition')>()),
  getPosition: device.getPosition,
}))
vi.mock('../services/wakeLock', () => ({
  acquireWakeLock: vi.fn(),
  releaseWakeLock: vi.fn(),
  reacquireWakeLockIfWanted: vi.fn(),
}))

// Google Maps: one search result, which is a gym.
vi.mock('../services/mapsService', () => ({
  isMapsConfigured: () => true,
  createSearchSession: vi.fn().mockResolvedValue({}),
  searchPlaces: vi.fn().mockResolvedValue([
    { placeId: 'place-gym', primaryText: 'Iron Gym', secondaryText: '1 Main Road', prediction: {} },
  ]),
  getPlaceDetails: vi.fn(async () => ({
    place: { googlePlaceId: 'place-gym', name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 12.9716, longitude: 77.5946 },
    types: ['gym'],
  })),
}))

// The squad, for the tab's badge (the bar refreshes it when the app opens). Empty unless a test says otherwise.
const squadApi = vi.hoisted(() => ({ getSquad: vi.fn(), searchPeople: vi.fn(), sendSquadRequest: vi.fn(), respondSquadRequest: vi.fn(), cancelSquadRequest: vi.fn(), removeFromSquad: vi.fn() }))
vi.mock('../services/squadService', () => squadApi)

// Home, counted: the real Home screen, wrapped so a test can tell how often it renders.
const homeRenders = vi.hoisted(() => ({ count: 0 }))
vi.mock('../features/attendance/HomeScreen', async (importOriginal) => {
  const real = await importOriginal<typeof import('../features/attendance/HomeScreen')>()
  return {
    ...real,
    HomeScreen: (props: Parameters<typeof real.HomeScreen>[0]) => {
      homeRenders.count += 1
      return real.HomeScreen(props)
    },
  }
})

const { App } = await import('./App')
const { squadBadgeStore, resetSquadBadgeStore } = await import('../services/squadBadgeStore')

// --- Helpers -----------------------------------------------------------------------------

const savedGym: Gym = { ...testGym, id: 'gym-db-1', userId: 'user-1', name: 'Iron Gym' }
const NEAR = { lat: 12.9716, lng: 77.5946, accuracy: 8 }

const ok = <T,>(value: T) => ({ ok: true as const, value })
const fail = (error: string) => ({ ok: false as const, error })

/** A running session that started `elapsed` seconds ago, 20 s long with checks every 10 s. */
function runningSession(elapsed = 0, overrides: Partial<ShowupSession> = {}): ShowupSession {
  const now = Date.now()
  return {
    session_id: 'session-1',
    status: 'running',
    started_at: new Date(now - elapsed * 1000).toISOString(),
    server_now: new Date(now).toISOString(),
    elapsed_seconds: elapsed,
    duration_seconds: 20,
    interval_seconds: 10,
    max_missed_checks: 0,
    checkpoints: [
      { at_seconds: 10, needs_location: true, done: false },
      { at_seconds: 20, needs_location: true, done: false },
    ],
    location_checks_done: 1,
    location_checks_total: 3,
    ...overrides,
  }
}

function answer(result: CheckShowupResult['result'], extra: Partial<CheckShowupResult> = {}, session = runningSession()): CheckShowupResult {
  return { result, session, ...extra }
}

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

/** Searches for the gym and picks the result. */
async function chooseGym(user: ReturnType<typeof userEvent.setup>) {
  const box = await screen.findByRole('searchbox', { name: /search gyms/i })
  await user.click(box)
  await user.type(box, 'iron')
  await user.click(await screen.findByRole('radio', { name: /iron gym/i }))
}

const showUpButton = () => screen.findByRole('button', { name: /^show up$/i })

beforeEach(() => {
  vi.clearAllMocks()
  db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
  db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
  show.getShowupState.mockResolvedValue(ok({ today: '2026-10-26', showed_up_today: false, session: null }))
  show.startShowup.mockResolvedValue(ok({ already_done: false, session: runningSession() }))
  show.checkShowup.mockResolvedValue(ok(answer('running', { check_passed: true })))
  show.cancelShowup.mockResolvedValue(ok(true))
  device.getPosition.mockResolvedValue(NEAR)
  resetSquadBadgeStore()
  homeRenders.count = 0
  squadApi.getSquad.mockResolvedValue({ status: 'ok', squad: { squadCount: 0, maxSize: 50, incomingCount: 0, squad: [], incoming: [], outgoing: [] } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// --- Loading from the database -----------------------------------------------------------

describe('loading the gym from Supabase', () => {
  it('shows the saved gym', async () => {
    renderApp()

    expect(await showUpButton()).toBeTruthy()
    expect(screen.getByText('Iron Gym')).toBeTruthy()
    expect(db.fetchActiveGym).toHaveBeenCalledTimes(1)
  })

  it('asks the user to choose a gym when the database has none', async () => {
    db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: null })
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Where do you work out?' })).toBeTruthy()
  })

  it('shows a loading screen, not "choose a gym", while the database is being read', async () => {
    db.fetchActiveGym.mockReturnValue(new Promise(() => {}))
    renderApp()

    await screen.findByRole('status')
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()
  })

  it('does not let a user overwrite their gym when it could not be loaded; offers a retry instead', async () => {
    db.fetchActiveGym.mockResolvedValueOnce({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByRole('heading', { name: "We couldn't load your gym" })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await showUpButton()).toBeTruthy()
  })

  it('does not keep the gym in the browser\'s localStorage any more', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    renderApp()
    await showUpButton()
    // The only things the app keeps in the browser are cached content and the "Quick Start finished, not yet
    // recorded" reminder. None of them is the gym.
    const kept = /^showup:(cms-content|mascot-content|quickstart-done-pending:)/
    expect(getItem.mock.calls.map(([key]) => String(key)).filter((key) => key.startsWith('showup:') && !kept.test(key))).toEqual([])
  })
})

// --- Saving a gym ------------------------------------------------------------------------

describe('saving a gym', () => {
  const chosenPlace: SelectedPlace = {
    googlePlaceId: 'place-gym',
    name: 'Iron Gym',
    formattedAddress: '1 Main Road',
    latitude: 12.9716,
    longitude: 77.5946,
  }

  beforeEach(() => {
    db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: null })
  })

  it('writes the gym to the database and then moves on to the weekly goal', async () => {
    const user = userEvent.setup()
    renderApp()
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /^save gym$/i }))

    expect(await screen.findByRole('heading', { name: 'How often will you show up?' }, { timeout: 4000 })).toBeTruthy()
    expect(db.saveActiveGym).toHaveBeenCalledTimes(1)
    expect(db.saveActiveGym).toHaveBeenCalledWith(chosenPlace)
  })

  it('stays on the gym screen with an error, keeping the choice, when the database refuses', async () => {
    db.saveActiveGym.mockResolvedValueOnce({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
    const user = userEvent.setup()
    renderApp()
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /^save gym$/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Where do you work out?' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^show up$/i })).toBeNull() // not claimed as saved
    expect(screen.getByRole('radio', { name: /iron gym/i }).getAttribute('aria-checked')).toBe('true') // the choice is kept
  })

  it('can be retried after a failure', async () => {
    db.saveActiveGym.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong while talking to the server. Please try again.' })
    const user = userEvent.setup()
    renderApp()
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /^save gym$/i }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'How often will you show up?' }, { timeout: 4000 })).toBeTruthy()
    expect(db.saveActiveGym).toHaveBeenCalledTimes(2)
  })
})

describe('changing gym', () => {
  const newGym: Gym = { ...savedGym, id: 'gym-db-2', name: 'Second Gym' }

  /** Profile tab, then the pencil (edit), then the "Change gym" row. */
  async function openChangeGym(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /^profile$/i }))
    await user.click(await screen.findByRole('button', { name: /edit details/i }))
    await user.click(await screen.findByRole('button', { name: /change gym/i }))
  }

  it('saves the new gym to the database and shows it', async () => {
    db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: newGym })
    const user = userEvent.setup()
    renderApp()
    await openChangeGym(user)
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /^save gym$/i }))

    expect(await screen.findByText('Second Gym')).toBeTruthy()
    expect(db.saveActiveGym).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the old gym when the new one could not be saved', async () => {
    db.saveActiveGym.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong while talking to the server. Please try again.' })
    const user = userEvent.setup()
    renderApp()
    await openChangeGym(user)
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /^save gym$/i }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByRole('button', { name: /^profile$/i })).toBeTruthy()
    expect(screen.getByText('Iron Gym')).toBeTruthy() // the original gym is still the active one
  })
})

// --- Showing up (the timed flow) ---------------------------------------------------------

describe('showing up', () => {
  it('on load, resumes a timer that is already running', async () => {
    show.getShowupState.mockResolvedValue(ok({ today: '2026-10-26', showed_up_today: false, session: runningSession(4) }))
    renderApp()

    expect(await screen.findByText('Keep this screen open until the timer ends.')).toBeTruthy()
    expect(screen.getByText(/checked 1 of 3 times/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
  })

  it('on load, shows "You showed up" when today already has a Showup', async () => {
    show.getShowupState.mockResolvedValue(ok({ today: '2026-10-26', showed_up_today: true, session: null }))
    renderApp()

    expect(await screen.findByText('You showed up')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^show up$/i })).toBeNull()
  })

  it('shows the idle hint before the first tap', async () => {
    renderApp()
    await showUpButton()
    expect(screen.getByText("Tap when you're at your gym")).toBeTruthy()
  })

  it('starts a timer from the position and the gym, and shows the countdown and a Stop link', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText(/checked 1 of 3 times/i)).toBeTruthy()
    expect(show.startShowup).toHaveBeenCalledWith('gym-db-1', NEAR)
    expect(screen.getByText('Keep this screen open until the timer ends.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    // The old one-tap path is gone: nothing else was called to record a visit.
    expect(show.checkShowup).not.toHaveBeenCalled()
  })

  it('shows "Checking your location" and a disabled button while the position is being read', async () => {
    device.getPosition.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    const busy = await screen.findByRole('button', { name: 'Checking your location' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Checking your location')).toBeTruthy()
  })

  it('starts only one timer even if the button is pressed several times quickly', async () => {
    let finish!: (value: typeof NEAR) => void
    device.getPosition.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderApp()
    const button = await showUpButton()

    await user.click(button)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await act(async () => finish(NEAR))

    await screen.findByText(/checked 1 of 3 times/i)
    expect(device.getPosition).toHaveBeenCalledTimes(1)
    expect(show.startShowup).toHaveBeenCalledTimes(1)
  })

  it('stops the timer with the Stop link and says so', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())
    await user.click(await screen.findByRole('button', { name: 'Stop' }))

    expect(await screen.findByText('Timer stopped. Tap Show up to start again.')).toBeTruthy()
    expect(show.cancelShowup).toHaveBeenCalledWith('session-1')
    expect(await showUpButton()).toBeTruthy() // ready to start again
  })

  it.each([
    ['too_far', "You're not at your saved gym. Please go to Gym 1 and try again."],
    ['poor_accuracy', 'Your location signal is weak. Try near a window or outside.'],
    ['network', 'Something went wrong. Try again.'],
  ])('tells the user when starting fails with "%s", and writes nothing', async (code, message) => {
    show.startShowup.mockResolvedValue(fail(code))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText(message)).toBeTruthy()
    expect(await showUpButton()).toBeTruthy()
    expect(show.checkShowup).not.toHaveBeenCalled()
  })

  it('tells the user when location permission is denied', async () => {
    device.getPosition.mockRejectedValue('location_denied')
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText('Location is off for Showup. Allow it in your browser settings, then try again.')).toBeTruthy()
    expect(show.startShowup).not.toHaveBeenCalled()
  })

  it('tells the user when the location cannot be found', async () => {
    device.getPosition.mockRejectedValue('location_timeout')
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText("Couldn't get your location. Try again.")).toBeTruthy()
  })

  it('says so, and shows the green state, when today was already counted', async () => {
    show.startShowup.mockResolvedValue(ok({ already_done: true, session: null }))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText('You already showed up today.')).toBeTruthy()
    expect(screen.getByText('You showed up')).toBeTruthy()
  })

  it('keeps the timer running when the user switches tabs, and the tabs are free while it runs', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())
    await screen.findByText(/checked 1 of 3 times/i)

    const pause = screen.getByRole('button', { name: /^pause$/i })
    expect((pause as HTMLButtonElement).disabled).toBe(false)
    await user.click(pause)
    await user.click(await screen.findByRole('button', { name: /^home$/i }))

    expect(await screen.findByText(/checked 1 of 3 times/i)).toBeTruthy()
    expect(show.startShowup).toHaveBeenCalledTimes(1) // not restarted
  })
})

describe('the tab bar (Phase 12, task 2)', () => {
  /** The tab buttons in the bar, in the order they are drawn. */
  const tabNames = () =>
    Array.from(screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('button')).map((button) => button.textContent)
  const tab = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }) as HTMLButtonElement

  it('has four tabs in the design order: Pause, Home, Squad, Profile', async () => {
    renderApp()
    await showUpButton()
    expect(tabNames()).toEqual(['Pause', 'Home', 'Squad', 'Profile'])
  })

  it('opens the Squad page, marks the tab as the current page, and goes back to Home', async () => {
    const user = userEvent.setup()
    renderApp()
    await showUpButton()
    await user.click(tab('Squad'))
    expect(await screen.findByRole('heading', { name: 'My squad' })).toBeTruthy()
    expect(tab('Squad').getAttribute('aria-current')).toBe('page')
    expect(tab('Home').getAttribute('aria-current')).toBeNull()
    await user.click(tab('Home'))
    expect(await showUpButton()).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'My squad' })).toBeNull()
  })

  it('reaches every tab from Squad and back', async () => {
    const user = userEvent.setup()
    renderApp()
    await showUpButton()
    await user.click(tab('Squad'))
    await screen.findByRole('heading', { name: 'My squad' })
    await user.click(tab('Pause'))
    expect(tab('Pause').getAttribute('aria-current')).toBe('page')
    await user.click(tab('Squad'))
    expect(await screen.findByRole('heading', { name: 'My squad' })).toBeTruthy()
    await user.click(tab('Profile'))
    expect(tab('Profile').getAttribute('aria-current')).toBe('page')
  })

  it('locks Squad with Pause and Profile while Show Up reads the location, and frees them again', async () => {
    let finish!: (position: typeof NEAR) => void
    device.getPosition.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    // Still reading the location: the three other tabs cannot be pressed; Home (where the reading shows) can.
    await vi.waitFor(() => expect(tab('Squad').disabled).toBe(true))
    expect(tab('Pause').disabled).toBe(true)
    expect(tab('Profile').disabled).toBe(true)
    expect(tab('Home').disabled).toBe(false)

    await act(async () => finish(NEAR))
    await screen.findByText(/checked 1 of 3 times/i)
    // The timer is running now: every tab is free again (the timer keeps going on any tab).
    expect(tab('Squad').disabled).toBe(false)
    expect(tab('Pause').disabled).toBe(false)
    expect(tab('Profile').disabled).toBe(false)
  })
})

describe('the Squad tab badge (Phase 12, task 5)', () => {
  const squadTab = () => screen.getByRole('button', { name: /^squad/i }) as HTMLButtonElement
  const badge = () => screen.queryByTestId('squad-badge')
  const withIncoming = (count: number) => ({
    status: 'ok' as const,
    squad: { squadCount: 0, maxSize: 50, incomingCount: count, squad: [], incoming: [], outgoing: [] },
  })

  it('is hidden at 0, and the tab is just "Squad"', async () => {
    renderApp()
    await showUpButton()
    await vi.waitFor(() => expect(squadApi.getSquad).toHaveBeenCalled())
    expect(badge()).toBeNull()
    expect(squadTab().getAttribute('aria-label')).toBeNull()
    expect(squadTab().textContent).toBe('Squad')
  })

  it.each([
    [1, '1', 'Squad, 1 request'],
    [2, '2', 'Squad, 2 requests'],
    [9, '9', 'Squad, 9 requests'],
    [10, '9+', 'Squad, 10 requests'],
    [42, '9+', 'Squad, 42 requests'],
  ])('%i requests shows "%s", and the tab is called "%s"', async (count, text, label) => {
    squadApi.getSquad.mockResolvedValue(withIncoming(count))
    renderApp()
    await showUpButton()
    await vi.waitFor(() => expect(badge()?.textContent).toBe(text))
    expect(squadTab().getAttribute('aria-label')).toBe(label)
    expect(badge()!.getAttribute('aria-hidden')).toBe('true') // the number is read as part of the label instead
  })

  it('is refreshed when the app opens', async () => {
    squadApi.getSquad.mockResolvedValue(withIncoming(2))
    renderApp()
    await showUpButton()
    await vi.waitFor(() => expect(badge()?.textContent).toBe('2'))
    expect(squadApi.getSquad).toHaveBeenCalledTimes(1)
  })

  it('is refreshed when the page becomes visible again', async () => {
    renderApp()
    await showUpButton()
    await vi.waitFor(() => expect(squadApi.getSquad).toHaveBeenCalledTimes(1))
    squadApi.getSquad.mockResolvedValue(withIncoming(3))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await vi.waitFor(() => expect(badge()?.textContent).toBe('3'))
  })

  it('keeps the last good count when a refresh fails', async () => {
    squadApi.getSquad.mockResolvedValueOnce(withIncoming(2))
    renderApp()
    await showUpButton()
    await vi.waitFor(() => expect(badge()?.textContent).toBe('2'))
    squadApi.getSquad.mockResolvedValue({ status: 'error', message: 'x', code: null })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {})
    expect(badge()?.textContent).toBe('2')
  })

  it('a new count does NOT re-render Home, even while a Show Up timer runs', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())
    await screen.findByText(/checked 1 of 3 times/i)
    await act(async () => {}) // let everything settle
    const before = homeRenders.count

    await act(async () => squadBadgeStore.set(4))
    expect(badge()?.textContent).toBe('4') // the bar did update
    await act(async () => squadBadgeStore.set(7))
    expect(badge()?.textContent).toBe('7')
    expect(homeRenders.count).toBe(before) // Home did not render again
  })
})

describe('a timer that runs to the end', () => {
  /** Starts a timer on fake time, so the checks can be reached without waiting. */
  async function startOnFakeTime() {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    renderApp()
    await user.click(await showUpButton())
    await screen.findByText(/checked 1 of 3 times/i)
    return user
  }

  it('counts the visit and says "You showed up. Showup #N" with the new total', async () => {
    show.checkShowup.mockResolvedValue(ok(answer('completed', { recorded: true })))
    await startOnFakeTime()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500)
    })

    expect(await screen.findByText('You showed up. Showup #8')).toBeTruthy()
    expect(screen.getByText('You showed up')).toBeTruthy() // the green state
  })

  it('says "Already counted today" when the server did not add a new Showup', async () => {
    show.checkShowup.mockResolvedValue(ok(answer('completed', { recorded: false })))
    await startOnFakeTime()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500)
    })

    expect(await screen.findByText('Already counted today')).toBeTruthy()
  })

  it.each([
    ['left_early', "You left before the timer finished. It's been reset."],
    ['missed_checks', "We couldn't confirm you stayed. Keep Showup open with the screen on until the timer ends."],
    ['expired', 'That timer expired. Tap Show up to start again.'],
  ] as const)('on "%s" it tells the user and lets them start again', async (result, message) => {
    show.checkShowup.mockResolvedValue(ok(answer(result)))
    await startOnFakeTime()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500)
    })

    expect(await screen.findByText(message)).toBeTruthy()
    expect(await showUpButton()).toBeTruthy()
  })
})
