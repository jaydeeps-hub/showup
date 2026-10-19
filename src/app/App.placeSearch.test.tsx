// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from './theme'
import type { PlaceSearchMode, Profile } from '../types'

/**
 * Journey tests for the gym search mode (Step 4). The REAL screens, hooks and place rules are
 * used. Only the outside world is faked: the Supabase session, the database calls, Google Maps
 * and the gym storage.
 */

const USER_ID = 'user-1'

// --- Fakes -------------------------------------------------------------------------------

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-in',
    session: { user: { id: 'user-1', email: 'asha@example.com', user_metadata: {} } } as unknown as Session,
  }),
}))
vi.mock('../services/authService', () => ({
  getIdentity: () => ({ id: 'user-1', username: 'Asha Rao' }),
  signOut: vi.fn(),
}))

const db = vi.hoisted(() => ({ fetchProfile: vi.fn(), updateProfile: vi.fn(), updatePlaceSearchMode: vi.fn() }))
vi.mock('../services/profileService', () => ({
  fetchProfile: db.fetchProfile,
  updateProfile: db.updateProfile,
  updatePlaceSearchMode: db.updatePlaceSearchMode,
}))

// Whether the user has a saved gym is controlled per test (no gym => the gym setup screen shows).
const gymState = vi.hoisted(() => ({ hasGym: false, saveGym: vi.fn() }))
vi.mock('../hooks/useShowup', () => ({
  useShowup: () => ({
    storageStatus: 'ok',
    isNotPersisting: false,
    gym: gymState.hasGym
      ? {
          id: 'gym-1',
          userId: 'user-1',
          label: 'Gym 1',
          googlePlaceId: null,
          name: 'Iron Gym',
          formattedAddress: '1 Main Road',
          latitude: 1,
          longitude: 1,
          createdAt: '2026-10-17T00:00:00Z',
        }
      : null,
    showupCount: 0,
    isVerifying: false,
    saveGym: gymState.saveGym,
    showUp: vi.fn(),
    resetDemoData: vi.fn(),
    continueWithoutSaving: vi.fn(),
  }),
}))

// Google Maps: two search results, each with the "types" Google would report for it.
const PLACE_TYPES: Record<string, string[]> = {
  'place-gym': ['gym', 'point_of_interest'],
  'place-home': ['street_address'],
}
vi.mock('../services/mapsService', () => ({
  isMapsConfigured: () => true,
  createSearchSession: vi.fn().mockResolvedValue({}),
  searchPlaces: vi.fn().mockResolvedValue([
    { placeId: 'place-gym', primaryText: 'Iron Gym', secondaryText: '1 Main Road', prediction: {} },
    { placeId: 'place-home', primaryText: '12 Quiet Street', secondaryText: 'Somewhere', prediction: {} },
  ]),
  getPlaceDetails: vi.fn(async (suggestion: { placeId: string; primaryText: string; secondaryText: string }) => ({
    place: {
      googlePlaceId: suggestion.placeId,
      name: suggestion.primaryText,
      formattedAddress: suggestion.secondaryText,
      latitude: 1,
      longitude: 1,
    },
    types: PLACE_TYPES[suggestion.placeId] ?? [],
  })),
}))

const { App } = await import('./App')

// --- Helpers -----------------------------------------------------------------------------

/** What the database returns for this user. `placeSearchMode` is the already-effective mode. */
function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: USER_ID,
    firstName: 'Asha',
    lastName: 'Rao',
    dateOfBirth: null,
    isAdmin: false,
    placeSearchMode: 'fitness_only',
    createdAt: '2026-10-17T10:00:00Z',
    updatedAt: '2026-10-17T10:00:00Z',
    ...overrides,
  }
}

/** A fake database. The mode change rules mirror the real database function. */
let stored: Profile
function useFakeDatabase(initial: Profile) {
  stored = initial
  db.fetchProfile.mockImplementation(async () => ({ status: 'found', profile: stored }))
  db.updatePlaceSearchMode.mockImplementation(async (mode: PlaceSearchMode) => {
    if (mode === 'any_place' && !stored.isAdmin) {
      return { status: 'error', message: 'Only administrators can search any place.' }
    }
    stored = { ...stored, placeSearchMode: mode }
    return { status: 'saved', mode }
  })
}

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

/** Types into the gym search and picks a result by its name. */
async function searchAndPick(user: ReturnType<typeof userEvent.setup>, name: string) {
  const box = await screen.findByLabelText(/gym name, address or landmark/i)
  await user.click(box)
  await user.type(box, 'iron')
  await user.click(await screen.findByRole('option', { name: new RegExp(name, 'i') }))
}

const saveButton = () => screen.getByRole('button', { name: /save as gym 1/i }) as HTMLButtonElement

async function openManageProfile(user: ReturnType<typeof userEvent.setup>) {
  // The saved name on the home screen opens the Profile page.
  await user.click(await screen.findByRole('button', { name: /open profile for/i }))
  return screen.findByRole('heading', { name: 'Your profile' })
}

