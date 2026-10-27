import { SHOWUP_RETRY_MS, SHOWUP_TICK_MS } from '../config/constants'
import type { CheckShowupResult, DevicePosition, LastOutcome, ShowupSession, SessionStatus } from '../types'
import { computeServerOffsetMs, nextDueCheckpoint, remainingSeconds, sessionProgress } from '../utils/showupSession'
import { isPositionFailure, type PositionFailure } from './devicePosition'
import type { ServiceResult } from './showupSessionService'

/**
 * The timed Show Up engine. Plain TypeScript with no React, so it can be tested with fake timers and
 * fake network calls; `ShowupProvider` wraps it for the screens.
 *
 * It holds a small state machine (idle | checking | running | done) and runs the session:
 *   - the SERVER is the clock (see utils/showupSession.ts);
 *   - one tick every SHOWUP_TICK_MS looks for a checkpoint that is due, not done, with no call in
 *     flight and no failed attempt in the last SHOWUP_RETRY_MS;
 *   - every answer from the database replaces the session and re-measures the server offset.
 *
 * Nothing here knows how long a session lasts or how often it checks; that is all in the session.
 */

export type EnginePhase = 'idle' | 'checking' | 'running' | 'done'

/** A one-shot thing that happened, for the screen to tell the user about exactly once. */
export type ShowupEventType =
  | 'completed'
  | 'already_done'
  | 'left_early'
  | 'missed_checks'
  | 'expired'
  | 'cancelled'
  | 'too_far'
  | 'poor_accuracy'
  | 'location_denied'
  | 'location_unavailable'
  | 'error'

export interface ShowupEvent {
  /** Increases with every event, so two events of the same type are still two events. */
  id: number
  type: ShowupEventType
  /** On `completed` only: false when the day already had a Showup, so nothing new was added. */
  recorded?: boolean
}

export interface EngineSnapshot {
  phase: EnginePhase
  remainingSeconds: number
  /** 0 to 1. */
  progress: number
  checksDone: number
  checksTotal: number
  /** The latest event, or null. The screen should show it once and call `clearEvent()`. */
  event: ShowupEvent | null
  /** True once today has a Showup (including one that just finished). */
  showedUpToday: boolean
  /** Goes up by one each time a visit finishes or turns out to be already counted, so screens know to reload their numbers. */
  completions: number
  /**
   * How the most recent timer ended, when it ended badly (the user left, or too many checks were missed).
   * It stays until the user starts again. Unlike `event` it is not consumed, so any screen can read it, and
   * it is not remembered across a page reload.
   */
  lastOutcome: LastOutcome | null
}

/** What the engine needs from the outside world. Passed in so tests can fake all of it. */
export interface EngineDependencies {
  getState: () => Promise<ServiceResult<{ value: { today: string; showed_up_today: boolean; session: ShowupSession | null } }>>
  start: (gymId: string, position: DevicePosition) => Promise<ServiceResult<{ value: { already_done: boolean; session: ShowupSession | null } }>>
  check: (sessionId: string, position: DevicePosition | null) => Promise<ServiceResult<{ value: CheckShowupResult }>>
  cancel: (sessionId: string) => Promise<ServiceResult<{ value: boolean }>>
  getPosition: () => Promise<DevicePosition>
  /** The device clock, in milliseconds. */
  now: () => number
  /** Wake Lock hooks. Both must never throw. */
  acquireWakeLock: () => void
  releaseWakeLock: () => void
}

const END_EVENT: Record<Exclude<SessionStatus, 'running'>, ShowupEventType> = {
  completed: 'completed',
  left_early: 'left_early',
  missed_checks: 'missed_checks',
  expired: 'expired',
  cancelled: 'cancelled',
}

export class ShowupEngine {
  private snapshot: EngineSnapshot = {
    phase: 'idle',
    remainingSeconds: 0,
    progress: 0,
    checksDone: 0,
    checksTotal: 0,
    event: null,
    showedUpToday: false,
    completions: 0,
    lastOutcome: null,
  }
  private listeners = new Set<() => void>()

  private session: ShowupSession | null = null
  private serverOffsetMs = 0
  private gymId: string | null = null

  private timer: ReturnType<typeof setInterval> | null = null
  private eventCounter = 0
  /** True while a check_showup call (including reading the position for it) is running. */
  private checkInFlight = false
  /** True while a start or a resync is running, so a second one cannot begin. */
  private busy = false
  /** The device time before which no new check attempt is made (set after a failed attempt). */
  private retryNotBefore = 0
  /** The problem the user has already been told about, so a repeating problem is announced once, not every retry. */
  private announcedProblem: ShowupEventType | null = null
  /** Bumped whenever the session is replaced or the engine is stopped, so a late answer from an old call is ignored. */
  private generation = 0
  private destroyed = false

  constructor(private readonly deps: EngineDependencies) {}

  // --- Subscription (for useSyncExternalStore) ---------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): EngineSnapshot => this.snapshot

  private publish(patch: Partial<EngineSnapshot>): void {
    const next = { ...this.snapshot, ...patch }
    // Only replace the snapshot (and wake listeners) if something really changed.
    const changed = (Object.keys(next) as (keyof EngineSnapshot)[]).some((key) => next[key] !== this.snapshot[key])
    if (!changed) return
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }

