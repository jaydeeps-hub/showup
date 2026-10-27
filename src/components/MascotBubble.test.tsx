// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MASCOT_MESSAGES } from '../config/mascotDefaults'
import { theme } from '../app/theme'
import type { HomeSummaryState } from '../hooks/useHomeSummary'
import type { CheckShowupResult, MascotContent, ShowupSession } from '../types'

/**
 * The mascot on Home, with the REAL Show Up engine and provider, the real bubble, and the real
 * Home screen where it matters. Faked: the mascot content store (so a test chooses what was loaded),
 * the database calls and the device location.
 */

// --- Fakes -------------------------------------------------------------------------------

// A controllable mascot store: tests set the content, and can change it while the screen is up.
const mascot = vi.hoisted(() => {
  let content: unknown
  const listeners = new Set<() => void>()
  return {
    set(next: unknown) {
      content = next
      listeners.forEach((listener) => listener())
    },
    store: {
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getSnapshot: () => content,
      startup: vi.fn(async () => {}),
      onBecameVisible: vi.fn(async () => {}),
    },
  }
})
vi.mock('../services/mascotStore', () => ({ mascotStore: mascot.store }))

const show = vi.hoisted(() => ({ getShowupState: vi.fn(), startShowup: vi.fn(), checkShowup: vi.fn(), cancelShowup: vi.fn() }))
vi.mock('../services/showupSessionService', () => show)
const device = vi.hoisted(() => ({ getPosition: vi.fn() }))
vi.mock('../services/devicePosition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/devicePosition')>()),
  getPosition: device.getPosition,
}))
vi.mock('../services/wakeLock', () => ({ acquireWakeLock: vi.fn(), releaseWakeLock: vi.fn(), reacquireWakeLockIfWanted: vi.fn() }))
const config = vi.hoisted(() => ({ loadAppConfig: vi.fn() }))
vi.mock('../services/appConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/appConfig')>()),
  loadAppConfig: config.loadAppConfig,
}))

// Home's own data, for the tests that render the whole Home screen.
const homeData = vi.hoisted(() => ({ fetchHomeSummary: vi.fn(), fetchPauseState: vi.fn() }))
vi.mock('../services/homeSummaryService', () => homeData)
vi.mock('../services/calendarService', () => ({
  fetchCalendar: vi.fn(async () => ({
    status: 'ok',
    calendar: { month: '2026-10-01', earliestMonth: '2026-10-01', latestMonth: '2026-10-01', gridFrom: '2026-09-28', gridTo: '2026-11-01', showupDates: [], weeks: [] },
  })),
}))

// GymSummary is a plain child of Home with no subscriptions of its own, so it re-renders exactly when Home
// does. Counting its renders is how the render-cost test counts Home's own renders (a Profiler around Home
// would also count the countdown button inside it, which is supposed to tick).
const gymSummary = vi.hoisted(() => ({ renders: 0 }))
vi.mock('./GymSummary', () => ({
  GymSummary: ({ name }: { name: string }) => {
    gymSummary.renders++
    return <div>{name}</div>
  },
}))

const { ShowupProvider } = await import('../hooks/useShowupSession')
const { MascotBubble } = await import('./MascotBubble')
const { HomeScreen } = await import('../features/attendance/HomeScreen')
const { useShowupSession } = await import('../hooks/showupSessionContext')

// --- Helpers -----------------------------------------------------------------------------

const ok = <T,>(value: T) => ({ ok: true as const, value })

const IMG = (name: string) => ({ kind: 'expression', url: `https://img.test/${name}.png`, alt: name, width: 180, height: 250, v: 1 })

/** Content with real pictures for the six expressions and the 16 seed messages. */
function withPictures(overrides: Partial<MascotContent> = {}): MascotContent {
  return {
    version: 5,
    images: { smile: IMG('smile'), wave: IMG('wave'), cheer: IMG('cheer'), lift: IMG('lift'), focus: IMG('focus'), sleep: IMG('sleep') },
    messages: [...DEFAULT_MASCOT_MESSAGES],
    ...overrides,
  }
}
/** The bundled content: words, no pictures. */
const bundled = (): MascotContent => ({ version: 0, images: {}, messages: [...DEFAULT_MASCOT_MESSAGES] })

