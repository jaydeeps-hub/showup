// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { PlaceSearchMode, SelectedPlace } from '../../types'

/**
 * "Gyms near me" on the Add gym screen (Phase 10g), using the REAL GymSearch, toggle, hooks and rules. Faked: the
 * device position, Google (all three calls) and the app config.
 */

const device = vi.hoisted(() => ({ getNearMePosition: vi.fn() }))
vi.mock('../../services/devicePosition', () => ({ getNearMePosition: device.getNearMePosition }))

const maps = vi.hoisted(() => ({
  createSearchSession: vi.fn(),
  searchPlaces: vi.fn(),
  searchNearbyGyms: vi.fn(),
  getPlaceDetails: vi.fn(),
}))
vi.mock('../../services/mapsService', () => ({ isMapsConfigured: () => true, ...maps }))

const config = vi.hoisted(() => ({ value: { gymSearchRadiusMeters: 5000, gymSearchMaxResults: 20 } }))
vi.mock('../../services/appConfig', () => ({
  getCachedAppConfig: () => config.value,
  loadAppConfig: vi.fn(async () => config.value),
}))

const { GymSearch } = await import('./GymSearch')
const { resetNearMeCache } = await import('../../hooks/useNearMeSearch')
const { NEAR_ME_STORAGE_KEY } = await import('../../hooks/useNearMe')
const { LOCATION_OFF_NOTE } = await import('../../config/constants')

const HERE = { lat: 12.9716, lng: 77.5946, accuracy: 30 }

const nearbyList = [
  { placeId: 'n1', primaryText: 'Iron Gym', secondaryText: '1 Main Road', distanceMeters: 640, nearby: { place: { googlePlaceId: 'n1', name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 1, longitude: 1 }, types: ['gym'] } },
  { placeId: 'n2', primaryText: 'Pulse Fitness', secondaryText: '9 Lake View', distanceMeters: 1240, nearby: { place: { googlePlaceId: 'n2', name: 'Pulse Fitness', formattedAddress: '9 Lake View', latitude: 2, longitude: 2 }, types: ['fitness_center'] } },
]

const typedList = [
  { placeId: 't1', primaryText: 'Iron Works', secondaryText: '4 Park St', distanceMeters: 2300, prediction: {} },
  { placeId: 't2', primaryText: '12 Quiet Street', secondaryText: 'Somewhere', distanceMeters: 3100, prediction: {} },
]
const TYPES: Record<string, string[]> = { n1: ['gym'], n2: ['fitness_center'], t1: ['gym'], t2: ['street_address'] }

const onPlaceSelected = vi.fn<(place: SelectedPlace | null) => void>()

function renderSearch(mode: PlaceSearchMode = 'fitness_only') {
  return render(
    <ThemeProvider theme={theme}>
      <GymSearch onPlaceSelected={onPlaceSelected} searchMode={mode} />
    </ThemeProvider>,
  )
}

const toggle = () => screen.getByRole('switch', { name: 'Gyms near me' }) as HTMLInputElement
const box = () => screen.getByRole('searchbox', { name: /search gyms/i }) as HTMLInputElement
const options = () => screen.queryAllByRole('radio')

