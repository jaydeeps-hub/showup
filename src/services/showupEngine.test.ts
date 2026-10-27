import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { CheckShowupResult, DevicePosition, ShowupSession } from '../types'
import { ShowupEngine, type EngineDependencies, type ShowupEventType } from './showupEngine'
import type { ServiceResult } from './showupSessionService'

/**
 * The engine is tested with a fake clock and a fake backend, so the timing rules can be checked
 * exactly: when checks fire, what happens after each kind of answer, and that nothing runs twice.
 */

const T0 = Date.parse('2026-10-26T12:00:00.000Z')
const NEAR: DevicePosition = { lat: 12.9716, lng: 77.5946, accuracy: 10 }

function session(overrides: Partial<ShowupSession> = {}): ShowupSession {
  return {
    session_id: 's1',
    status: 'running',
    started_at: new Date(T0).toISOString(),
    server_now: new Date(T0).toISOString(),
    elapsed_seconds: 0,
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

/** The standard session with the checkpoint at `atSeconds` marked done (what the database returns after a passing check). */
function sessionWithCheckpointDone(atSeconds: number): ShowupSession {
  const base = session()
  return {
    ...base,
    location_checks_done: base.location_checks_done + 1,
    checkpoints: base.checkpoints.map((c) => (c.at_seconds === atSeconds ? { ...c, done: true } : c)),
  }
}

const ok = <T,>(value: T): ServiceResult<{ value: T }> => ({ ok: true, value })
const fail = (error: string): ServiceResult<{ value: never }> => ({ ok: false, error })

/**
 * What the database answers. Its `server_now` is the fake clock's current time, as a real server's
 * would be (a stale `server_now` would shift every later check). `s` is the session it describes.
 */
function checkAnswer(result: CheckShowupResult['result'], extra: Partial<CheckShowupResult> = {}, s = session()): CheckShowupResult {
  return { result, session: { ...s, server_now: new Date(Date.now()).toISOString() }, ...extra }
}

/** Every dependency as a controllable mock, so tests can read `.mock.calls` and change answers. */
interface MockDeps {
  getState: Mock<EngineDependencies['getState']>
  start: Mock<EngineDependencies['start']>
  check: Mock<EngineDependencies['check']>
  cancel: Mock<EngineDependencies['cancel']>
  getPosition: Mock<EngineDependencies['getPosition']>
  now: () => number
  acquireWakeLock: Mock<EngineDependencies['acquireWakeLock']>
  releaseWakeLock: Mock<EngineDependencies['releaseWakeLock']>
}

/** Builds an engine on fake time with every dependency as a controllable mock. */
function setup(initial: Partial<EngineDependencies> = {}) {
  const deps: MockDeps = {
    getState: vi.fn<EngineDependencies['getState']>(async () => ok({ today: '2026-10-26', showed_up_today: false, session: null })),
    start: vi.fn<EngineDependencies['start']>(async () => ok({ already_done: false, session: session() })),
    // A passing check marks the checkpoint it was credited to as done, as the real database does.
    check: vi.fn<EngineDependencies['check']>(async () => ok(checkAnswer('running', { check_passed: true }, sessionWithCheckpointDone(10)))),
    cancel: vi.fn<EngineDependencies['cancel']>(async () => ok(true)),
    getPosition: vi.fn<EngineDependencies['getPosition']>(async () => NEAR),
    now: () => Date.now(),
    acquireWakeLock: vi.fn(),
    releaseWakeLock: vi.fn(),
  }
  // Anything a test passes replaces the default. Tests pass `vi.fn(...)`, so it can still be inspected.
  Object.assign(deps, initial)
  const engine = new ShowupEngine(deps as EngineDependencies)
  engine.setGym('gym-1')
  const events: ShowupEventType[] = []
  engine.subscribe(() => {
    const event = engine.getSnapshot().event
    if (event && events.length < event.id) events.push(event.type)
  })
  return { engine, deps, events }
}

/** Lets pending promises settle without moving the fake clock. */
const settle = () => vi.advanceTimersByTimeAsync(0)
/** Moves the fake clock forward and lets everything it triggers finish. */
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('starting', () => {
  it('goes idle -> checking -> running, and holds the screen awake', async () => {
    const { engine, deps } = setup()
    expect(engine.getSnapshot().phase).toBe('idle')

    const started = engine.start()
    expect(engine.getSnapshot().phase).toBe('checking')
    await started

    expect(engine.getSnapshot().phase).toBe('running')
    expect(deps.start).toHaveBeenCalledWith('gym-1', NEAR)
    expect(deps.acquireWakeLock).toHaveBeenCalled()
  })

  it('shows the numbers the session reports', async () => {
    const { engine } = setup()
    await engine.start()
    const snap = engine.getSnapshot()
    expect(snap.remainingSeconds).toBe(20)
    expect(snap.progress).toBe(0)
    expect(snap.checksDone).toBe(1)
    expect(snap.checksTotal).toBe(3)
  })

  it('ignores a second tap while starting or running', async () => {
    const { engine, deps } = setup()
    const first = engine.start()
    void engine.start()
    await first
    void engine.start()
    expect(deps.start).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a gym', async () => {
    const { engine, deps } = setup()
    engine.setGym(null)
    await engine.start()
    expect(deps.getPosition).not.toHaveBeenCalled()
    expect(engine.getSnapshot().phase).toBe('idle')
  })

  it('says already_done and shows done when today already has a Showup', async () => {
    const { engine, events } = setup({ start: vi.fn(async () => ok({ already_done: true, session: null })) })
    await engine.start()
    expect(engine.getSnapshot().phase).toBe('done')
    expect(engine.getSnapshot().showedUpToday).toBe(true)
    expect(events).toEqual(['already_done'])
  })

  it.each([
    ['too_far', 'too_far'],
    ['poor_accuracy', 'poor_accuracy'],
    ['network', 'error'],
    ['gym_not_found', 'error'],
  ])('maps a start error "%s" to the event "%s" and returns to idle', async (code, event) => {
    const { engine, events, deps } = setup({ start: vi.fn(async () => fail(code)) })
    await engine.start()
    expect(engine.getSnapshot().phase).toBe('idle')
    expect(events).toEqual([event])
    expect(deps.acquireWakeLock).not.toHaveBeenCalled()
  })

  it.each([
    ['location_denied', 'location_denied'],
    ['location_unavailable', 'location_unavailable'],
    ['location_timeout', 'location_unavailable'],
  ])('maps a position failure "%s" to the event "%s" without calling the database', async (failure, event) => {
    const { engine, events, deps } = setup({ getPosition: vi.fn(async () => Promise.reject(failure)) })
    await engine.start()
    expect(engine.getSnapshot().phase).toBe('idle')
    expect(events).toEqual([event])
    expect(deps.start).not.toHaveBeenCalled()
  })
})

describe('checks', () => {
  it('does not check before a checkpoint is due', async () => {
    const { engine, deps } = setup()
    await engine.start()
    await advance(9_000)
    expect(deps.check).not.toHaveBeenCalled()
  })

  it('reads the position and checks when the first checkpoint is due', async () => {
    const { engine, deps } = setup()
    await engine.start()
    deps.getPosition.mockClear()
    await advance(10_500)
    expect(deps.getPosition).toHaveBeenCalledTimes(1)
    expect(deps.check).toHaveBeenCalledTimes(1)
    expect(deps.check).toHaveBeenCalledWith('s1', NEAR)
  })

  it('sends no position when the checkpoint does not need one', async () => {
    const noLocation = session({
      interval_seconds: 0,
      checkpoints: [{ at_seconds: 5, needs_location: false, done: false }],
    })
    const { engine, deps } = setup({ start: vi.fn(async () => ok({ already_done: false, session: noLocation })) })
    await engine.start()
    deps.getPosition.mockClear()
    await advance(5_500)
    expect(deps.getPosition).not.toHaveBeenCalled()
    expect(deps.check).toHaveBeenCalledWith('s1', null)
  })

  it('never has two checks in flight at once', async () => {
    let release: (value: ServiceResult<{ value: CheckShowupResult }>) => void = () => {}
    const { engine, deps } = setup({
      check: vi.fn(() => new Promise<ServiceResult<{ value: CheckShowupResult }>>((resolve) => (release = resolve))),
    })
    await engine.start()
    await advance(12_000) // several ticks pass while the first check is still waiting
    expect(deps.check).toHaveBeenCalledTimes(1)
    release(ok(checkAnswer('running')))
  })

  it('keeps counting down with one tick every half second', async () => {
    const { engine } = setup()
    await engine.start()
    await advance(5_000)
    expect(engine.getSnapshot().remainingSeconds).toBe(15)
    expect(engine.getSnapshot().progress).toBeCloseTo(0.25, 2)
  })

  it('updates the session after a running answer', async () => {
    const next = session({ location_checks_done: 2 })
    const { engine } = setup({ check: vi.fn(async () => ok(checkAnswer('running', { check_passed: true }, next))) })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().checksDone).toBe(2)
    expect(engine.getSnapshot().phase).toBe('running')
  })

  it('waits for next_check_in_seconds after a not_due answer, even when a checkpoint is already due', async () => {
    // Two checkpoints (10 s and 20 s). The first check is answered not_due with "try again in 15 s",
    // so the engine must hold off until then, even though the checkpoint at 10 s stays due.
    const { engine, deps } = setup({
      check: vi.fn(async () => ok(checkAnswer('not_due', { next_check_in_seconds: 15 }))),
    })
    await engine.start()
    await advance(10_500) // first check at ~10.5 s -> not_due: wait 15 s, so not before ~25.5 s
    expect(deps.check).toHaveBeenCalledTimes(1)
    await advance(14_000) // ~24.5 s: still waiting
    expect(deps.check).toHaveBeenCalledTimes(1)
    await advance(2_000) // ~26.5 s: wait is over
    expect(deps.check).toHaveBeenCalledTimes(2)
  })

  it('retries a poor_accuracy answer after 10 seconds, forever, and tells the user once', async () => {
    const { engine, deps, events } = setup({ check: vi.fn(async () => ok(checkAnswer('poor_accuracy'))) })
    await engine.start()
    await advance(10_500)
    expect(deps.check).toHaveBeenCalledTimes(1)
    await advance(4_000)
    expect(deps.check).toHaveBeenCalledTimes(1) // 4 s later: well inside the 10 s wait
    await advance(5_000)
    expect(deps.check).toHaveBeenCalledTimes(1) // 9 s later: still waiting
    await advance(1_500)
    expect(deps.check).toHaveBeenCalledTimes(2) // past 10 s
    await advance(10_500)
    await advance(10_500)
    expect(deps.check.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(engine.getSnapshot().phase).toBe('running') // never gives up
    expect(events.filter((e) => e === 'poor_accuracy')).toHaveLength(1)
  })

  it('sends nothing and retries in 10 seconds when the position cannot be read', async () => {
    const getPosition = vi.fn<() => Promise<DevicePosition>>()
    getPosition.mockResolvedValueOnce(NEAR) // for start
    getPosition.mockRejectedValue('location_unavailable')
    const { engine, deps, events } = setup({ getPosition })
    await engine.start()
    await advance(10_500)
    expect(deps.check).not.toHaveBeenCalled()
    expect(getPosition).toHaveBeenCalledTimes(2)
    await advance(9_000)
    expect(getPosition).toHaveBeenCalledTimes(2) // 10 s wait not over
    await advance(1_500)
    expect(getPosition).toHaveBeenCalledTimes(3)
    expect(deps.check).not.toHaveBeenCalled()
    expect(events.filter((e) => e === 'location_unavailable')).toHaveLength(1) // announced once
  })

  it('retries after a failed network call to the database', async () => {
    const check = vi.fn<EngineDependencies['check']>()
    check.mockResolvedValueOnce(fail('network'))
    check.mockResolvedValue(ok(checkAnswer('running')))
    const { engine } = setup({ check })
    await engine.start()
    await advance(10_500)
    expect(check).toHaveBeenCalledTimes(1)
    await advance(4_000)
    expect(check).toHaveBeenCalledTimes(1) // 4 s after the failure: still waiting
    await advance(5_000)
    expect(check).toHaveBeenCalledTimes(1) // 9 s: still waiting
    await advance(1_500)
    expect(check).toHaveBeenCalledTimes(2) // past 10 s
    expect(engine.getSnapshot().phase).toBe('running')
  })

  it('uses the server clock when the device clock is wrong', async () => {
    // The device clock is 60 s BEHIND the server: the server says it is 12:01:00 while the device reads 12:00:00.
    const s = session({
      started_at: new Date(T0 - 60_000).toISOString(),
      server_now: new Date(T0).toISOString(),
      elapsed_seconds: 60,
      duration_seconds: 80,
      checkpoints: [
        { at_seconds: 70, needs_location: true, done: false },
        { at_seconds: 80, needs_location: true, done: false },
      ],
    })
    const { engine, deps } = setup({ start: vi.fn(async () => ok({ already_done: false, session: s })) })
    await engine.start()
    expect(engine.getSnapshot().remainingSeconds).toBe(20)
    await advance(9_000)
    expect(deps.check).not.toHaveBeenCalled() // server says 69 s elapsed
    await advance(1_500)
    expect(deps.check).toHaveBeenCalledTimes(1) // server says 70.5 s elapsed
  })
})

describe('the end of a session', () => {
  it.each([
    ['completed', 'completed', 'done'],
    ['left_early', 'left_early', 'idle'],
    ['missed_checks', 'missed_checks', 'idle'],
    ['expired', 'expired', 'idle'],
    ['cancelled', 'cancelled', 'idle'],
  ] as const)('on the answer "%s" it stops, releases the screen and emits "%s"', async (result, event, phase) => {
    const { engine, deps, events } = setup({
      check: vi.fn(async () => ok(checkAnswer(result, result === 'completed' ? { recorded: true } : {}))),
    })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().phase).toBe(phase)
    expect(events).toEqual([event])
    expect(deps.releaseWakeLock).toHaveBeenCalled()
    // And it really stopped: no more checks, ever.
    const calls = deps.check.mock.calls.length
    await advance(60_000)
    expect(deps.check.mock.calls.length).toBe(calls)
  })

  it('shows a full ring and done after completing', async () => {
    const { engine } = setup({ check: vi.fn(async () => ok(checkAnswer('completed', { recorded: true }))) })
    await engine.start()
    await advance(10_500)
    const snap = engine.getSnapshot()
    expect(snap.progress).toBe(1)
    expect(snap.showedUpToday).toBe(true)
    expect(snap.phase).toBe('done')
  })

  it('does not count a left-early visit as done today', async () => {
    const { engine } = setup({ check: vi.fn(async () => ok(checkAnswer('left_early'))) })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().showedUpToday).toBe(false)
  })
})