const summaryState = (patch: Partial<{ goalDays: number | null; showupDaysThisWeek: number; weeksInARow: number; totalShowups: number }> = {}, activePauses: string[] = []): HomeSummaryState => ({
  status: 'ready',
  summary: { weeksInARow: 4, bestWeeksInARow: 4, goalDays: 3, showupDaysThisWeek: 1, passesLeft: 3, totalShowups: 20, ...patch },
  pause: { activePauses },
})

const TODAY = '2026-10-28' // a Wednesday; its Monday is 2026-10-26

function runningSession(secondsLeft: number, total = 900): ShowupSession {
  const now = Date.now()
  const elapsed = total - secondsLeft
  return {
    session_id: 's1',
    status: 'running',
    started_at: new Date(now - elapsed * 1000).toISOString(),
    server_now: new Date(now).toISOString(),
    elapsed_seconds: elapsed,
    duration_seconds: total,
    interval_seconds: 300,
    max_missed_checks: 0,
    checkpoints: [{ at_seconds: total, needs_location: true, done: false }],
    location_checks_done: 1,
    location_checks_total: 2,
  }
}

function renderBubble(summary: HomeSummaryState = summaryState(), extra?: React.ReactNode) {
  return render(
    <ThemeProvider theme={theme}>
      <ShowupProvider gymId="gym-1" userId="user-1">
        <MascotBubble summary={summary} today={TODAY} />
        {extra}
      </ShowupProvider>
    </ThemeProvider>,
  )
}

/** The speech bubble element (the polite live region), or null. */
const bubble = () => document.querySelector('[aria-live="polite"]') as HTMLElement | null
const picture = () => document.querySelector('img') as HTMLImageElement | null

