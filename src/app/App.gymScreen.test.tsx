// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testGym } from '../test/fixtures'
import type { Gym, Profile } from '../types'
import { theme } from './theme'

/**
 * The Add gym screen (Phase 10f), through the REAL App, screen, search view and hooks. Faked: the session, the profile,
 * the gym database calls, Google (search and details), the device position and the app config.
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

const maps = vi.hoisted(() => ({ searchPlaces: vi.fn(), getPlaceDetails: vi.fn(), createSearchSession: vi.fn() }))
vi.mock('../services/mapsService', () => ({ isMapsConfigured: () => true, searchNearbyGyms: vi.fn(async () => []), ...maps }))

const { App } = await import('./App')
const { resetNearMeCache } = await import('../hooks/useNearMeSearch')
const { GYM_SAVED_PAUSE_MS } = await import('../features/gym/GymSetupScreen')

const savedGym: Gym = { ...testGym, id: 'gym-1', userId: 'user-1', name: 'Iron Gym' }
const newGym: Gym = { ...savedGym, id: 'gym-2', name: 'Pulse Fitness' }

const RESULTS = [
  { placeId: 'g1', primaryText: 'Ironworks Fitness', secondaryText: 'Linking Road, Bandra West', prediction: {} },
  { placeId: 'g2', primaryText: 'Pulse Fitness', secondaryText: 'Juhu Tara Road, Juhu', prediction: {} },
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
const saveGymButton = () => screen.getByRole('button', { name: 'Save gym' }) as HTMLButtonElement
const rows = () => screen.queryAllByRole('radio')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetNearMeCache()
  db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: null })
  db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
  maps.createSearchSession.mockResolvedValue({})
  maps.searchPlaces.mockResolvedValue(RESULTS)
  maps.getPlaceDetails.mockImplementation(async (s: { placeId: string; primaryText: string; secondaryText: string }) => ({
    place: { googlePlaceId: s.placeId, name: s.primaryText, formattedAddress: s.secondaryText, latitude: 1, longitude: 2 },
    types: ['gym'],
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the top of the screen in onboarding (no gym yet)', () => {
  it('has the title, a progress bar 66% full and "2 of 3", and no tab bar', async () => {
    renderApp()
    await title()
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(screen.getByTestId('step-progress').style.width || getComputedStyle(screen.getByTestId('step-progress')).width).toBe('66%')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('has no back arrow, since the details are already saved and there is no screen to go back to', async () => {
    renderApp()
    await title()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('has no mascot', async () => {
    renderApp()
    await title()
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('the search box', () => {
  it('is a search box with the right hints and placeholder', async () => {
    renderApp()
    await title()
    expect(box().type).toBe('search')
    expect(box().getAttribute('enterkeyhint')).toBe('search')
    expect(box().getAttribute('autocomplete')).toBe('off')
    expect(box().placeholder).toBe('Search by gym name or area')
  })

  it('has no clear button until there is text, then a ✕ that empties the box and keeps focus there', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()

    await user.type(box(), 'iron')
    const clear = screen.getByRole('button', { name: 'Clear search' })
    expect(clear.textContent).toBe('✕')
    await user.click(clear)
    expect(box().value).toBe('')
    expect(document.activeElement).toBe(box())
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('shows the "Gyms near me" row between the box and the results (that part is 10g)', async () => {
    renderApp()
    await title()
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(box(), screen.getByRole('switch', { name: 'Gyms near me' }))).toBe(true)
    // Before anything is searched, the results area holds the prompt; it comes after the toggle row.
    expect(follows(screen.getByRole('switch', { name: 'Gyms near me' }), await screen.findByText(/Type at least 3 characters/))).toBe(true)
  })
})

describe('the results', () => {
  async function search(user: ReturnType<typeof userEvent.setup>, text = 'iron') {
    await title()
    await user.type(box(), text)
    await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 })
  }

  it('are a radiogroup of rows with the name and the address, under the small heading "Results"', async () => {
    const user = userEvent.setup()
    renderApp()
    await search(user)
    const group = screen.getByRole('radiogroup', { name: 'Gym results' })
    // The small heading sits just above the group (the heading is not a radio, so it is not inside it).
    const heading = screen.getByText('Results')
    expect(group.contains(heading)).toBe(false)
    expect(Boolean(heading.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(within(group).queryByText('Results')).toBeNull()
    expect(rows().map((row) => row.textContent)).toEqual(['Ironworks FitnessLinking Road, Bandra West', 'Pulse FitnessJuhu Tara Road, Juhu'])
    expect(rows().every((row) => row.getAttribute('aria-checked') === 'false')).toBe(true)
  })

  it('check the chosen row (aria-checked, a tick, the accent border and the soft fill) and only that one', async () => {
    const user = userEvent.setup()
    renderApp()
    await search(user)
    await user.click(rows()[0])
    await vi.waitFor(() => expect(saveGymButton().disabled).toBe(false))

    expect(rows()[0].getAttribute('aria-checked')).toBe('true')
    expect(rows()[1].getAttribute('aria-checked')).toBe('false')
    expect(rows()[0].querySelector('svg')).toBeTruthy()
    expect(rows()[1].querySelector('svg')).toBeNull()
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = (node: HTMLElement) => Array.from(node.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ').toLowerCase()
    expect(rule(rows()[0])).toContain('border:1.5px solid #2b50d9')
    expect(rule(rows()[0])).toContain('background-color:#17234f')
    expect(rule(rows()[1])).toContain('border:1.5px solid transparent')
    expect(rule(rows()[1])).toContain('background-color:#0e1522')
  })

  it('are at least 64px tall', async () => {
    const user = userEvent.setup()
    renderApp()
    await search(user)
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(rows()[0].classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toContain('min-height:64px')
  })

  it('choosing another row moves the choice', async () => {
    const user = userEvent.setup()
    renderApp()
    await search(user)
    await user.click(rows()[0])
    await vi.waitFor(() => expect(saveGymButton().disabled).toBe(false))
    await user.click(rows()[1])
    await vi.waitFor(() => expect(rows()[1].getAttribute('aria-checked')).toBe('true'))
    expect(rows()[0].getAttribute('aria-checked')).toBe('false')
  })

  it('typing again drops the old choice, so a stale gym cannot be saved', async () => {
    const user = userEvent.setup()
    renderApp()
    await search(user)
    await user.click(rows()[0])
    await vi.waitFor(() => expect(saveGymButton().disabled).toBe(false))
    await user.type(box(), 'x')
    expect(saveGymButton().disabled).toBe(true)
  })
})

describe('the states of the list', () => {
  it('loading: "Finding gyms…" and three placeholder rows, while the results are on their way', async () => {
    maps.searchPlaces.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')

    expect(await screen.findByText('Finding gyms…', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getAllByTestId('gym-skeleton')).toHaveLength(3)
    expect(screen.getByText('Finding gyms…').closest('[aria-busy]')?.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('radiogroup')).toBeNull() // there are no rows to group yet
    expect(rows()).toHaveLength(0)
    expect(saveGymButton().disabled).toBe(true)
  })

  it('loading uses the shared loader', async () => {
    maps.searchPlaces.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    const line = (await screen.findByText('Finding gyms…', {}, { timeout: 3000 })).closest('[role="status"]')!
    expect(line.querySelector('svg')).toBeTruthy()
  })

  it('error: "Couldn’t load gyms", "Check your connection and try again." and a Retry button', async () => {
    maps.searchPlaces.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')

    expect(await screen.findByText('Couldn’t load gyms', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(saveGymButton().disabled).toBe(true)
  })

  it('Retry runs the same search again and shows the results', async () => {
    maps.searchPlaces.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'iron')
    await user.click(await screen.findByRole('button', { name: 'Retry' }, { timeout: 3000 }))

    expect(await screen.findByRole('radio', { name: /ironworks/i })).toBeTruthy()
    expect(maps.searchPlaces).toHaveBeenCalledTimes(2)
    expect(maps.searchPlaces.mock.calls[1][0]).toBe('iron')
    expect(screen.queryByText('Couldn’t load gyms')).toBeNull()
  })

  it('no results: names what was searched for, and suggests trying the area', async () => {
    maps.searchPlaces.mockResolvedValue([])
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'zzzz')

    expect(await screen.findByText('No gyms found for “zzzz”', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('Check the spelling, or try the gym’s area instead.')).toBeTruthy()
    expect(saveGymButton().disabled).toBe(true)
  })

  it('no results: does not put markup typed into the box on the page', async () => {
    maps.searchPlaces.mockResolvedValue([])
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(box(), 'a<b>gym')
    expect(await screen.findByText(/No gyms found for/, {}, { timeout: 3000 })).toBeTruthy()
    expect(document.querySelector('b b, [role="radiogroup"] b > b')).toBeNull()
  })

  it('asks for at least three characters before looking', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    // The prompt shows once Maps has finished starting; until then the list shows its loading state.
    expect(await screen.findByText(/Type at least 3 characters/)).toBeTruthy()
    await user.type(box(), 'ir')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(maps.searchPlaces).not.toHaveBeenCalled()
  })
})

describe('Save gym', () => {
  async function pickFirst(user: ReturnType<typeof userEvent.setup>) {
    await title()
    await user.type(box(), 'iron')
    await user.click(await screen.findByRole('radio', { name: /ironworks/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveGymButton().disabled).toBe(false))
  }

  it('is a primary button reading "Save gym", off until a row is chosen', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    expect(saveGymButton().disabled).toBe(true)
    await pickFirst(user)
    expect(saveGymButton().disabled).toBe(false)
  })

  it('saves the chosen gym as before, shows "<name> saved", and then moves on', async () => {
    const user = userEvent.setup()
    renderApp()
    await pickFirst(user)
    await user.click(saveGymButton())

    expect(db.saveActiveGym).toHaveBeenCalledTimes(1)
    expect(db.saveActiveGym).toHaveBeenCalledWith({ googlePlaceId: 'g1', name: 'Ironworks Fitness', formattedAddress: 'Linking Road, Bandra West', latitude: 1, longitude: 2 })
    expect(await screen.findByText('Ironworks Fitness saved')).toBeTruthy()
    // The gym screen is still up while the message shows ...
    expect(screen.getByRole('heading', { name: 'Where do you work out?' })).toBeTruthy()
    // ... and then the app continues.
    expect(await screen.findByRole('button', { name: /^show up$/i }, { timeout: 4000 })).toBeTruthy()
  })

  it('waits about 700 ms after saving before moving on, and not before', async () => {
    const user = userEvent.setup()
    renderApp()
    await pickFirst(user)
    vi.useFakeTimers()
    fireEvent.click(saveGymButton())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(GYM_SAVED_PAUSE_MS).toBe(700)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GYM_SAVED_PAUSE_MS - 100)
    })
    expect(screen.queryByRole('button', { name: /^show up$/i })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Where do you work out?' })).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()
  })

  it('cannot be pressed a second time once saved, so the gym is stored once', async () => {
    const user = userEvent.setup()
    renderApp()
    await pickFirst(user)
    await user.click(saveGymButton())
    await screen.findByText('Ironworks Fitness saved')
    expect(saveGymButton().disabled).toBe(true)
    expect(db.saveActiveGym).toHaveBeenCalledTimes(1)
  })

  it('on a failed save: no toast, the error shows, the choice is kept, and Try again works', async () => {
    db.saveActiveGym.mockResolvedValueOnce({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
    const user = userEvent.setup()
    renderApp()
    await pickFirst(user)
    await user.click(saveGymButton())

    expect(await screen.findByText(/couldn't reach the server/)).toBeTruthy()
    expect(screen.queryByText(/saved$/)).toBeNull()
    expect(rows()[0].getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ironworks Fitness saved')).toBeTruthy()
  })
})

describe('opened from Profile ("Change gym")', () => {
  async function openChangeGym(user: ReturnType<typeof userEvent.setup>) {
    db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
    renderApp()
    await user.click(await screen.findByRole('button', { name: /^profile$/i }))
    await user.click(await screen.findByRole('button', { name: /edit details/i }))
    await user.click(await screen.findByRole('button', { name: /change gym/i }))
    await title()
  }

  it('has a back arrow but no progress bar and no step count', async () => {
    const user = userEvent.setup()
    await openChangeGym(user)
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.queryByText('2 of 3')).toBeNull()
    expect(screen.queryByTestId('step-progress')).toBeNull()
  })

  it('has no tab bar and no mascot', async () => {
    const user = userEvent.setup()
    await openChangeGym(user)
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('Back returns to Profile with the old gym unchanged', async () => {
    const user = userEvent.setup()
    await openChangeGym(user)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeTruthy()
    expect(db.saveActiveGym).not.toHaveBeenCalled()
  })

  it('saving shows "<name> saved" and then returns to Profile', async () => {
    db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: newGym })
    const user = userEvent.setup()
    await openChangeGym(user)
    await user.type(box(), 'pulse')
    await user.click(await screen.findByRole('radio', { name: /pulse fitness/i }, { timeout: 3000 }))
    await vi.waitFor(() => expect(saveGymButton().disabled).toBe(false))
    await user.click(saveGymButton())

    expect(await screen.findByText('Pulse Fitness saved')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Asha Rao' }, { timeout: 4000 })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Where do you work out?' })).toBeNull()
  })
})