describe('the last outcome (what the mascot remembers about a bad ending)', () => {
  it('starts as none', () => {
    expect(setup().engine.getSnapshot().lastOutcome).toBeNull()
  })

  it.each(['left_early', 'missed_checks'] as const)('remembers "%s" after the timer ends that way', async (result) => {
    const { engine } = setup({ check: vi.fn(async () => ok(checkAnswer(result))) })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().lastOutcome).toBe(result)
  })

  it('keeps it after the event has been consumed, because it is not a one-shot', async () => {
    const { engine } = setup({ check: vi.fn(async () => ok(checkAnswer('left_early'))) })
    await engine.start()
    await advance(10_500)
    engine.clearEvent()
    expect(engine.getSnapshot().event).toBeNull()
    expect(engine.getSnapshot().lastOutcome).toBe('left_early')
  })

  it.each(['completed', 'expired'] as const)('is not set by "%s"', async (result) => {
    const { engine } = setup({ check: vi.fn(async () => ok(checkAnswer(result, result === 'completed' ? { recorded: true } : {}))) })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().lastOutcome).toBeNull()
  })

  it('is cleared when the user starts again', async () => {
    const check = vi.fn<EngineDependencies['check']>()
    check.mockResolvedValueOnce(ok(checkAnswer('left_early')))
    check.mockResolvedValue(ok(checkAnswer('running', { check_passed: true }, sessionWithCheckpointDone(10))))
    const { engine } = setup({ check })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().lastOutcome).toBe('left_early')

    await engine.start()
    expect(engine.getSnapshot().lastOutcome).toBeNull()
    expect(engine.getSnapshot().phase).toBe('running')
  })

  it('is cleared as soon as a new start begins, even if that start then fails', async () => {
    const start = vi.fn<EngineDependencies['start']>()
    start.mockResolvedValueOnce(ok({ already_done: false, session: session() }))
    start.mockResolvedValue(fail('too_far'))
    const { engine } = setup({ start, check: vi.fn(async () => ok(checkAnswer('missed_checks'))) })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().lastOutcome).toBe('missed_checks')

    await engine.start() // fails with too_far
    expect(engine.getSnapshot().lastOutcome).toBeNull()
  })

  it('is cleared when the user stops a later timer', async () => {
    const check = vi.fn<EngineDependencies['check']>()
    check.mockResolvedValueOnce(ok(checkAnswer('left_early')))
    const { engine } = setup({ check })
    await engine.start()
    await advance(10_500)
    expect(engine.getSnapshot().lastOutcome).toBe('left_early')
    await engine.start()
    await engine.stop()
    expect(engine.getSnapshot().lastOutcome).toBeNull()
  })

  it('is forgotten when the engine is destroyed (a different user, or a fresh load)', async () => {
    const { engine } = setup({ check: vi.fn(async () => ok(checkAnswer('left_early'))) })
    await engine.start()
    await advance(10_500)
    engine.destroy()
    expect(engine.getSnapshot().lastOutcome).toBeNull()
  })
})

