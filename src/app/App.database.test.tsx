// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { positionNorthOfGym, testGym } from '../test/fixtures'
import type { Gym, Profile, SelectedPlace } from '../types'
import { theme } from './theme'

/**
 * Journey tests for storing the gym and Showups in Supabase. The REAL useShowup hook and screens
 * are used. Only the outside world is faked: the Supabase session, the profile, the gym and
 * Showup database calls, the device location and Google Maps.
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
  createdAt: '2026-10-19T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
}
vi.mock('../services/profileService', () => ({
  fetchProfile: vi.fn(async () => ({ status: 'found', profile })),
  updateProfile: vi.fn(),
  updatePlaceSearchMode: vi.fn(),
}))

// A fake database for gyms and Showups. Everything the app sends is recorded.
const db = vi.hoisted(() => ({
  fetchActiveGym: vi.fn(),
  saveActiveGym: vi.fn(),
  fetchShowupCount: vi.fn(),
  recordShowup: vi.fn(),
}))
vi.mock('../services/gymService', () => ({
  fetchActiveGym: db.fetchActiveGym,
  saveActiveGym: db.saveActiveGym,
}))
vi.mock('../services/showupService', () => ({
  fetchShowupCount: db.fetchShowupCount,
  recordShowup: db.recordShowup,
}))

// The device location. Tests choose where the user "is".
const device = vi.hoisted(() => ({ getCurrentPosition: vi.fn() }))
vi.mock('../services/geolocationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/geolocationService')>()),
  getCurrentPosition: device.getCurrentPosition,
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

const { App } = await import('./App')

// --- Helpers -----------------------------------------------------------------------------

const savedGym: Gym = { ...testGym, id: 'gym-db-1', userId: 'user-1', name: 'Iron Gym' }

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

/** Searches for the gym and picks the result. */
async function chooseGym(user: ReturnType<typeof userEvent.setup>) {
  const box = await screen.findByLabelText(/gym name, address or landmark/i)
  await user.click(box)
  await user.type(box, 'iron')
  await user.click(await screen.findByRole('option', { name: /iron gym/i }))
}

const showUpButton = () => screen.findByRole('button', { name: /^show up$/i })
const counterText = () => screen.getByText('Total Showups').previousElementSibling?.textContent

beforeEach(() => {
  vi.clearAllMocks()
  db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
  db.fetchShowupCount.mockResolvedValue({ status: 'ok', count: 3 })
  db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: savedGym })
  db.recordShowup.mockResolvedValue({ status: 'recorded' })
  device.getCurrentPosition.mockResolvedValue(positionNorthOfGym(20, 8)) // at the gym
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// --- Loading from the database -----------------------------------------------------------

describe('loading the gym and Showups from Supabase', () => {
  it('shows the saved gym and the count from the database', async () => {
    renderApp()

    expect(await showUpButton()).toBeTruthy()
    expect(screen.getByText('Iron Gym')).toBeTruthy()
    expect(counterText()).toBe('3')
    expect(db.fetchActiveGym).toHaveBeenCalledTimes(1)
    expect(db.fetchShowupCount).toHaveBeenCalledTimes(1)
  })

  it('asks the user to choose a gym when the database has none', async () => {
    db.fetchActiveGym.mockResolvedValue({ status: 'ok', gym: null })
    db.fetchShowupCount.mockResolvedValue({ status: 'ok', count: 0 })
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
    expect(counterText()).toBe('3')
  })

  it('does not read the browser\'s localStorage at all any more', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    renderApp()
    await showUpButton()
    expect(getItem.mock.calls.filter(([key]) => String(key).startsWith('showup:'))).toEqual([])
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
    db.fetchShowupCount.mockResolvedValue({ status: 'ok', count: 0 })
  })

  it('writes the gym to the database and then shows the home screen', async () => {
    const user = userEvent.setup()
    renderApp()
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /save as gym 1/i }))

    expect(await showUpButton()).toBeTruthy()
    expect(db.saveActiveGym).toHaveBeenCalledTimes(1)
    expect(db.saveActiveGym).toHaveBeenCalledWith(chosenPlace)
  })

  it('stays on the gym screen with an error, keeping the choice, when the database refuses', async () => {
    db.saveActiveGym.mockResolvedValueOnce({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
    const user = userEvent.setup()
    renderApp()
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /save as gym 1/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Where do you work out?' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^show up$/i })).toBeNull() // not claimed as saved
    expect(screen.getByText(/selected as gym 1/i)).toBeTruthy() // the choice is kept
  })

  it('can be retried after a failure', async () => {
    db.saveActiveGym.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong while talking to the server. Please try again.' })
    const user = userEvent.setup()
    renderApp()
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /save as gym 1/i }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await showUpButton()).toBeTruthy()
    expect(db.saveActiveGym).toHaveBeenCalledTimes(2)
  })
})

