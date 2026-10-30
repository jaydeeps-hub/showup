// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testGym } from '../test/fixtures'
import type { CmsContent, Gym, Profile } from '../types'
import { theme } from './theme'

/**
 * Journey tests for the Quick Start: when it appears, what finishing records, and the Profile button.
 * The REAL App, screens, hooks and content store are used. Only the outside world is faked: the answer to
 * `get_cms_content` (and whether it works), `complete_quickstart`, the profile and gym, the device and Maps.
 */

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

const people = vi.hoisted(() => ({ fetchProfile: vi.fn(), updateProfile: vi.fn() }))
vi.mock('../services/profileService', () => ({
  fetchProfile: people.fetchProfile,
  updateProfile: people.updateProfile,
  updatePlaceSearchMode: vi.fn(),
}))

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
vi.mock('../services/gymService', () => ({
  fetchActiveGym: vi.fn(async () => ({ status: 'ok', gym: savedGym })),
  saveActiveGym: vi.fn(),
}))
vi.mock('../services/showupSessionService', () => ({
  getShowupState: vi.fn(async () => ({ ok: true, value: { today: '2026-10-26', showed_up_today: false, session: null } })),
  startShowup: vi.fn(),
  checkShowup: vi.fn(),
  cancelShowup: vi.fn(),
}))
vi.mock('../services/devicePosition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/devicePosition')>()),
  getPosition: vi.fn(),
}))
vi.mock('../services/wakeLock', () => ({ acquireWakeLock: vi.fn(), releaseWakeLock: vi.fn(), reacquireWakeLockIfWanted: vi.fn() }))
vi.mock('../services/mapsService', () => ({
  isMapsConfigured: () => true,
  createSearchSession: vi.fn().mockResolvedValue({}),
  searchPlaces: vi.fn().mockResolvedValue([]),
  getPlaceDetails: vi.fn(),
}))

// The mascot is not under test: no pictures, so the words alone are enough.
vi.mock('../services/mascotService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/mascotService')>()),
  fetchMascotContent: vi.fn(async () => ({ status: 'error' })),
}))

// The content answer and the "tell the database" call, both chosen by each test.
const cms = vi.hoisted(() => ({ fetchCmsContent: vi.fn() }))
vi.mock('../services/cmsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cmsService')>()),
  fetchCmsContent: cms.fetchCmsContent,
}))
const quick = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('../services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (name: string) => (name === 'complete_quickstart' ? quick.complete() : Promise.resolve({ data: null, error: null })) },
}))

const { App } = await import('./App')
const { CmsStore, CMS_STORAGE_KEY } = await import('../services/cmsStore')
const { cmsStore } = await import('../services/cmsStore')
const { DEFAULT_CMS_CONTENT } = await import('../config/cmsDefaults')
const { QUICKSTART_PENDING_KEY_PREFIX } = await import('../services/quickStartService')

const savedGym: Gym = { ...testGym, id: 'gym-1', userId: 'user-1', name: 'Iron Gym' }

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    firstName: 'Asha',
    lastName: 'Rao',
    dateOfBirth: null,
    isAdmin: false,
    placeSearchMode: 'fitness_only',
    quickstartCompletedAt: null,
    createdAt: '2026-10-19T10:00:00Z',
    updatedAt: '2026-10-19T10:00:00Z',
    ...overrides,
  }
}

function slides(count: number): CmsContent {
  return {
    version: 'live-1',
    categories: {
      quick_start: Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        slug: `qs-${index + 1}`,
        position: (index + 1) * 10,
        heading: `Live step ${index + 1}`,
        subheading: `Words ${index + 1}`,
        image_url: '',
        image_alt: null,
        v: 1,
      })),
    },
  }
}

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

const quickStartScreen = () => screen.queryByRole('region', { name: 'Quick start' })
const homeButton = () => screen.findByRole('button', { name: /^show up$/i })
const mainButton = () => screen.getByRole('button', { name: /^(next|done|set up my profile)$/i })

/** Presses the main button until the last slide, then once more to finish. */
async function walkThrough(user: ReturnType<typeof userEvent.setup>, expectedLabel: string) {
  while (mainButton().textContent === 'Next') await user.click(mainButton())
  expect(mainButton().textContent).toBe(expectedLabel)
  await user.click(mainButton())
}