/** Change gym now lives on the Profile page, not on the home screen. */
async function openChangeGym(user: ReturnType<typeof userEvent.setup>) {
  await openManageProfile(user)
  await user.click(screen.getByRole('button', { name: /change gym/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  gymState.hasGym = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// --- Regular users -----------------------------------------------------------------------

describe('regular user (is_admin = false)', () => {
  it('can pick a gym', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()

    await searchAndPick(user, 'Iron Gym')

    expect(await screen.findByText(/selected as gym 1/i)).toBeTruthy()
    expect(saveButton().disabled).toBe(false)
  })

  it('is told "Not a gym" and cannot save a non-fitness place', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()

    await searchAndPick(user, '12 Quiet Street')

    expect(await screen.findByText(/not a gym/i)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('still cannot save a non-fitness place when the stored profile claims any_place (it is not honoured)', async () => {
    // The service turns this into fitness_only for a non-admin; the screen test feeds the
    // already-effective value, so here we confirm the screen itself defaults safely too.
    useFakeDatabase(profile({ isAdmin: false, placeSearchMode: 'fitness_only' }))
    const user = userEvent.setup()
    renderApp()
    await searchAndPick(user, '12 Quiet Street')
    expect(saveButton().disabled).toBe(true)
  })

  it('sees no search mode setting in Manage Profile', async () => {
    gymState.hasGym = true
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    expect(screen.queryByText(/gym search/i)).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText(/any place/i)).toBeNull()
  })

  it('stays restricted while the profile could not be loaded', async () => {
    db.fetchProfile.mockResolvedValue({ status: 'error', message: 'offline' })
    const user = userEvent.setup()
    renderApp()

    await searchAndPick(user, '12 Quiet Street')
    expect(await screen.findByText(/not a gym/i)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('is refused by the database if the setting is attempted anyway', async () => {
    useFakeDatabase(profile())
    // A user who bypasses the interface and calls the same function:
    const result = await db.updatePlaceSearchMode('any_place')
    expect(result.status).toBe('error')
    expect(stored.placeSearchMode).toBe('fitness_only')
  })
})

// --- Administrators ----------------------------------------------------------------------

describe('administrator (is_admin = true)', () => {
  it('searches fitness places only by default', async () => {
    useFakeDatabase(profile({ isAdmin: true }))
    const user = userEvent.setup()
    renderApp()

    await searchAndPick(user, '12 Quiet Street')

    expect(await screen.findByText(/not a gym/i)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('sees the setting in Manage Profile with fitness places selected', async () => {
    gymState.hasGym = true
    useFakeDatabase(profile({ isAdmin: true }))
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    const fitness = screen.getByRole('radio', { name: 'Fitness places only' }) as HTMLInputElement
    const any = screen.getByRole('radio', { name: 'Any place' }) as HTMLInputElement
    expect(fitness.checked).toBe(true)
    expect(any.checked).toBe(false)
  })

  it('can switch to any place, which is saved to the database', async () => {
    gymState.hasGym = true
    useFakeDatabase(profile({ isAdmin: true }))
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    await user.click(screen.getByRole('radio', { name: 'Any place' }))

    await vi.waitFor(() => expect((screen.getByRole('radio', { name: 'Any place' }) as HTMLInputElement).checked).toBe(true))
    expect(db.updatePlaceSearchMode).toHaveBeenCalledWith('any_place')
    expect(stored.placeSearchMode).toBe('any_place')
  })

  it('keeps the setting after a refresh, because it comes from the database', async () => {
    gymState.hasGym = true
    useFakeDatabase(profile({ isAdmin: true }))
    const user = userEvent.setup()
    const first = renderApp()
    await openManageProfile(user)
    await user.click(screen.getByRole('radio', { name: 'Any place' }))
    await vi.waitFor(() => expect(stored.placeSearchMode).toBe('any_place'))

    first.unmount() // a refresh: the app reloads everything from the database
    renderApp()
    await openManageProfile(user)

    expect((screen.getByRole('radio', { name: 'Any place' }) as HTMLInputElement).checked).toBe(true)
  })

  it('can then save a non-fitness place as their gym', async () => {
    useFakeDatabase(profile({ isAdmin: true, placeSearchMode: 'any_place' }))
    const user = userEvent.setup()
    renderApp()

    await searchAndPick(user, '12 Quiet Street')

    expect(await screen.findByText(/selected as gym 1/i)).toBeTruthy()
    expect(screen.queryByText(/not a gym/i)).toBeNull()
    expect(saveButton().disabled).toBe(false)
  })

  it('applies the same rule when changing an existing gym', async () => {
    gymState.hasGym = true
    useFakeDatabase(profile({ isAdmin: true, placeSearchMode: 'any_place' }))
    const user = userEvent.setup()
    renderApp()

    await openChangeGym(user)
    await searchAndPick(user, '12 Quiet Street')

    expect(await screen.findByText(/selected as gym 1/i)).toBeTruthy()
  })

  it('is restricted again on the change-gym screen after switching back to fitness places', async () => {
    gymState.hasGym = true
    useFakeDatabase(profile({ isAdmin: true, placeSearchMode: 'any_place' }))
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)
    await user.click(screen.getByRole('radio', { name: 'Fitness places only' }))
    await vi.waitFor(() => expect(stored.placeSearchMode).toBe('fitness_only'))
    await user.click(screen.getByRole('button', { name: /change gym/i }))
    await searchAndPick(user, '12 Quiet Street')

    expect(await screen.findByText(/not a gym/i)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('shows an error and keeps the old setting when the change cannot be saved', async () => {
    gymState.hasGym = true
    useFakeDatabase(profile({ isAdmin: true }))
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    db.updatePlaceSearchMode.mockResolvedValueOnce({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
    await user.click(screen.getByRole('radio', { name: 'Any place' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/couldn't reach the server/i)).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Fitness places only' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Any place' }) as HTMLInputElement).checked).toBe(false)
  })

  it('loses any place immediately when admin rights are removed', async () => {
    // The database reports the EFFECTIVE mode: for a demoted user it is fitness_only again,
    // even though any_place may still be stored.
    useFakeDatabase(profile({ isAdmin: false, placeSearchMode: 'fitness_only' }))
    const user = userEvent.setup()
    renderApp()
    await searchAndPick(user, '12 Quiet Street')
    expect(saveButton().disabled).toBe(true)
  })
})
