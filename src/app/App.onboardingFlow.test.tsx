// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testGym } from '../test/fixtures'
import type { Gym, GoalState, Profile, ProfileEdits } from '../types'
import { theme } from './theme'

/**
 * The whole of onboarding, through the REAL App: step 1 details, step 2 add gym, step 3 weekly goal, and Back between
 * them. Faked: the session, the profile and gym and goal database calls, Google, and the device.
 *
 * The two things the owner asked for: the weekly goal screen is part of the flow, and the Back arrow is on Add gym and
 * Set goal but NOT on "What should we call you?".
 */

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-in',
    session: { user: { id: 'user-1', email: 'asha@example.com', user_metadata: {} } } as unknown as Session,
  }),
}))
const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../services/authService', () => ({ getIdentity: () => ({ id: 'user-1', username: 'Asha' }), signOut: auth.signOut }))

const people = vi.hoisted(() => ({ fetchProfile: vi.fn(), updateProfile: vi.fn() }))
vi.mock('../services/profileService', () => ({
  fetchProfile: people.fetchProfile,
  updateProfile: people.updateProfile,
  updatePlaceSearchMode: vi.fn(),
}))
vi.mock('../services/homeSummaryService', () => ({
  fetchHomeSummary: vi.fn(async () => ({ status: 'ok', summary: { weeksInARow: 0, bestWeeksInARow: 0, goalDays: null, showupDaysThisWeek: 0, passesLeft: 3, totalShowups: 0 } })),
  fetchPauseState: vi.fn(async () => ({ status: 'ok', pause: { activePauses: [] } })),
}))
vi.mock('../services/calendarService', () => ({
  fetchCalendar: vi.fn(async () => ({ status: 'ok', calendar: { month: '2026-10-01', earliestMonth: '2026-10-01', latestMonth: '2026-10-01', gridFrom: '2026-09-28', gridTo: '2026-11-01', showupDates: [], weeks: [] } })),
}))
const goalApi = vi.hoisted(() => ({ fetchGoalState: vi.fn(), setWeeklyGoal: vi.fn() }))
vi.mock('../services/goalService', () => goalApi)
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
vi.mock('../hooks/useMascot', () => ({ useMascotContent: () => ({ version: 0, images: {}, messages: [] }) }))

const gymApi = vi.hoisted(() => ({ fetchActiveGym: vi.fn(), saveActiveGym: vi.fn() }))
vi.mock('../services/gymService', () => ({ fetchActiveGym: gymApi.fetchActiveGym, saveActiveGym: gymApi.saveActiveGym }))

const maps = vi.hoisted(() => ({ searchPlaces: vi.fn(), searchNearbyGyms: vi.fn(), getPlaceDetails: vi.fn(), createSearchSession: vi.fn() }))
vi.mock('../services/mapsService', () => ({ isMapsConfigured: () => true, ...maps }))

const { App } = await import('./App')
const { resetNearMeCache } = await import('../hooks/useNearMeSearch')
const { GOAL_SAVED_PAUSE_MS } = await import('../features/goal/GoalScreen')

const iron: Gym = { ...testGym, id: 'gym-1', userId: 'user-1', name: 'Ironworks Fitness' }
const noGoal: GoalState = { hasGoal: false, currentGoal: null, pendingGoal: null, pendingFrom: null }

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    isAdmin: false,
    placeSearchMode: 'fitness_only',
    quickstartCompletedAt: '2026-10-19T10:00:00Z',
    createdAt: '2026-10-19T10:00:00Z',
    updatedAt: '2026-10-19T10:00:00Z',
    ...overrides,
  }
}

/** A tiny fake database that remembers what was saved, so a reload (a remount) sees it. */
let storedProfile: Profile
let storedGym: Gym | null
let storedGoal: GoalState
function setUpDatabase(start: { profile?: Profile; gym?: Gym | null; goal?: GoalState } = {}) {
  storedProfile = start.profile ?? profile()
  storedGym = start.gym ?? null
  storedGoal = start.goal ?? noGoal
  people.fetchProfile.mockImplementation(async () => ({ status: 'found', profile: storedProfile }))
  people.updateProfile.mockImplementation(async (_id: string, edits: ProfileEdits) => {
    storedProfile = { ...storedProfile, ...edits }
    return { status: 'saved', profile: storedProfile }
  })
  gymApi.fetchActiveGym.mockImplementation(async () => ({ status: 'ok', gym: storedGym }))
  gymApi.saveActiveGym.mockImplementation(async () => {
    storedGym = iron
    return { status: 'ok', gym: iron }
  })
  goalApi.fetchGoalState.mockImplementation(async () => ({ status: 'ok', goal: storedGoal }))
  goalApi.setWeeklyGoal.mockImplementation(async (days: number) => {
    storedGoal = { hasGoal: true, currentGoal: days, pendingGoal: null, pendingFrom: null }
    return { status: 'saved' }
  })
}

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