beforeEach(() => {
  vi.clearAllMocks()
  mascot.set(withPictures())
  show.getShowupState.mockResolvedValue(ok({ today: '2026-10-28', showed_up_today: false, session: null }))
  show.startShowup.mockResolvedValue(ok({ already_done: false, session: runningSession(900) }))
  show.checkShowup.mockResolvedValue(ok({ result: 'running', session: runningSession(900) } as CheckShowupResult))
  show.cancelShowup.mockResolvedValue(ok(true))
  device.getPosition.mockResolvedValue({ lat: 1, lng: 2, accuracy: 5 })
  config.loadAppConfig.mockResolvedValue({ mascotAlmostSeconds: 180 })
  homeData.fetchHomeSummary.mockResolvedValue({
    status: 'ok',
    summary: { weeksInARow: 4, bestWeeksInARow: 4, goalDays: 3, showupDaysThisWeek: 1, passesLeft: 3, totalShowups: 20 },
  })
  homeData.fetchPauseState.mockResolvedValue({ status: 'ok', pause: { activePauses: [] } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// --- The words ---------------------------------------------------------------------------

describe('the speech bubble', () => {
  it('says what the table says for the situation, in a polite live region', async () => {
    renderBubble(summaryState({ goalDays: 3, showupDaysThisWeek: 1 }))
    // done 1 of goal 3, an established user, idle: the default "in progress" line.
    const text = await screen.findByText('Show up today and you’re at 2 of 3.')
    expect(bubble()).toBe(text)
    expect(bubble()?.getAttribute('aria-live')).toBe('polite')
  })

  it('has the bubble style from the design: surface fill, 1px line border, 16px radius, 14px text', async () => {
    renderBubble()
    await screen.findByText(/Show up today/)
    const style = getComputedStyle(bubble()!)
    expect(style.borderRadius).toBe('16px')
    expect(style.fontSize).toBe('14px')
    expect(style.borderTopWidth).toBe('1px')
    expect(style.padding).toBe('10px 14px')
  })

  it('changes the words when the table is edited (a new version arrives)', async () => {
    renderBubble()
    await screen.findByText(/Show up today/)
    act(() => {
      mascot.set(withPictures({ version: 6, messages: [{ id: 99, key: 'in_progress', locale: 'en', priority: 1, expression: 'smile', message: 'Brand new words.' }] }))
    })
    expect(await screen.findByText('Brand new words.')).toBeTruthy()
  })

  it('follows priority from the table: the lowest number among the true situations wins', async () => {
    mascot.set(
      withPictures({
        messages: [
          { id: 1, key: 'in_progress', locale: 'en', priority: 150, expression: 'smile', message: 'default' },
          { id: 2, key: 'one_to_go', locale: 'en', priority: 120, expression: 'cheer', message: 'one to go wins' },
        ],
      }),
    )
    renderBubble(summaryState({ goalDays: 3, showupDaysThisWeek: 2 }))
    expect(await screen.findByText('one to go wins')).toBeTruthy()
    expect(screen.queryByText('default')).toBeNull()
  })

  it('says the paused line when this week is paused (this week\'s Monday is in active_pauses)', async () => {
    renderBubble(summaryState({}, ['2026-10-26']))
    expect(await screen.findByText('Taking a pause. See you when you’re back.')).toBeTruthy()
  })

  it('does not say the paused line for a pause in another week', async () => {
    renderBubble(summaryState({}, ['2026-11-02']))
    expect(await screen.findByText(/Show up today/)).toBeTruthy()
    expect(screen.queryByText(/Taking a pause/)).toBeNull()
  })

  it('welcomes a user with no showups at all', async () => {
    renderBubble(summaryState({ totalShowups: 0, showupDaysThisWeek: 0, weeksInARow: 0 }))
    expect(await screen.findByText('Let’s get your first week going. One visit is all it takes today.')).toBeTruthy()
  })

  it('stays silent, rather than guessing, until Home\'s numbers have loaded', async () => {
    renderBubble({ status: 'loading' } as HomeSummaryState)
    // Nothing is said: with no numbers the total would read as 0 and welcome a veteran as new.
    expect(bubble()).toBeNull()
  })

  it('hides the bubble but keeps the row\'s space when there is nothing to say', async () => {
    mascot.set(withPictures({ messages: [] }))
    const { container } = renderBubble()
    await act(async () => {})
    expect(bubble()).toBeNull()
    const row = container.firstElementChild as HTMLElement
    expect(getComputedStyle(row).minHeight).toBe('104px')
  })

  it('reserves the 104px row height always', async () => {
    const { container } = renderBubble()
    await screen.findByText(/Show up today/)
    expect(getComputedStyle(container.firstElementChild as HTMLElement).minHeight).toBe('104px')
  })

  it('lays out as a flex row: gap 12px, centred, margin-top 14px', async () => {
    const { container } = renderBubble()
    await screen.findByText(/Show up today/)
    const style = getComputedStyle(container.firstElementChild as HTMLElement)
    expect(style.display).toBe('flex')
    expect(style.gap).toBe('12px')
    expect(style.alignItems).toBe('center')
    expect(style.marginTop).toBe('14px')
  })

  it('uses the bundled words, with no picture, while nothing has been loaded yet', async () => {
    mascot.set(bundled())
    renderBubble()
    expect(await screen.findByText(/Show up today/)).toBeTruthy()
    expect(picture()).toBeNull()
  })
})

// --- The picture -------------------------------------------------------------------------

describe('the picture', () => {
  it('is an <img> for the expression, sized by height, decorative', async () => {
    mascot.set(
      withPictures({
        messages: [{ id: 1, key: 'in_progress', locale: 'en', priority: 1, expression: 'wave', message: 'hi' }],
      }),
    )
    renderBubble()
    await screen.findByText('hi')
    const img = picture()!
    expect(img.getAttribute('src')).toBe('https://img.test/wave.png?v=1')
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('aria-hidden')).toBe('true')
    expect(img.getAttribute('width')).toBe('180')
    expect(img.getAttribute('height')).toBe('250')
    const style = getComputedStyle(img)
    expect(style.height).toBe('104px')
    expect(style.width).toBe('auto')
    expect(style.objectFit).toBe('contain')
    expect(style.flexGrow).toBe('0')
    expect(style.flexShrink).toBe('0')
  })

  it('sits to the LEFT of the bubble', async () => {
    renderBubble()
    await screen.findByText(/Show up today/)
    const children = [...(bubble()!.parentElement as HTMLElement).children]
    expect(children[0].tagName).toBe('IMG')
    expect(children[1]).toBe(bubble())
  })

  it('is left out, and only the bubble shows, when the content has no pictures', async () => {
    mascot.set(bundled())
    renderBubble()
    await screen.findByText(/Show up today/)
    expect(picture()).toBeNull()
  })

  it('adds ? or & to the address so a changed picture is fetched again', async () => {
    mascot.set(
      withPictures({
        images: { smile: { ...IMG('smile'), url: 'https://img.test/smile.png?token=abc', v: 77 } },
        messages: [{ id: 1, key: 'in_progress', locale: 'en', priority: 1, expression: 'smile', message: 'x' }],
      }),
    )
    renderBubble()
    await screen.findByText('x')
    expect(picture()?.getAttribute('src')).toBe('https://img.test/smile.png?token=abc&v=77')
  })

  it('on a load error, tries the smile picture once', async () => {
    mascot.set(
      withPictures({ messages: [{ id: 1, key: 'in_progress', locale: 'en', priority: 1, expression: 'cheer', message: 'go' }] }),
    )
    renderBubble()
    await screen.findByText('go')
    expect(picture()?.getAttribute('src')).toContain('cheer.png')

    act(() => picture()!.dispatchEvent(new Event('error')))

    expect(picture()?.getAttribute('src')).toContain('smile.png')
    expect(screen.getByText('go')).toBeTruthy() // the words are unaffected
  })

  it('hides the picture, keeping the bubble, when the smile fallback fails too', async () => {
    mascot.set(
      withPictures({ messages: [{ id: 1, key: 'in_progress', locale: 'en', priority: 1, expression: 'cheer', message: 'go' }] }),
    )
    renderBubble()
    await screen.findByText('go')
    act(() => picture()!.dispatchEvent(new Event('error')))
    act(() => picture()!.dispatchEvent(new Event('error')))

    expect(picture()).toBeNull()
    expect(screen.getByText('go')).toBeTruthy()
  })

  it('hides the picture straight away if the failing one WAS the smile picture', async () => {
    mascot.set(withPictures({ messages: [{ id: 1, key: 'in_progress', locale: 'en', priority: 1, expression: 'smile', message: 'go' }] }))
    renderBubble()
    await screen.findByText('go')
    act(() => picture()!.dispatchEvent(new Event('error')))
    expect(picture()).toBeNull()
    expect(screen.getByText('go')).toBeTruthy()
  })

  it('tries again with a fresh picture when the face changes after a failure', async () => {
    mascot.set(
      withPictures({
        messages: [
          { id: 1, key: 'paused', locale: 'en', priority: 1, expression: 'sleep', message: 'zzz' },
          { id: 2, key: 'in_progress', locale: 'en', priority: 2, expression: 'smile', message: 'awake' },
        ],
      }),
    )
    const view = renderBubble(summaryState({}, ['2026-10-26']))
    await screen.findByText('zzz')
    act(() => picture()!.dispatchEvent(new Event('error')))
    act(() => picture()!.dispatchEvent(new Event('error')))
    expect(picture()).toBeNull()

    // The pause ends: a different face, which has not failed.
    view.rerender(
      <ThemeProvider theme={theme}>
        <ShowupProvider gymId="gym-1" userId="user-1">
          <MascotBubble summary={summaryState({}, [])} today={TODAY} />
        </ShowupProvider>
      </ThemeProvider>,
    )
    expect(await screen.findByText('awake')).toBeTruthy()
    expect(picture()).not.toBeNull()
  })

  it('preloads every other picture once the content has loaded, so changing faces does not flicker', async () => {
    const created: string[] = []
    const RealImage = globalThis.Image
    class SpyImage {
      set src(value: string) {
        created.push(value)
      }
    }
    globalThis.Image = SpyImage as unknown as typeof Image
    try {
      renderBubble()
      await screen.findByText(/Show up today/)
      expect(created.sort()).toEqual(
        ['cheer', 'focus', 'lift', 'sleep', 'smile', 'wave'].map((name) => `https://img.test/${name}.png?v=1`).sort(),
      )
    } finally {
      globalThis.Image = RealImage
    }
  })

  it('preloads again when new content arrives', async () => {
    const created: string[] = []
    const RealImage = globalThis.Image
    class SpyImage {
      set src(value: string) {
        created.push(value)
      }
    }
    globalThis.Image = SpyImage as unknown as typeof Image
    try {
      renderBubble()
      await screen.findByText(/Show up today/)
      created.length = 0
      act(() => mascot.set(withPictures({ version: 6, images: { smile: { ...IMG('smile'), v: 2 } } })))
      expect(created).toEqual(['https://img.test/smile.png?v=2'])
    } finally {
      globalThis.Image = RealImage
    }
  })

  it('has no animation', async () => {
    renderBubble()
    await screen.findByText(/Show up today/)
    const style = getComputedStyle(picture()!)
    expect(style.animationName === '' || style.animationName === 'none').toBe(true)
    expect(style.transitionDuration === '' || style.transitionDuration === '0s').toBe(true)
  })
})

// --- The timer and lastOutcome -----------------------------------------------------------

/** Something to start and read the timer from inside the provider. */
function Controls() {
  const { start, stop, state } = useShowupSession()
  return (
    <>
      <button type="button" onClick={start}>
        go-{state}
      </button>
      <button type="button" onClick={stop}>
        stop
      </button>
    </>
  )
}

/**
 * A bubble that can be taken away and brought back WITHOUT touching the provider above it, as happens
 * when the user leaves Home for another tab and returns.
 */
function Toggleable({ summary }: { summary: HomeSummaryState }) {
  const [shown, setShown] = React.useState(true)
  return (
    <>
      <button type="button" onClick={() => setShown((value) => !value)}>
        toggle-bubble
      </button>
      {shown && <MascotBubble summary={summary} today={TODAY} />}
    </>
  )
}

describe('while the timer runs', () => {
  async function startTimer(secondsLeft: number) {
    show.startShowup.mockResolvedValue(ok({ already_done: false, session: runningSession(secondsLeft) }))
    renderBubble(summaryState(), <Controls />)
    const button = await screen.findByRole('button', { name: /go-idle/ })
    await act(async () => button.click())
    await screen.findByRole('button', { name: /go-running/ })
  }

  it('says "checking" while the location is read', async () => {
    device.getPosition.mockReturnValue(new Promise(() => {}))
    renderBubble(summaryState(), <Controls />)
    await act(async () => (await screen.findByRole('button', { name: /go-idle/ })).click())
    expect(await screen.findByText('Hang on, confirming where you are.')).toBeTruthy()
  })

  it('says how many minutes are left, rounded up', async () => {
    await startTimer(601)
    expect(await screen.findByText('Stay put. 11 min to go.')).toBeTruthy()
  })

  it('switches to "almost there" within the configured number of seconds', async () => {
    await startTimer(150)
    expect(await screen.findByText('Almost there. 3 min left.')).toBeTruthy()
  })

  it('follows the configured threshold, not a built-in one', async () => {
    config.loadAppConfig.mockResolvedValue({ mascotAlmostSeconds: 600 })
    await startTimer(500)
    expect(await screen.findByText('Almost there. 9 min left.')).toBeTruthy()
  })

  it('goes back to the idle words when the user stops the timer', async () => {
    await startTimer(600)
    await screen.findByText(/Stay put/)

    await act(async () => screen.getByRole('button', { name: 'stop' }).click())

    expect(await screen.findByText(/Show up today and you’re at 2 of 3\./)).toBeTruthy()
    expect(screen.queryByText(/Stay put/)).toBeNull()
    expect(show.cancelShowup).toHaveBeenCalledTimes(1)
  })

  it('does not say anything about a stop being a bad ending (cancelling does not set lastOutcome)', async () => {
    await startTimer(600)
    await act(async () => screen.getByRole('button', { name: 'stop' }).click())
    await screen.findByText(/Show up today/)
    expect(screen.queryByText(/Left early/)).toBeNull()
    expect(screen.queryByText(/couldn’t confirm/)).toBeNull()
  })
})

describe('after a timer ends badly (lastOutcome)', () => {
  async function endWith(result: 'left_early' | 'missed_checks') {
    show.startShowup.mockResolvedValue(ok({ already_done: false, session: runningSession(10, 20) }))
    show.checkShowup.mockResolvedValue(ok({ result, session: { ...runningSession(0, 20), status: result } } as CheckShowupResult))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderBubble(summaryState(), <Controls />)
    await act(async () => (await screen.findByRole('button', { name: /go-idle/ })).click())
    await screen.findByRole('button', { name: /go-running/ })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })
  }

  it('says the left-early line when the user left', async () => {
    await endWith('left_early')
    expect(await screen.findByText('Left early? No stress. The timer reset, so try again when you’re back.')).toBeTruthy()
  })

  it('says the missed-checks line when too many checks were missed', async () => {
    await endWith('missed_checks')
    expect(await screen.findByText(/We couldn’t confirm you stayed/)).toBeTruthy()
  })

  it('keeps saying it when Home is left and returned to (the engine remembers, not the screen)', async () => {
    show.startShowup.mockResolvedValue(ok({ already_done: false, session: runningSession(10, 20) }))
    show.checkShowup.mockResolvedValue(ok({ result: 'left_early', session: { ...runningSession(0, 20), status: 'left_early' } } as CheckShowupResult))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(
      <ThemeProvider theme={theme}>
        <ShowupProvider gymId="gym-1" userId="user-1">
          <Controls />
          <Toggleable summary={summaryState()} />
        </ShowupProvider>
      </ThemeProvider>,
    )
    await act(async () => (await screen.findByRole('button', { name: /go-idle/ })).click())
    await screen.findByRole('button', { name: /go-running/ })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })
    await screen.findByText(/Left early\?/)

    // Leave Home (the bubble goes away), then come back.
    await act(async () => screen.getByRole('button', { name: 'toggle-bubble' }).click())
    expect(screen.queryByText(/Left early\?/)).toBeNull()
    await act(async () => screen.getByRole('button', { name: 'toggle-bubble' }).click())

    expect(await screen.findByText(/Left early\?/)).toBeTruthy()
  })

  it('is replaced by the checking line the moment the next session starts', async () => {
    await endWith('left_early')
    await screen.findByText(/Left early\?/)
    device.getPosition.mockReturnValue(new Promise(() => {})) // the next start waits on the location
    await act(async () => (await screen.findByRole('button', { name: /go-idle/ })).click())
    expect(await screen.findByText('Hang on, confirming where you are.')).toBeTruthy()
    expect(screen.queryByText(/Left early\?/)).toBeNull()
  })
})