describe('stopping', () => {
  it('cancels the session on the server and goes idle', async () => {
    const { engine, deps, events } = setup()
    await engine.start()
    await engine.stop()
    expect(deps.cancel).toHaveBeenCalledWith('s1')
    expect(engine.getSnapshot().phase).toBe('idle')
    expect(events).toEqual(['cancelled'])
    expect(deps.releaseWakeLock).toHaveBeenCalled()
  })

  it('stops checking after a cancel', async () => {
    const { engine, deps } = setup()
    await engine.start()
    await engine.stop()
    await advance(60_000)
    expect(deps.check).not.toHaveBeenCalled()
  })

  it('asks the server what happened when there was nothing left to cancel', async () => {
    const { engine, deps } = setup({ cancel: vi.fn(async () => ok(false)) })
    await engine.start()
    deps.getState.mockResolvedValue(ok({ today: '2026-10-26', showed_up_today: true, session: null }))
    await engine.stop()
    expect(deps.getState).toHaveBeenCalled()
    expect(engine.getSnapshot().phase).toBe('done')
  })

  it('reports an error and keeps running if the cancel call fails', async () => {
    const { engine, events } = setup({ cancel: vi.fn(async () => fail('network')) })
    await engine.start()
    await engine.stop()
    expect(engine.getSnapshot().phase).toBe('running')
    expect(events).toEqual(['error'])
  })

  it('does nothing when no session is running', async () => {
    const { engine, deps } = setup()
    await engine.stop()
    expect(deps.cancel).not.toHaveBeenCalled()
  })

  it('ignores a check answer that arrives after the user stopped', async () => {
    let release: (value: ServiceResult<{ value: CheckShowupResult }>) => void = () => {}
    const { engine, events } = setup({
      check: vi.fn(() => new Promise<ServiceResult<{ value: CheckShowupResult }>>((resolve) => (release = resolve))),
    })
    await engine.start()
    await advance(10_500) // a check is now in flight
    await engine.stop()
    release(ok(checkAnswer('completed', { recorded: true })))
    await settle()
    expect(engine.getSnapshot().phase).toBe('idle')
    expect(events).toEqual(['cancelled'])
  })
})