const detailsTitle = () => screen.findByRole('heading', { name: 'What should we call you?' })
const gymTitle = () => screen.findByRole('heading', { name: 'Where do you work out?' })
const goalTitle = () => screen.findByRole('heading', { name: 'How often will you show up?' })
const back = () => screen.queryByRole('button', { name: 'Back' })
const homeButton = () => screen.findByRole('button', { name: /^show up$/i }, { timeout: 5000 })

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await detailsTitle()
  await user.type(screen.getByLabelText('First name'), 'Asha')
  await user.type(screen.getByLabelText('Last name'), 'Rao')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}
async function pickGym(user: ReturnType<typeof userEvent.setup>) {
  await gymTitle()
  await user.type(screen.getByRole('searchbox', { name: /search gyms/i }), 'iron')
  await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
  await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Save gym' }) as HTMLButtonElement).disabled).toBe(false))
}
async function saveGym(user: ReturnType<typeof userEvent.setup>) {
  await pickGym(user)
  await user.click(screen.getByRole('button', { name: 'Save gym' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetNearMeCache()
  setUpDatabase()
  maps.createSearchSession.mockResolvedValue({})
  maps.searchNearbyGyms.mockResolvedValue([])
  maps.searchPlaces.mockResolvedValue([{ placeId: 'g1', primaryText: 'Ironworks Fitness', secondaryText: 'Linking Road', prediction: {} }])
  maps.getPlaceDetails.mockResolvedValue({ place: { googlePlaceId: 'g1', name: 'Ironworks Fitness', formattedAddress: 'Linking Road', latitude: 1, longitude: 2 }, types: ['gym'] })
  auth.signOut.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the whole flow, in order', () => {
  it('goes details, then add gym, then the weekly goal, then Home', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)

    await saveGym(user)
    expect(await goalTitle()).toBeTruthy() // bug 1: this screen used to be skipped

    await user.click(await screen.findByRole('button', { name: 'Set goal' }))
    expect(await homeButton()).toBeTruthy()
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledTimes(1)
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledWith(3)
  })

  it('shows the right step count on each screen: 1 of 3, 2 of 3, 3 of 3', async () => {
    const user = userEvent.setup()
    renderApp()
    await detailsTitle()
    expect(screen.getByText('1 of 3')).toBeTruthy()
    await fillDetails(user)
    await gymTitle()
    expect(screen.getByText('2 of 3')).toBeTruthy()
    await saveGym(user)
    await goalTitle()
    expect(screen.getByText('3 of 3')).toBeTruthy()
  })

  it('saves the names once, the gym once and the goal once', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await user.click(await screen.findByRole('button', { name: 'Set goal' }))
    await homeButton()
    expect(people.updateProfile).toHaveBeenCalledTimes(1)
    expect(gymApi.saveActiveGym).toHaveBeenCalledTimes(1)
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledTimes(1)
  })

  it('shows "<gym> saved" and "Goal set" messages that outlast their screens', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await screen.findByText('Ironworks Fitness saved')
    await goalTitle()
    await user.click(await screen.findByRole('button', { name: 'Set goal' }))
    expect(await screen.findByText(/Goal set/)).toBeTruthy()
    await homeButton()
    expect(screen.getByText(/Goal set/)).toBeTruthy()
  })

  it('has no tab bar on any of the three steps', async () => {
    const user = userEvent.setup()
    renderApp()
    await detailsTitle()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    await fillDetails(user)
    await gymTitle()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    await saveGym(user)
    await goalTitle()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })
})

describe('the Back arrow (bug 2): on Add gym and Set goal, not on "What should we call you?"', () => {
  it('is NOT on the details page', async () => {
    renderApp()
    await detailsTitle()
    expect(back()).toBeNull()
  })

  it('is on the Add gym page', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await gymTitle()
    expect(back()).toBeTruthy()
  })

  it('is on the Set goal page', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    expect(back()).toBeTruthy()
  })

  it('on Add gym, goes back to the details page with the saved names filled in', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await gymTitle()
    await user.click(back()!)

    await detailsTitle()
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Asha')
    expect((screen.getByLabelText('Last name') as HTMLInputElement).value).toBe('Rao')
    expect(back()).toBeNull() // and still no arrow here
  })

  it('on Set goal, goes back to Add gym', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    await user.click(back()!)

    expect(await gymTitle()).toBeTruthy()
    expect(screen.getByText('2 of 3')).toBeTruthy()
  })

  it('can go back twice, from the goal to the details, and forward again', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    await user.click(back()!)
    await gymTitle()
    await user.click(back()!)
    await detailsTitle()
    expect(screen.getByText('1 of 3')).toBeTruthy()

    // forward again: the names are saved already, so Continue is on straight away
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await gymTitle()).toBeTruthy()
  })

  it('going back to Add gym after the gym was saved shows the screen (it does not skip to Home), and a new choice can be saved', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    await user.click(back()!)

    expect(await gymTitle()).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^show up$/i })).toBeNull()
    await user.type(screen.getByRole('searchbox', { name: /search gyms/i }), 'iron')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Save gym' }) as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: 'Save gym' }))
    expect(await goalTitle()).toBeTruthy()
  })

  it('the old sign-out on the details page is gone: nothing signs the person out', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await gymTitle()
    await user.click(back()!)
    await detailsTitle()
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})