  private emit(type: ShowupEventType, recorded?: boolean): void {
    this.eventCounter += 1
    this.publish({ event: recorded === undefined ? { id: this.eventCounter, type } : { id: this.eventCounter, type, recorded } })
  }

  /** The screen calls this after it has shown the event. */
  clearEvent = (): void => this.publish({ event: null })

  // --- Lifecycle ---------------------------------------------------------------------------

  /** Tells the engine which gym a new session would start at. Safe to call on every render. */
  setGym(gymId: string | null): void {
    this.gymId = gymId
  }

  /**
   * On app load: resume a running session, or show "done" if today already has a Showup.
   * Also makes the engine usable again after `destroy()`: React StrictMode runs an effect, its cleanup
   * and the effect again, so the same engine is destroyed and then loaded a second time.
   */
  async load(): Promise<void> {
    this.destroyed = false
    await this.resync()
  }

  /**
   * Stops everything: the clock, the wake lock, and any answer still on its way. `load()` brings the
   * engine back. Subscribers are left alone, because React manages those itself.
   */
  destroy(): void {
    this.destroyed = true
    this.generation += 1
    this.stopTicking()
    this.deps.releaseWakeLock()
    this.checkInFlight = false
    this.busy = false
    this.session = null
    this.announcedProblem = null
    this.publish({ phase: 'idle', remainingSeconds: 0, progress: 0, checksDone: 0, checksTotal: 0, lastOutcome: null })
  }

  // --- Public actions ----------------------------------------------------------------------

  /** The tap on Show Up. Reads the position, then asks the database to start a session. */
  async start(): Promise<void> {
    if (this.destroyed || this.busy || this.snapshot.phase === 'checking' || this.snapshot.phase === 'running') return
    if (!this.gymId) return

    this.busy = true
    const gymId = this.gymId
    const generation = this.generation
    // A new attempt: whatever went wrong last time is history.
    this.publish({ phase: 'checking', lastOutcome: null })
    try {
      let position: DevicePosition
      try {
        position = await this.deps.getPosition()
      } catch (failure) {
        if (this.isStale(generation)) return
        this.publish({ phase: 'idle' })
        this.emit(failure === 'location_denied' ? 'location_denied' : isPositionFailure(failure) ? 'location_unavailable' : 'error')
        return
      }

      const result = await this.deps.start(gymId, position)
      if (this.isStale(generation)) return

      if (!result.ok) {
        this.publish({ phase: 'idle' })
        this.emit(result.error === 'too_far' ? 'too_far' : result.error === 'poor_accuracy' ? 'poor_accuracy' : 'error')
        return
      }
      const { already_done, session } = result.value
      if (already_done || !session) {
        this.session = null
        this.publish({ phase: 'done', showedUpToday: true, completions: this.snapshot.completions + 1 })
        this.emit('already_done')
        return
      }
      this.adoptSession(session)
    } finally {
      this.busy = false
    }
  }

  /** The user stops the timer. */
  async stop(): Promise<void> {
    const session = this.session
    if (this.destroyed || !session || this.snapshot.phase !== 'running') return

    const generation = this.generation
    const result = await this.deps.cancel(session.session_id)
    if (this.isStale(generation)) return
    if (!result.ok) {
      this.emit('error')
      return
    }
    // `false` means the session had already ended on the server; ask what really happened.
    if (result.value) {
      this.finish('cancelled')
    } else {
      await this.resync()
    }
  }

  /**
   * Asks the database where things stand and adopts the answer. Used on app load and whenever the
   * page becomes visible again. Due checks are processed straight away if a session is running.
   */
  async resync(): Promise<void> {
    if (this.destroyed || this.busy) return
    this.busy = true
    const generation = this.generation
    let resumeRunning = false
    try {
      const result = await this.deps.getState()
      if (this.isStale(generation)) return
      if (!result.ok) return // keep what we have; the next tick or visibility change tries again

      const { showed_up_today, session } = result.value
      if (session && session.status === 'running') {
        this.adoptSession(session)
        this.retryNotBefore = 0
        resumeRunning = true
      } else if (this.snapshot.phase === 'running') {
        // The server no longer has a running session: it ended while we were away. If today now has a
        // Showup, the visit was counted (finished on this device after the timer, or on another one);
        // otherwise the session ran out of time without being finished.
        this.finish(showed_up_today ? 'completed' : 'expired', showed_up_today)
      } else {
        this.session = null
        this.publish({ phase: showed_up_today ? 'done' : 'idle', showedUpToday: showed_up_today })
      }
    } finally {
      this.busy = false
    }
    // Process any check that is already due straight away, instead of waiting for the next tick.
    // This runs after `busy` is released, because a tick does nothing while `busy` is set.
    if (resumeRunning) void this.tick()
  }

  // --- Internals ---------------------------------------------------------------------------

  private isStale(generation: number): boolean {
    return this.destroyed || generation !== this.generation
  }