describe('loading and resuming', () => {
  it('resumes a running session on load', async () => {
    const running = session({ elapsed_seconds: 4, started_at: new Date(T0 - 4_000).toISOString() })
    const { engine, deps } = setup({
      getState: vi.fn(async () => ok({ today: '2026-10-26', showed_up_today: false, session: running })),
    })
    await engine.load()
    expect(engine.getSnapshot().phase).toBe('running')
    expect(engine.getSnapshot().remainingSeconds).toBe(16)
    expect(deps.acquireWakeLock).toHaveBeenCalled()
  })

  it('shows done on load when today already has a Showup', async () => {
    const { engine } = setup({
      getState: vi.fn(async () => ok({ today: '2026-10-26', showed_up_today: true, session: null })),
    })
    await engine.load()
    expect(engine.getSnapshot().phase).toBe('done')
    expect(engine.getSnapshot().showedUpToday).toBe(true)
  })

  it('stays idle on load when there is nothing today', async () => {
    const { engine } = setup()
    await engine.load()
    expect(engine.getSnapshot().phase).toBe('idle')
  })

  it('stays idle, quietly, if the state cannot be loaded', async () => {
    const { engine, events } = setup({ getState: vi.fn(async () => fail('network')) })
    await engine.load()
    expect(engine.getSnapshot().phase).toBe('idle')
    expect(events).toEqual([])
  })

  it('processes a check that is already due right after resuming', async () => {
    const late = session({ started_at: new Date(T0 - 12_000).toISOString(), elapsed_seconds: 12 })
    const { engine, deps } = setup({
      getState: vi.fn(async () => ok({ today: '2026-10-26', showed_up_today: false, session: late })),
    })
    await engine.load()
    await settle()
    expect(deps.check).toHaveBeenCalledTimes(1)
  })

  it('on a resync, finishes as expired if the session vanished and nothing was recorded', async () => {
    const { engine, deps, events } = setup()
    await engine.start()
    deps.getState.mockResolvedValue(ok({ today: '2026-10-26', showed_up_today: false, session: null }))
    await engine.resync()
    expect(engine.getSnapshot().phase).toBe('idle')
    expect(events).toEqual(['expired'])
  })

  it('on a resync, finishes as completed if the session vanished because today is now done', async () => {
    const { engine, deps, events } = setup()
    await engine.start()
    deps.getState.mockResolvedValue(ok({ today: '2026-10-26', showed_up_today: true, session: null }))
    await engine.resync()
    expect(engine.getSnapshot().phase).toBe('done')
    expect(events).toEqual(['completed'])
  })

  it('does not start a second resync while one is running', async () => {
    const { engine, deps } = setup()
    void engine.resync()
    void engine.resync()
    await settle()
    expect(deps.getState).toHaveBeenCalledTimes(1)
  })
})