describe('Back while something is being saved', () => {
  it('on Add gym, is off while the gym is saving or just saved', async () => {
    let finish!: (value: unknown) => void
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    gymApi.saveActiveGym.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await pickGym(user)
    await user.click(screen.getByRole('button', { name: 'Save gym' }))
    await screen.findByRole('button', { name: 'Saving…' })
    expect(back()).toBeNull() // the arrow is not offered while the save is on its way
    await act(async () => finish({ status: 'ok', gym: iron }))
    await goalTitle()
  })

  it('on Set goal, is off while the goal is saved and the screen is about to move on', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    await user.click(await screen.findByRole('button', { name: 'Set goal' }))
    await screen.findByText(/Goal set/)
    expect(back()).toBeNull()
    await homeButton()
  })
})

describe('where onboarding starts after a refresh', () => {
  it('a new person starts at the details page', async () => {
    renderApp()
    expect(await detailsTitle()).toBeTruthy()
  })

  it('names saved but no gym: starts at Add gym (2 of 3), with Back to the details', async () => {
    setUpDatabase({ profile: profile({ firstName: 'Asha', lastName: 'Rao' }) })
    const user = userEvent.setup()
    renderApp()
    expect(await gymTitle()).toBeTruthy()
    expect(screen.getByText('2 of 3')).toBeTruthy()
    await user.click(back()!)
    await detailsTitle()
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Asha')
  })

  it('names and gym saved: goes straight to Home, with no onboarding (the goal is optional and has its button there)', async () => {
    setUpDatabase({ profile: profile({ firstName: 'Asha', lastName: 'Rao' }), gym: iron })
    renderApp()
    expect(await homeButton()).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'How often will you show up?' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).toBeNull()
  })

  it('a person who finished onboarding and reloads does not see it again', async () => {
    const user = userEvent.setup()
    const first = renderApp()
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    await user.click(await screen.findByRole('button', { name: 'Set goal' }))
    await homeButton()
    first.unmount()

    renderApp()
    expect(await homeButton()).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()
  })
})

describe('the other ways to reach these screens are unchanged', () => {
  async function toHome() {
    setUpDatabase({ profile: profile({ firstName: 'Asha', lastName: 'Rao' }), gym: iron })
    renderApp()
    await homeButton()
  }

  it('Change gym from Profile still has a back arrow and no progress bar, and returns to Profile', async () => {
    const user = userEvent.setup()
    await toHome()
    await user.click(await screen.findByRole('button', { name: /^profile$/i }))
    await user.click(await screen.findByRole('button', { name: /edit details/i }))
    await user.click(await screen.findByRole('button', { name: /change gym/i }))
    await gymTitle()
    expect(back()).toBeTruthy()
    expect(screen.queryByText('2 of 3')).toBeNull()
    await user.click(back()!)
    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeTruthy()
  })

  it('the goal screen opened from Home still has Back, returns to Home, and stays after saving', async () => {
    const user = userEvent.setup()
    await toHome()
    await user.click(await screen.findByRole('button', { name: /set a weekly goal/i }))
    await goalTitle()
    expect(back()).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: 'Set goal' }))
    expect(await screen.findByText(/Goal set/)).toBeTruthy()
    // it does not move on by itself: the person is reading the message
    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
    await user.click(back()!)
    expect(await homeButton()).toBeTruthy()
  })
})