/** Replaces the app's content store state, as if the app had last saved / fetched this. */
function serveContent(result: { status: 'ok'; content: CmsContent } | { status: 'error' }) {
  cms.fetchCmsContent.mockResolvedValue(result)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  people.fetchProfile.mockResolvedValue({ status: 'found', profile: profile() })
  quick.complete.mockResolvedValue({ data: true, error: null })
  serveContent({ status: 'ok', content: slides(3) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // The store is shared by the whole app; start every test from a store that has the content the test saved.
  seedStore()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * Makes the shared store show `content` from the very first render, as if it had been saved on an earlier
 * visit (the app reads its saved copy instantly, then refreshes in the background).
 */
function seedStore(content: CmsContent = slides(3)) {
  localStorage.setItem(CMS_STORAGE_KEY, JSON.stringify(content))
  const fresh = new CmsStore({ fetchContent: cms.fetchCmsContent, storage: localStorage, now: () => Date.now() })
  Object.assign(cmsStore, { content: fresh.getSnapshot(), lastFetchAt: null, inFlight: null })
}

describe('when it appears', () => {
  it('shows before Home for a signed-in person who has not finished it, and then goes to Home', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Live step 1' }, { timeout: 3000 })).toBeTruthy()
    expect(quickStartScreen()).toBeTruthy()
    // Not on Home yet, and no tab bar on this screen.
    expect(screen.queryByRole('button', { name: /^show up$/i })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()

    await walkThrough(user, 'Done')
    expect(await homeButton()).toBeTruthy()
    expect(quickStartScreen()).toBeNull()
  })

  it('does not show it to a person who already finished it', async () => {
    people.fetchProfile.mockResolvedValue({ status: 'found', profile: profile({ quickstartCompletedAt: '2026-10-20T08:00:00Z' }) })
    renderApp()
    expect(await homeButton()).toBeTruthy()
    expect(quickStartScreen()).toBeNull()
    expect(quick.complete).not.toHaveBeenCalled()
  })

  it('does not show it again to someone whose finish is waiting to be recorded', async () => {
    localStorage.setItem(`${QUICKSTART_PENDING_KEY_PREFIX}user-1`, '1')
    quick.complete.mockResolvedValue({ data: false, error: null })
    renderApp()
    expect(await homeButton()).toBeTruthy()
    expect(quickStartScreen()).toBeNull()
  })

  it('shows it BEFORE onboarding for a new person, then onboarding, with "Set up my profile" on the last slide', async () => {
    people.fetchProfile.mockResolvedValue({ status: 'found', profile: profile({ firstName: null, lastName: null }) })
    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Live step 1' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).toBeNull()

    await walkThrough(user, 'Set up my profile')
    expect(await screen.findByRole('heading', { name: 'What should we call you?' })).toBeTruthy()
    expect(quickStartScreen()).toBeNull()
  })

  it('is not shown, and nothing is recorded, when there are no quick_start items', async () => {
    seedStore({ version: 'live-1', categories: {} })
    serveContent({ status: 'ok', content: { version: 'live-1', categories: {} } })
    renderApp()
    expect(await homeButton()).toBeTruthy()
    expect(quickStartScreen()).toBeNull()
    expect(quick.complete).not.toHaveBeenCalled()
  })

  it('steps aside, without an empty screen, if the cards are switched off while it is open', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Live step 1' })

    // The next refresh says the Quick Start is switched off.
    cms.fetchCmsContent.mockResolvedValue({ status: 'ok', content: { version: 'live-2', categories: {} } })
    await act(async () => {
      await cmsStore.refresh()
    })

    expect(await homeButton()).toBeTruthy()
    expect(quickStartScreen()).toBeNull()
  })

  it('does not pop up later if the content only arrives after the app opened', async () => {
    // Nothing saved and the answer comes late: the app opens on Home, and the late answer does not interrupt.
    localStorage.clear()
    Object.assign(cmsStore, { content: { version: 'live-0', categories: {} }, lastFetchAt: null, inFlight: null })
    let release: (value: { status: 'ok'; content: CmsContent }) => void = () => {}
    cms.fetchCmsContent.mockReturnValue(new Promise((resolve) => (release = resolve)))
    renderApp()
    expect(await homeButton()).toBeTruthy()

    release({ status: 'ok', content: slides(3) })
    await waitFor(() => expect(cms.fetchCmsContent).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(quickStartScreen()).toBeNull()
    expect(screen.getByRole('button', { name: /^show up$/i })).toBeTruthy()
  })
})

describe('finishing and skipping', () => {
  it('records the finish when the last button is pressed', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Live step 1' })
    await walkThrough(user, 'Done')
    await waitFor(() => expect(quick.complete).toHaveBeenCalledTimes(1))
  })

  it('records the finish when Skip is pressed, from the first slide', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Live step 1' })
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await homeButton()).toBeTruthy()
    await waitFor(() => expect(quick.complete).toHaveBeenCalledTimes(1))
  })

  it('still moves on, and remembers to retry next time, when the database cannot be told', async () => {
    quick.complete.mockResolvedValue({ data: null, error: { message: 'offline' } })
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Live step 1' })
    await user.click(screen.getByRole('button', { name: 'Skip' }))

    expect(await homeButton()).toBeTruthy()
    await waitFor(() => expect(localStorage.getItem(`${QUICKSTART_PENDING_KEY_PREFIX}user-1`)).toBe('1'))
  })

  it('does not come back after finishing, even though the stored time has not reloaded yet', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Live step 1' })
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await homeButton()
    expect(quickStartScreen()).toBeNull()
  })
})