describe('destroy and reuse (React StrictMode runs effect, cleanup, effect)', () => {
  it('stops the clock and releases the screen', async () => {
    const { engine, deps } = setup()
    await engine.start()
    engine.destroy()
    expect(deps.releaseWakeLock).toHaveBeenCalled()
    await advance(60_000)
    expect(deps.check).not.toHaveBeenCalled()
    expect(engine.getSnapshot().phase).toBe('idle')
  })

  it('works again after destroy then load', async () => {
    const { engine, deps } = setup()
    engine.destroy()
    await engine.load()
    await engine.start()
    expect(engine.getSnapshot().phase).toBe('running')
    expect(deps.start).toHaveBeenCalledTimes(1)
  })

  it('ignores an answer that was on its way when it was destroyed', async () => {
    let release: (value: ServiceResult<{ value: { already_done: boolean; session: ShowupSession | null } }>) => void = () => {}
    const { engine } = setup({
      start: vi.fn(() => new Promise<ServiceResult<{ value: { already_done: boolean; session: ShowupSession | null } }>>((resolve) => (release = resolve))),
    })
    const started = engine.start()
    await settle()
    engine.destroy()
    release(ok({ already_done: false, session: session() }))
    await started
    expect(engine.getSnapshot().phase).toBe('idle')
  })
})

describe('events', () => {
  it('numbers every event so two of the same kind are still two events', async () => {
    const { engine } = setup({ start: vi.fn(async () => fail('too_far')) })
    await engine.start()
    const first = engine.getSnapshot().event?.id
    await engine.start()
    expect(engine.getSnapshot().event?.id).toBe((first ?? 0) + 1)
  })

  it('clears the event when asked', async () => {
    const { engine } = setup({ start: vi.fn(async () => fail('too_far')) })
    await engine.start()
    engine.clearEvent()
    expect(engine.getSnapshot().event).toBeNull()
  })
})