  /** Makes `session` the current one: re-measure the clock, show it, start ticking, hold the screen awake. */
  private adoptSession(session: ShowupSession): void {
    // A different session (or the first one) invalidates answers still on their way for the old one.
    // The SAME session being refreshed after a check must not, or its own follow-up would be dropped.
    if (this.session?.session_id !== session.session_id) this.generation += 1
    this.session = session
    this.serverOffsetMs = computeServerOffsetMs(session.server_now, this.deps.now())
    this.publish({
      phase: 'running',
      ...this.numbers(session),
    })
    this.startTicking()
    this.deps.acquireWakeLock()
  }

  /** The countdown numbers for the current moment. */
  private numbers(session: ShowupSession): Pick<EngineSnapshot, 'remainingSeconds' | 'progress' | 'checksDone' | 'checksTotal'> {
    const now = this.deps.now()
    return {
      remainingSeconds: remainingSeconds(session, this.serverOffsetMs, now),
      progress: sessionProgress(session, this.serverOffsetMs, now),
      checksDone: session.location_checks_done,
      checksTotal: session.location_checks_total,
    }
  }

  private startTicking(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => void this.tick(), SHOWUP_TICK_MS)
  }

  private stopTicking(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
  }

  /** The session is over: stop ticking, release the screen, show the final state and tell the user once. */
  private finish(status: Exclude<SessionStatus, 'running'>, showedUpToday?: boolean, recorded?: boolean): void {
    this.generation += 1
    this.announcedProblem = null
    this.stopTicking()
    this.deps.releaseWakeLock()
    const session = this.session
    this.session = null
    const done = status === 'completed' ? true : showedUpToday ?? this.snapshot.showedUpToday
    this.publish({
      phase: done ? 'done' : 'idle',
      showedUpToday: done,
      remainingSeconds: 0,
      progress: status === 'completed' ? 1 : 0,
      checksDone: status === 'completed' && session ? session.location_checks_total : 0,
      checksTotal: session?.location_checks_total ?? 0,
      completions: this.snapshot.completions + (status === 'completed' ? 1 : 0),
      // Only a bad ending is remembered. A good one, a stop by the user, or an expiry clears it.
      lastOutcome: status === 'left_early' || status === 'missed_checks' ? status : null,
    })
    this.emit(END_EVENT[status], status === 'completed' ? recorded : undefined)
  }

  /** One look at the clock. Updates the countdown and, if a check is due, runs it. */
  private async tick(): Promise<void> {
    const session = this.session
    if (this.destroyed || !session || this.snapshot.phase !== 'running') return

    const now = this.deps.now()
    this.publish(this.numbers(session))

    if (this.checkInFlight || this.busy || now < this.retryNotBefore) return
    const checkpoint = nextDueCheckpoint(session, this.serverOffsetMs, now)
    if (!checkpoint) return

    this.checkInFlight = true
    const generation = this.generation
    try {
      let position: DevicePosition | null = null
      if (checkpoint.needs_location) {
        try {
          position = await this.deps.getPosition()
        } catch (failure) {
          // Send nothing. The server decides whether the miss is forgiven; we just try again soon.
          if (!this.isStale(generation)) {
            this.retryNotBefore = this.deps.now() + SHOWUP_RETRY_MS
            this.announceOnce(failure === 'location_denied' ? 'location_denied' : isPositionFailure(failure) ? 'location_unavailable' : 'error')
          }
          return
        }
        if (this.isStale(generation)) return
      }

      const result = await this.deps.check(session.session_id, position)
      if (this.isStale(generation)) return
      if (!result.ok) {
        this.retryNotBefore = this.deps.now() + SHOWUP_RETRY_MS
        return
      }
      this.handleCheckResult(result.value)
    } finally {
      this.checkInFlight = false
    }
  }

  /** Emits a problem event unless the user was already told about this same problem and it has not cleared. */
  private announceOnce(type: ShowupEventType): void {
    if (this.announcedProblem === type) return
    this.announcedProblem = type
    this.emit(type)
  }

  private handleCheckResult(answer: CheckShowupResult): void {
    const { result, session } = answer

    if (result !== 'running' && result !== 'not_due' && result !== 'poor_accuracy') {
      // Any end status. The session in the answer is the final one.
      this.session = session
      this.finish(result, result === 'completed' ? true : undefined, answer.recorded)
      return
    }

    // Still going: adopt the fresh session (and re-measure the server clock).
    this.adoptSession(session)
    if (result === 'poor_accuracy') {
      // Not the user's fault and not evidence either way: try again shortly, and never give up.
      this.retryNotBefore = this.deps.now() + SHOWUP_RETRY_MS
      this.announceOnce('poor_accuracy')
      return
    }
    // Any other answer means the problem (if there was one) is over.
    this.announcedProblem = null
    if (result === 'not_due' && answer.next_check_in_seconds !== undefined) {
      this.retryNotBefore = this.deps.now() + answer.next_check_in_seconds * 1000
    } else {
      this.retryNotBefore = 0
    }
  }
}

/** Re-exported so callers can check a thrown value without importing devicePosition separately. */
export { isPositionFailure }
export type { PositionFailure }