describe('changing gym', () => {
  const newGym: Gym = { ...savedGym, id: 'gym-db-2', name: 'Second Gym' }

  async function openChangeGym(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /open profile for/i }))
    await user.click(await screen.findByRole('button', { name: /change gym/i }))
  }

  it('saves the new gym to the database and shows it', async () => {
    db.saveActiveGym.mockResolvedValue({ status: 'ok', gym: newGym })
    const user = userEvent.setup()
    renderApp()
    await openChangeGym(user)
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /save as gym 1/i }))

    expect(await screen.findByText('Second Gym')).toBeTruthy()
    expect(db.saveActiveGym).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the old gym when the new one could not be saved', async () => {
    db.saveActiveGym.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong while talking to the server. Please try again.' })
    const user = userEvent.setup()
    renderApp()
    await openChangeGym(user)
    await chooseGym(user)
    await user.click(screen.getByRole('button', { name: /save as gym 1/i }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await showUpButton()).toBeTruthy()
    expect(screen.getByText('Iron Gym')).toBeTruthy() // the original gym is still the active one
  })
})

// --- Showing up --------------------------------------------------------------------------

describe('showing up', () => {
  it('writes one Showup row to the database and increases the counter by exactly one', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText('You showed up!')).toBeTruthy()
    expect(db.recordShowup).toHaveBeenCalledTimes(1)
    expect(db.recordShowup).toHaveBeenCalledWith({
      gymId: 'gym-db-1',
      distanceMetres: expect.any(Number),
      accuracyMetres: 8,
    })
    expect(counterText()).toBe('4')
  })

  it('records the distance that was measured, not a made-up value', async () => {
    device.getCurrentPosition.mockResolvedValue(positionNorthOfGym(40, 5))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())
    await screen.findByText('You showed up!')

    const sent = db.recordShowup.mock.calls[0][0] as { distanceMetres: number }
    expect(sent.distanceMetres).toBeGreaterThan(39)
    expect(sent.distanceMetres).toBeLessThan(41)
  })

  it('does not write anything, and does not change the counter, when the user is outside the geofence', async () => {
    device.getCurrentPosition.mockResolvedValue(positionNorthOfGym(900, 8))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText(/you're not at your saved gym/i)).toBeTruthy()
    expect(db.recordShowup).not.toHaveBeenCalled()
    expect(counterText()).toBe('3')
  })

  it('does not write anything when the location is too imprecise', async () => {
    device.getCurrentPosition.mockResolvedValue(positionNorthOfGym(10, 800))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    await screen.findByRole('heading', { name: /not precise enough/i })
    expect(db.recordShowup).not.toHaveBeenCalled()
    expect(counterText()).toBe('3')
  })

  it('does not write anything when location permission is denied', async () => {
    const { GeolocationError } = await import('../services/geolocationService')
    device.getCurrentPosition.mockRejectedValue(new GeolocationError('permission-denied', 'denied'))
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    await screen.findByText(/allow location access/i)
    expect(db.recordShowup).not.toHaveBeenCalled()
    expect(counterText()).toBe('3')
  })

  it('tells the user the visit was NOT saved, and does not count it, when the database write fails', async () => {
    db.recordShowup.mockResolvedValue({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())

    expect(await screen.findByText("Your Showup wasn't saved")).toBeTruthy()
    expect(screen.getByText(/has not been counted/i)).toBeTruthy()
    expect(screen.queryByText('You showed up!')).toBeNull()
    expect(counterText()).toBe('3') // the screen never gets ahead of the database
  })

  it('can be tried again after a failed save, and then counts', async () => {
    db.recordShowup.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong while talking to the server. Please try again.' })
    const user = userEvent.setup()
    renderApp()
    await user.click(await showUpButton())
    await screen.findByText("Your Showup wasn't saved")
    await user.click(screen.getByRole('button', { name: 'OK' }))

    await user.click(await showUpButton())

    expect(await screen.findByText('You showed up!')).toBeTruthy()
    expect(db.recordShowup).toHaveBeenCalledTimes(2)
    expect(counterText()).toBe('4')
  })

  it('writes only one row even if the button is pressed several times quickly', async () => {
    let finish!: (value: unknown) => void
    device.getCurrentPosition.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderApp()
    const button = await showUpButton()

    await user.click(button)
    // While the location is being checked the button is disabled; extra clicks do nothing.
    fireClick(button)
    fireClick(button)

    finish(positionNorthOfGym(10, 5))
    await screen.findByText('You showed up!')
    expect(device.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(db.recordShowup).toHaveBeenCalledTimes(1)
    expect(counterText()).toBe('4')
  })

  it('shows the database count again after a refresh', async () => {
    const user = userEvent.setup()
    const first = renderApp()
    await user.click(await showUpButton())
    await screen.findByText('You showed up!')

    first.unmount() // a refresh: everything reloads from the database
    db.fetchShowupCount.mockResolvedValue({ status: 'ok', count: 4 }) // what the database now holds
    renderApp()

    await showUpButton()
    expect(counterText()).toBe('4')
    expect(db.fetchShowupCount).toHaveBeenCalledTimes(2)
  })
})

function fireClick(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