/** Opens the toggle the way a person does, and waits for the position. */
async function turnOn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(toggle())
  await vi.waitFor(() => expect(toggle().checked).toBe(true))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetNearMeCache()
  config.value = { gymSearchRadiusMeters: 5000, gymSearchMaxResults: 20 }
  device.getNearMePosition.mockResolvedValue(HERE)
  maps.createSearchSession.mockResolvedValue({ token: 'a' })
  maps.searchNearbyGyms.mockResolvedValue(nearbyList)
  maps.searchPlaces.mockResolvedValue(typedList)
  maps.getPlaceDetails.mockImplementation(async (s: { placeId: string; primaryText: string; secondaryText: string; nearby?: unknown }) => ({
    place: { googlePlaceId: s.placeId, name: s.primaryText, formattedAddress: s.secondaryText, latitude: 1, longitude: 1 },
    types: TYPES[s.placeId] ?? [],
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the toggle row', () => {
  it('is between the search box and the results: label, sub-text, and a switch labelled "Gyms near me"', async () => {
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    expect(screen.getByText('Gyms near me')).toBeTruthy()
    expect(screen.getByText('Show the closest gyms first')).toBeTruthy()
    expect(toggle().getAttribute('role')).toBe('switch')
    expect(toggle().checked).toBe(false)
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    // The design's order: the search box, then the toggle row, then the results.
    expect(follows(box(), toggle())).toBe(true)
    expect(follows(toggle(), screen.getByText(/Type at least 3 characters/))).toBe(true)
  })

  it('is at least 54px tall', async () => {
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const row = toggle().closest('label')!
    const rule = Array.from(row.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toContain('min-height:54px')
  })

  it('asks for location when the page opens? Never.', async () => {
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    expect(device.getNearMePosition).not.toHaveBeenCalled()
    expect(maps.searchNearbyGyms).not.toHaveBeenCalled()
  })

  it('has a visible focus style on the row', async () => {
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    expect(css).toMatch(/:has\(input:focus-visible\)\{outline:2px solid #7C97FF/)
  })
})

describe('turning it on', () => {
  it('asks for location only now, says "Finding where you are…" meanwhile, then lists gyms around the device', async () => {
    let finish!: (value: typeof HERE) => void
    device.getNearMePosition.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })

    await user.click(toggle())
    expect(device.getNearMePosition).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Finding where you are…')).toBeTruthy()
    expect(screen.queryByText('Show the closest gyms first')).toBeNull()
    expect(toggle().disabled).toBe(true) // cannot be tapped again while waiting

    await act(async () => finish(HERE))
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
    expect(screen.getByText('Show the closest gyms first')).toBeTruthy()
  })

  it('shows the nearby gyms with the distance on the right and the heading "Near you, closest first"', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.click(box())

    expect(await screen.findByText('Near you, closest first')).toBeTruthy()
    expect(options().map((option) => option.textContent)).toEqual(['Iron Gym1 Main Road640 m', 'Pulse Fitness9 Lake View1.2 km'])
  })

  it('does the nearby search around the device with the default 5000 m and 20 results', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await vi.waitFor(() => expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(1))
    expect(maps.searchNearbyGyms).toHaveBeenCalledWith({ lat: HERE.lat, lng: HERE.lng }, 5000, 20)
  })

  it('uses the radius and count from the config', async () => {
    config.value = { gymSearchRadiusMeters: 1500, gymSearchMaxResults: 7 }
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await vi.waitFor(() => expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(1))
    expect(maps.searchNearbyGyms).toHaveBeenCalledWith({ lat: HERE.lat, lng: HERE.lng }, 1500, 7)
  })

  it('passes only the position (not the accuracy) to Google', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await vi.waitFor(() => expect(maps.searchNearbyGyms).toHaveBeenCalled())
    expect(Object.keys(maps.searchNearbyGyms.mock.calls[0][0]).sort()).toEqual(['lat', 'lng'])
  })

  it('picking a nearby gym saves it with no second request to Google, and keeps the search session', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    const sessionsBefore = maps.createSearchSession.mock.calls.length
    await turnOn(user)
    await user.click(box())
    await user.click(await screen.findByRole('radio', { name: /iron gym/i }))

    await vi.waitFor(() => expect(onPlaceSelected).toHaveBeenLastCalledWith({ googlePlaceId: 'n1', name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 1, longitude: 1 }))
    expect(maps.createSearchSession.mock.calls.length).toBe(sessionsBefore)
  })
})