// --- Home itself -------------------------------------------------------------------------

const gym = { id: 'gym-1', userId: 'user-1', label: 'Gym 1', googlePlaceId: null, name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 1, longitude: 2, createdAt: '2026-01-01T00:00:00Z' }

function renderHome() {
  return render(
    <ThemeProvider theme={theme}>
      <ShowupProvider gymId="gym-1" userId="user-1">
        <HomeScreen firstName="Asha" gym={gym} />
      </ShowupProvider>
    </ThemeProvider>,
  )
}

describe('Home with the mascot', () => {
  it('greets a user with showups as "Welcome back"', async () => {
    renderHome()
    await screen.findByText(/Show up today/)
    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(screen.queryByText(/^Welcome$/)).toBeNull()
  })

  it('greets a brand-new user (no showups) as "Welcome"', async () => {
    homeData.fetchHomeSummary.mockResolvedValue({
      status: 'ok',
      summary: { weeksInARow: 0, bestWeeksInARow: 0, goalDays: 3, showupDaysThisWeek: 0, passesLeft: 3, totalShowups: 0 },
    })
    renderHome()
    expect(await screen.findByText('Welcome')).toBeTruthy()
    expect(screen.queryByText('Welcome back')).toBeNull()
  })

  it('does not call a returning user new while the numbers are still loading', () => {
    homeData.fetchHomeSummary.mockReturnValue(new Promise(() => {}))
    renderHome()
    expect(screen.getByText('Welcome back')).toBeTruthy()
  })

  it('puts the mascot between the summary cards and the week progress / Show up button', async () => {
    renderHome()
    const words = await screen.findByText(/Show up today/)
    const html = document.body.innerHTML
    const cards = html.indexOf('Total showups')
    const mascotAt = html.indexOf(words.textContent ?? '')
    const week = html.indexOf('This week')
    const button = html.search(/aria-label="Show up"/)
    expect(cards).toBeGreaterThan(-1)
    expect(mascotAt).toBeGreaterThan(cards)
    expect(week).toBeGreaterThan(mascotAt)
    expect(button).toBeGreaterThan(mascotAt)
  })

  it('puts the mascot above the paused banner', async () => {
    homeData.fetchPauseState.mockResolvedValue({ status: 'ok', pause: { activePauses: [mondayOfToday()] } })
    renderHome()
    await screen.findByText('Taking a pause. See you when you’re back.')
    const html = document.body.innerHTML
    expect(html.indexOf('Taking a pause')).toBeLessThan(html.indexOf('Paused this week'))
  })

  it('keeps working when the mascot breaks: Home still renders', async () => {
    // A message row that crashes the picker would take the mascot down; an error boundary keeps Home up.
    mascot.set({ version: 1, images: null, messages: [{ id: 1, key: 'in_progress', locale: 'en', priority: 1, expression: 'smile', message: 'x' }] })
    renderHome()
    expect(await screen.findByText('Iron Gym')).toBeTruthy()
    expect(screen.getByText('Total showups')).toBeTruthy()
  })
})