describe('when the content cannot be fetched', () => {
  it('uses the bundled Quick Start when nothing was ever saved or fetched', async () => {
    localStorage.clear()
    Object.assign(cmsStore, { content: DEFAULT_CMS_CONTENT, lastFetchAt: null, inFlight: null })
    serveContent({ status: 'error' })
    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Add your gym' })).toBeTruthy()
    expect(screen.getAllByRole('group', { hidden: true }).filter((node) => node.getAttribute('aria-roledescription') === 'slide')).toHaveLength(4)

    await walkThrough(user, 'Done')
    expect(await homeButton()).toBeTruthy()
    await waitFor(() => expect(quick.complete).toHaveBeenCalledTimes(1))
  })
})

describe('the Quick start guide button on Profile', () => {
  async function openProfile(user: ReturnType<typeof userEvent.setup>) {
    await homeButton()
    await user.click(screen.getByRole('button', { name: 'Profile' }))
    await screen.findByRole('heading', { name: 'Asha Rao' })
  }

  beforeEach(() => {
    // Everyone below has already finished the Quick Start, so they land on Home.
    people.fetchProfile.mockResolvedValue({ status: 'found', profile: profile({ quickstartCompletedAt: '2026-10-20T08:00:00Z' }) })
  })

  it('is shown to a signed-in person, below the details list', async () => {
    const user = userEvent.setup()
    renderApp()
    await openProfile(user)
    const button = screen.getByRole('button', { name: /quick start guide/i })
    const lastDetail = screen.getByText('Weekly goal', { selector: 'span' })
    expect(lastDetail.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Google account email', { selector: 'label' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('is shown to a person who has NOT finished the Quick Start too', async () => {
    people.fetchProfile.mockResolvedValue({ status: 'found', profile: profile() })
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Live step 1' })
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await homeButton()
    await user.click(screen.getByRole('button', { name: 'Profile' }))
    expect(await screen.findByRole('button', { name: /quick start guide/i })).toBeTruthy()
  })

  it('is hidden while editing the details', async () => {
    const user = userEvent.setup()
    renderApp()
    await openProfile(user)
    await user.click(screen.getByRole('button', { name: 'Edit details' }))
    expect(screen.queryByRole('button', { name: /quick start guide/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: /quick start guide/i })).toBeTruthy()
  })

  it('is hidden when there are no quick_start items', async () => {
    seedStore({ version: 'live-1', categories: {} })
    serveContent({ status: 'ok', content: { version: 'live-1', categories: {} } })
    const user = userEvent.setup()
    renderApp()
    await openProfile(user)
    expect(screen.queryByRole('button', { name: /quick start guide/i })).toBeNull()
  })

  it('opens the Quick Start ending in "Done", and returns to Profile without recording anything', async () => {
    const user = userEvent.setup()
    renderApp()
    await openProfile(user)
    await user.click(screen.getByRole('button', { name: /quick start guide/i }))

    expect(await screen.findByRole('heading', { name: 'Live step 1' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    await walkThrough(user, 'Done')

    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeTruthy()
    expect(quickStartScreen()).toBeNull()
    expect(quick.complete).not.toHaveBeenCalled()
    expect(localStorage.getItem(`${QUICKSTART_PENDING_KEY_PREFIX}user-1`)).toBeNull()
  })

  it('says "Done" even for someone with no first name, and Skip also returns to Profile', async () => {
    const user = userEvent.setup()
    renderApp()
    await openProfile(user)
    await user.click(screen.getByRole('button', { name: /quick start guide/i }))
    await screen.findByRole('heading', { name: 'Live step 1' })
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeTruthy()
    expect(quick.complete).not.toHaveBeenCalled()
  })

  it('works from the bundled content when the fetch fails', async () => {
    localStorage.clear()
    Object.assign(cmsStore, { content: DEFAULT_CMS_CONTENT, lastFetchAt: null, inFlight: null })
    serveContent({ status: 'error' })
    const user = userEvent.setup()
    renderApp()
    await openProfile(user)
    await user.click(screen.getByRole('button', { name: /quick start guide/i }))
    expect(await screen.findByRole('heading', { name: 'Add your gym' })).toBeTruthy()
  })
})