describe('when location is refused, unavailable or slow', () => {
  it.each([['location_denied'], ['location_unavailable'], ['location_timeout']])('on %s: the toggle is back off, with the note (13px, muted, role status)', async (reason) => {
    device.getNearMePosition.mockRejectedValue(reason)
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await user.click(toggle())

    const note = await screen.findByRole('status', { name: '' })
    expect(note.textContent).toBe(LOCATION_OFF_NOTE)
    expect(LOCATION_OFF_NOTE).toBe('Location is off. Allow it in your browser settings to sort by distance.')
    expect(toggle().checked).toBe(false)
    expect(screen.getByText('Show the closest gyms first')).toBeTruthy()
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(note.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toContain('font-size:13px')
    expect(rule.toLowerCase()).toContain('color:#8d93a0')
  })

  it('name and area search keeps working, with no distances and no heading', async () => {
    device.getNearMePosition.mockRejectedValue('location_denied')
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await user.click(toggle())
    await screen.findByText(LOCATION_OFF_NOTE)

    await user.type(box(), 'iron')
    expect(await screen.findByText('Iron Works', {}, { timeout: 3000 })).toBeTruthy()
    expect(maps.searchPlaces).toHaveBeenCalledWith('iron', expect.anything())
    expect(maps.searchPlaces.mock.calls[0]).toHaveLength(2) // no position, no radius: the plain search
    expect(screen.queryByText('Near you, closest first')).toBeNull()
    expect(screen.queryByText('2.3 km')).toBeNull()
    expect(maps.searchNearbyGyms).not.toHaveBeenCalled()
  })

  it('the note goes away when it is turned on successfully afterwards', async () => {
    device.getNearMePosition.mockRejectedValueOnce('location_denied')
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await user.click(toggle())
    await screen.findByText(LOCATION_OFF_NOTE)
    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
    expect(screen.queryByText(LOCATION_OFF_NOTE)).toBeNull()
  })
})

describe('typing with the toggle on', () => {
  it('searches by text biased toward the device, with the configured radius, and lists by distance', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.type(box(), 'iron')

    expect(await screen.findByText('Near you, closest first', {}, { timeout: 3000 })).toBeTruthy()
    expect(maps.searchPlaces).toHaveBeenCalledWith('iron', expect.anything(), { lat: HERE.lat, lng: HERE.lng }, 5000)
    expect(options().map((option) => option.textContent)).toEqual(['Iron Works4 Park St2.3 km', '12 Quiet StreetSomewhere3.1 km'])
  })

  it('stops listing the nearby gyms as soon as something is typed', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.click(box())
    await screen.findByText('Iron Gym')
    await user.type(box(), 'ir')
    expect(screen.queryByText('Pulse Fitness')).toBeNull()
  })

  /** Types by firing the change event, as the browser does for each keystroke, with fake timers running. */
  function typeNow(text: string) {
    box().focus() // as a person would: the box has to be in use for the search to react to what is typed
    fireEvent.change(box(), { target: { value: text } })
  }
  async function pass(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }
  /** Lets the Maps start-up (a few promises) finish, so the search is allowed to run. */
  async function settle() {
    await pass(10)
    await act(async () => {
      await Promise.resolve()
    })
    await pass(10)
  }
  async function renderWithToggleOnUnderFakeTimers() {
    vi.useFakeTimers()
    renderSearch()
    await settle()
    expect(box()).toBeTruthy()
    fireEvent.click(toggle())
    await settle()
    expect(toggle().checked).toBe(true)
  }

  it('waits 350 ms after the last key before asking Google (and does not ask before that)', async () => {
    await renderWithToggleOnUnderFakeTimers()
    typeNow('iron')
    await pass(340)
    expect(maps.searchPlaces).not.toHaveBeenCalled()
    await pass(20)
    expect(maps.searchPlaces).toHaveBeenCalledTimes(1)
  })

  it('asks once for a burst of typing, not once per key', async () => {
    await renderWithToggleOnUnderFakeTimers()
    for (const text of ['iro', 'iron', 'iron ', 'iron g', 'iron gy', 'iron gym']) {
      typeNow(text)
      await pass(100) // each key arrives before the pause is over
    }
    await pass(1000)
    expect(maps.searchPlaces).toHaveBeenCalledTimes(1)
    expect(maps.searchPlaces.mock.calls[0][0]).toBe('iron gym')
  })

  it('with the toggle OFF the pause is the usual 300 ms, not 350', async () => {
    vi.useFakeTimers()
    renderSearch()
    await settle()
    typeNow('iron')
    await pass(290)
    expect(maps.searchPlaces).not.toHaveBeenCalled()
    await pass(20)
    expect(maps.searchPlaces).toHaveBeenCalledTimes(1)
  })

  it('does not ask until the usual three characters are typed', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.type(box(), 'ir')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(maps.searchPlaces).not.toHaveBeenCalled()
  })
})

describe('the cache', () => {
  it('serves the same typed search at about the same place from memory the second time', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.type(box(), 'iron')
    await screen.findByText('Iron Works', {}, { timeout: 3000 })
    expect(maps.searchPlaces).toHaveBeenCalledTimes(1)

    await user.clear(box())
    await user.type(box(), 'iron')
    await screen.findByText('Iron Works', {}, { timeout: 3000 })
    expect(maps.searchPlaces).toHaveBeenCalledTimes(1)
  })

  it('serves the nearby list from memory when the toggle is turned off and on again', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await vi.waitFor(() => expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(1))
    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(false))
    await turnOn(user)
    await user.click(box())
    await screen.findByText('Iron Gym')
    expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(1)
  })

  it('asks again for a position more than about 100 m away', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await vi.waitFor(() => expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(1))
    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(false))

    device.getNearMePosition.mockResolvedValue({ lat: HERE.lat + 0.01, lng: HERE.lng, accuracy: 30 })
    await turnOn(user)
    await vi.waitFor(() => expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(2))
  })

  it('does not keep a failed nearby search, so it can be tried again', async () => {
    maps.searchNearbyGyms.mockRejectedValueOnce(new Error('REQUEST_DENIED'))
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.click(box())
    expect(await screen.findByText('Couldn’t load gyms')).toBeTruthy()
  })
})

describe('turning it off', () => {
  it('goes back to the usual search: no distances, no heading, a three-character minimum', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.click(box())
    await screen.findByText('Iron Gym')

    await user.click(toggle())
    await vi.waitFor(() => expect(toggle().checked).toBe(false))
    await user.click(box()) // the list closes when the toggle is used; open it again to read its hint
    expect(screen.queryByText('Near you, closest first')).toBeNull()
    expect(screen.queryByText('640 m')).toBeNull()
    expect(await screen.findByText(/Type at least 3 characters/)).toBeTruthy()
  })
})