describe('the hand-off between steps cannot be left half-way', () => {
  /** Swallows the one timer set for exactly `ms`, as if the screen that set it had gone away. */
  function loseTimersOf(ms: number) {
    const real = window.setTimeout
    let lost = 0
    vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, delay?: number, ...rest: unknown[]) => {
      if (delay === ms) {
        lost += 1
        return 0
      }
      return real(fn as () => void, delay, ...(rest as []))
    }) as typeof window.setTimeout)
    return () => lost
  }

  it('if the gym screen\'s own timer is lost, the app still moves on to the weekly goal (not back to a stale gym screen)', async () => {
    const lost = loseTimersOf(700)
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await screen.findByText('Ironworks Fitness saved')
    expect(lost()).toBeGreaterThan(0)
    // Only the app's safety net can move on now, and it waits 2.2 s (the pause plus room to finish).
    expect(await screen.findByRole('heading', { name: 'How often will you show up?' }, { timeout: 5000 })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()
  })

  it('the step after a rescued gym screen is the goal screen with Back to the gym, as it would have been', async () => {
    loseTimersOf(700)
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await screen.findByRole('heading', { name: 'How often will you show up?' }, { timeout: 5000 })
    expect(screen.getByText('3 of 3')).toBeTruthy()
    expect(back()).toBeTruthy()
  })
})

describe('the pause after the goal is set', () => {
  it('the goal screen stays up for about 700 ms after saving, and then Home appears', async () => {
    const user = userEvent.setup()
    renderApp()
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    // The picker appears once the goal has loaded; wait for it BEFORE switching to fake timers.
    const setGoal = await screen.findByRole('button', { name: 'Set goal' })

    vi.useFakeTimers()
    fireEvent.click(setGoal)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50) // the save itself
    })
    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GOAL_SAVED_PAUSE_MS - 200)
    })
    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy() // still reading the message
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.queryByRole('heading', { name: 'How often will you show up?' })).toBeNull()
  })
})

describe('skipping the weekly goal', () => {
  async function toTheGoalStep(user: ReturnType<typeof userEvent.setup>) {
    await fillDetails(user)
    await saveGym(user)
    await goalTitle()
    await screen.findByRole('radiogroup', { name: 'Days per week' })
  }
  const skipButton = () => screen.getByRole('button', { name: 'Skip for now' })
  const sheet = () => screen.queryByRole('dialog', { name: 'Skip setting a goal?' })

  it('Skip for now, then "Skip for now" in the sheet, goes to Home and saves no goal', async () => {
    const user = userEvent.setup()
    renderApp()
    await toTheGoalStep(user)
    await user.click(skipButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).getByRole('button', { name: 'Skip for now' }))

    expect(await homeButton()).toBeTruthy()
    expect(goalApi.setWeeklyGoal).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'How often will you show up?' })).toBeNull()
  })

  it('shows no "Goal set" message after a skip', async () => {
    const user = userEvent.setup()
    renderApp()
    await toTheGoalStep(user)
    await user.click(skipButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).getByRole('button', { name: 'Skip for now' }))
    await homeButton()
    expect(screen.queryByText(/Goal set/)).toBeNull()
  })

  it('"Set a goal" in the sheet keeps the person on the goal step, and they can then set one', async () => {
    const user = userEvent.setup()
    renderApp()
    await toTheGoalStep(user)
    await user.click(skipButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).getByRole('button', { name: 'Set a goal' }))
    await vi.waitFor(() => expect(sheet()).toBeNull())

    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Set goal' }))
    expect(await homeButton()).toBeTruthy()
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledTimes(1)
  })

  it('after a skip, Home shows the "Set a weekly goal" card, which opens the standalone screen (a way back, no Skip, no "3 of 3")', async () => {
    const user = userEvent.setup()
    renderApp()
    await toTheGoalStep(user)
    await user.click(skipButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).getByRole('button', { name: 'Skip for now' }))
    await homeButton()

    await user.click(await screen.findByRole('button', { name: /set a weekly goal/i }))
    await goalTitle()
    await screen.findByRole('radiogroup', { name: 'Days per week' })
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
    expect(screen.queryByText('3 of 3')).toBeNull()
    expect(screen.queryByTestId('step-progress')).toBeNull()
  })

  it('a skipped person who reloads goes straight to Home: onboarding is over', async () => {
    const user = userEvent.setup()
    const first = renderApp()
    await toTheGoalStep(user)
    await user.click(skipButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).getByRole('button', { name: 'Skip for now' }))
    await homeButton()
    first.unmount()

    renderApp()
    expect(await homeButton()).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'How often will you show up?' })).toBeNull()
  })

  it('Back from the goal step still goes to Add gym, with Skip still on the goal step when they return', async () => {
    const user = userEvent.setup()
    renderApp()
    await toTheGoalStep(user)
    await user.click(back()!)
    await gymTitle()
    // The gym screen starts fresh, so a place has to be chosen again before Save gym is on.
    await saveGym(user)
    await goalTitle()
    await screen.findByRole('radiogroup', { name: 'Days per week' })
    expect(skipButton()).toBeTruthy()
  })
})