/** This week's Monday on the device clock, in the form Home computes it, for the pause test. */
function mondayOfToday(): string {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
}

// --- Render cost -------------------------------------------------------------------------

describe('render cost while a timer runs', () => {
  /**
   * React's Profiler reports each time the components inside it re-render. Wrapping the whole of Home
   * counts Home's renders (including everything under it); wrapping only the bubble counts the bubble's.
   */
  async function measure(secondsOfTimer: number) {
    const home = { renders: 0 }
    const bubbleOnly = { renders: 0 }
    const texts = new Set<string>()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    show.startShowup.mockResolvedValue(ok({ already_done: false, session: runningSession(secondsOfTimer, secondsOfTimer) }))
    render(
      <ThemeProvider theme={theme}>
        <ShowupProvider gymId="gym-1" userId="user-1">
          <Controls />
          <React.Profiler id="home" onRender={() => home.renders++}>
            <HomeScreen firstName="Asha" gym={gym} />
          </React.Profiler>
          <React.Profiler id="bubble" onRender={() => bubbleOnly.renders++}>
            <MascotBubble summary={summaryState()} today={TODAY} />
          </React.Profiler>
        </ShowupProvider>
      </ThemeProvider>,
    )
    await act(async () => (await screen.findByRole('button', { name: /go-idle/ })).click())
    await screen.findByRole('button', { name: /go-running/ })
    // Everything has settled; count only the ticks from here.
    home.renders = 0
    bubbleOnly.renders = 0
    gymSummary.renders = 0

    for (let i = 0; i < secondsOfTimer * 2; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      const words = document.querySelectorAll('[aria-live="polite"]')
      words.forEach((node) => texts.add(node.textContent ?? ''))
    }
    return {
      homeSubtreeCommits: home.renders, // every commit anywhere under Home, including the countdown button
      homeRenders: gymSummary.renders, // Home's OWN renders
      bubbleRenders: bubbleOnly.renders,
      texts,
      ticks: secondsOfTimer * 2,
    }
  }

  it('re-renders the standalone bubble only when the words could change (about once a minute), not every tick', async () => {
    const result = await measure(300) // five minutes = 600 ticks of 500 ms
    // The bubble is probed alone here, so this is its own cost. 600 ticks must not mean ~600 renders.
    expect(result.bubbleRenders).toBeLessThan(40)
    expect(result.ticks).toBe(600)
  })

  it('does not re-render Home itself as the seconds tick', async () => {
    const result = await measure(300) // 600 ticks of 500 ms
    // Home reads only the number of finished visits, which does not change while a timer runs.
    expect(result.homeRenders).toBeLessThanOrEqual(5)
  })

  it('still redraws the countdown button every tick (that is its job), which is why the cost is moved there', async () => {
    const result = await measure(300)
    expect(result.homeSubtreeCommits).toBeGreaterThan(result.ticks / 2)
  })

  it('changes the words only when the minute rolls over, plus the switch to "almost there"', async () => {
    const result = await measure(300)
    expect(result.texts.size).toBeLessThanOrEqual(8)
    expect(result.texts.size).toBeGreaterThanOrEqual(3)
  })
})