describe('the rules for who may pick what', () => {
  /** Opens the nearby list and picks one row; returns what the screen reported. */
  async function pick(mode: PlaceSearchMode, name: RegExp, typed?: string) {
    const user = userEvent.setup()
    renderSearch(mode)
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    if (typed) await user.type(box(), typed)
    else await user.click(box())
    await user.click(await screen.findByRole('radio', { name }, { timeout: 3000 }))
  }

  it('the nearby list asks Google for gyms only, for everyone (the type filter is in the Google call itself)', async () => {
    // The gym-type filter is part of searchNearbyGyms (tested in mapsService.nearMe.test.ts); here, that the screen
    // uses it for both modes and never builds its own nearby request.
    for (const mode of ['fitness_only', 'any_place'] as const) {
      maps.searchNearbyGyms.mockClear()
      cleanup()
      resetNearMeCache()
      await pick(mode, /iron gym/i)
      expect(maps.searchNearbyGyms).toHaveBeenCalledTimes(1)
    }
  })

  it('fitness_only: a typed result that is not a gym is refused after the click, as before', async () => {
    await pick('fitness_only', /12 quiet street/i, 'quiet')
    expect(await screen.findByText(/Not a gym/)).toBeTruthy()
    expect(onPlaceSelected).not.toHaveBeenCalledWith(expect.objectContaining({ googlePlaceId: 't2' }))
  })

  it('fitness_only: a typed gym is accepted', async () => {
    await pick('fitness_only', /iron works/i, 'iron')
    await vi.waitFor(() => expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({ googlePlaceId: 't1' })))
  })

  it('any_place: a typed result that is not a gym can be picked and saved', async () => {
    await pick('any_place', /12 quiet street/i, 'quiet')
    await vi.waitFor(() => expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({ googlePlaceId: 't2' })))
    expect(screen.queryByText(/Not a gym/)).toBeNull()
  })

  it('any_place: the nearby list is still only gyms, and a gym there can be picked', async () => {
    await pick('any_place', /pulse fitness/i)
    await vi.waitFor(() => expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({ googlePlaceId: 'n2' })))
    expect(maps.searchNearbyGyms.mock.calls[0]).toHaveLength(3) // position, radius, count: no "any type" option exists
  })

  it('a nearby result still goes through the same gym check as a typed one', async () => {
    maps.searchNearbyGyms.mockResolvedValue([{ ...nearbyList[0], placeId: 'odd', primaryText: 'Odd Place', nearby: { ...nearbyList[0].nearby, types: ['restaurant'] } }])
    await pick('fitness_only', /odd place/i)
    expect(await screen.findByText(/Not a gym/)).toBeTruthy()
  })

  it('the search mode is never written by this screen', async () => {
    await pick('fitness_only', /iron gym/i)
    // GymSearch has no way to change the mode: it is only a prop. Nothing was written to the browser for it either.
    expect(Object.keys(localStorage).filter((key) => key.includes('place'))).toEqual([])
  })
})

describe('privacy and what is remembered', () => {
  it('remembers only an on/off flag in this browser, never a position', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.click(box())
    await screen.findByText('Iron Gym')
    expect(localStorage.getItem(NEAR_ME_STORAGE_KEY)).toBe('1')
    const everything = JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))
    expect(everything).not.toMatch(/12\.97|77\.59/)
  })

  it('does not ask for location on open even if "on" was remembered, when the browser has not already allowed it', async () => {
    localStorage.setItem(NEAR_ME_STORAGE_KEY, '1')
    vi.stubGlobal('navigator', { ...navigator, permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) } })
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await act(async () => {})
    expect(device.getNearMePosition).not.toHaveBeenCalled()
    expect(toggle().checked).toBe(false)
    vi.unstubAllGlobals()
  })

  it('turns itself on at open when "on" was remembered and the browser already allows location', async () => {
    localStorage.setItem(NEAR_ME_STORAGE_KEY, '1')
    vi.stubGlobal('navigator', { ...navigator, permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) } })
    renderSearch()
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
    expect(device.getNearMePosition).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})

describe('accessibility', () => {
  it('the toggle can be used from the keyboard', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    toggle().focus()
    await user.keyboard(' ')
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
  })

  it('the distance is part of each row\'s text, so a screen reader reads it', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    await turnOn(user)
    await user.click(box())
    const row = await screen.findByRole('radio', { name: /iron gym/i })
    expect(within(row).getByText('640 m')).toBeTruthy()
  })
})

// A direct tap on the label, as a finger would, reaches the same switch.
describe('tapping the row', () => {
  it('tapping the label text turns the switch on', async () => {
    renderSearch()
    await screen.findByRole('searchbox', { name: /search gyms/i })
    fireEvent.click(screen.getByText('Gyms near me'))
    await vi.waitFor(() => expect(toggle().checked).toBe(true))
  })
})
