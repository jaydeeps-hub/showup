import { describe, expect, it } from 'vitest'
import type { ShowupSession } from '../types'
import {
  checkpointDueAtMs,
  computeServerOffsetMs,
  nextDueCheckpoint,
  remainingSeconds,
  sessionEndsAtMs,
  sessionProgress,
} from './showupSession'

/** A session that started at 12:00:00 server time, with the timings given. */
function session(overrides: Partial<ShowupSession> = {}): ShowupSession {
  return {
    session_id: 's1',
    status: 'running',
    started_at: '2026-10-26T12:00:00.000Z',
    server_now: '2026-10-26T12:00:00.000Z',
    elapsed_seconds: 0,
    duration_seconds: 600,
    interval_seconds: 200,
    max_missed_checks: 0,
    checkpoints: [
      { at_seconds: 200, needs_location: true, done: false },
      { at_seconds: 400, needs_location: true, done: false },
      { at_seconds: 600, needs_location: true, done: false },
    ],
    location_checks_done: 1,
    location_checks_total: 4,
    ...overrides,
  }
}

const START = Date.parse('2026-10-26T12:00:00.000Z')

describe('computeServerOffsetMs', () => {
  it('is zero when the device clock matches the server', () => {
    expect(computeServerOffsetMs('2026-10-26T12:00:00.000Z', START)).toBe(0)
  })

  it('is positive when the device clock is behind the server', () => {
    expect(computeServerOffsetMs('2026-10-26T12:00:00.000Z', START - 30_000)).toBe(30_000)
  })

  it('is negative when the device clock is ahead of the server', () => {
    expect(computeServerOffsetMs('2026-10-26T12:00:00.000Z', START + 45_000)).toBe(-45_000)
  })

  it('falls back to zero for an unreadable server time', () => {
    expect(computeServerOffsetMs('not a date', START)).toBe(0)
  })
})

describe('checkpointDueAtMs', () => {
  it('is the start plus the checkpoint offset when the clocks agree', () => {
    const s = session()
    expect(checkpointDueAtMs(s, s.checkpoints[0], 0)).toBe(START + 200_000)
  })

  it('moves with the server offset: a device clock that is ahead sees the check due earlier', () => {
    const s = session()
    // Device is 60 s ahead of the server, so the offset is -60 s and the device reaches the moment sooner.
    expect(checkpointDueAtMs(s, s.checkpoints[0], -60_000)).toBe(START + 200_000 + 60_000)
  })

  it('reads every number from the session, so any timing works (nothing is hard-coded)', () => {
    const s = session({ checkpoints: [{ at_seconds: 7, needs_location: false, done: false }] })
    expect(checkpointDueAtMs(s, s.checkpoints[0], 0)).toBe(START + 7_000)
  })
})

describe('remainingSeconds', () => {
  const s = session()

  it('is the full duration at the start', () => {
    expect(remainingSeconds(s, 0, START)).toBe(600)
  })

  it('counts down', () => {
    expect(remainingSeconds(s, 0, START + 100_000)).toBe(500)
  })

  it('rounds up, so it never shows 0 before the end', () => {
    expect(remainingSeconds(s, 0, START + 599_100)).toBe(1)
  })

  it('is 0 at the end and never negative afterwards', () => {
    expect(remainingSeconds(s, 0, START + 600_000)).toBe(0)
    expect(remainingSeconds(s, 0, START + 9_999_000)).toBe(0)
  })

  it('uses the server clock: a device that is 2 minutes behind still shows the server countdown', () => {
    // The device clock reads 2 minutes before the server, so the offset is +120 s.
    expect(remainingSeconds(s, 120_000, START - 120_000 + 100_000)).toBe(500)
  })

  it('is 0 for an unreadable start time', () => {
    expect(remainingSeconds(session({ started_at: 'nope' }), 0, START)).toBe(0)
  })
})

describe('sessionProgress', () => {
  const s = session()

  it('runs from 0 to 1', () => {
    expect(sessionProgress(s, 0, START)).toBe(0)
    expect(sessionProgress(s, 0, START + 300_000)).toBe(0.5)
    expect(sessionProgress(s, 0, START + 600_000)).toBe(1)
  })

  it('stays between 0 and 1 outside the session', () => {
    expect(sessionProgress(s, 0, START - 50_000)).toBe(0)
    expect(sessionProgress(s, 0, START + 5_000_000)).toBe(1)
  })

  it('is 1 for a session with no duration', () => {
    expect(sessionProgress(session({ duration_seconds: 0 }), 0, START)).toBe(1)
  })

  it('agrees with remainingSeconds', () => {
    const now = START + 150_000
    expect(sessionProgress(s, 0, now)).toBe(0.25)
    expect(remainingSeconds(s, 0, now)).toBe(450)
  })
})

describe('sessionEndsAtMs', () => {
  it('is the start plus the duration, moved by the server offset', () => {
    expect(sessionEndsAtMs(session(), 0)).toBe(START + 600_000)
    expect(sessionEndsAtMs(session(), 10_000)).toBe(START + 590_000)
  })
})

describe('nextDueCheckpoint', () => {
  it('is null before the first checkpoint', () => {
    expect(nextDueCheckpoint(session(), 0, START + 199_000)).toBeNull()
  })

  it('returns the checkpoint once it is due', () => {
    expect(nextDueCheckpoint(session(), 0, START + 200_000)?.at_seconds).toBe(200)
  })

  it('is null when the due checkpoint is already done', () => {
    const s = session({
      checkpoints: [
        { at_seconds: 200, needs_location: true, done: true },
        { at_seconds: 400, needs_location: true, done: false },
        { at_seconds: 600, needs_location: true, done: false },
      ],
    })
    expect(nextDueCheckpoint(s, 0, START + 250_000)).toBeNull()
  })

  it('looks at the LATEST due checkpoint, because the server credits a reading to that one', () => {
    // 200 was missed and is still not done, but 400 is now due: the app checks 400 (200 can never be fixed).
    const result = nextDueCheckpoint(session(), 0, START + 410_000)
    expect(result?.at_seconds).toBe(400)
  })

  it('does not chase a missed earlier checkpoint once a later one is done', () => {
    const s = session({
      checkpoints: [
        { at_seconds: 200, needs_location: true, done: false },
        { at_seconds: 400, needs_location: true, done: true },
        { at_seconds: 600, needs_location: true, done: false },
      ],
    })
    expect(nextDueCheckpoint(s, 0, START + 450_000)).toBeNull()
  })

  it('returns the final checkpoint at the end', () => {
    expect(nextDueCheckpoint(session(), 0, START + 600_000)?.at_seconds).toBe(600)
  })

  it('works for a session with a single checkpoint and no location needed', () => {
    const s = session({ interval_seconds: 0, checkpoints: [{ at_seconds: 900, needs_location: false, done: false }] })
    expect(nextDueCheckpoint(s, 0, START + 899_000)).toBeNull()
    expect(nextDueCheckpoint(s, 0, START + 900_000)?.needs_location).toBe(false)
  })

  it('respects the server offset', () => {
    // The device clock is 100 s ahead of the server (offset -100 s), so the first check is due 100 s sooner on the device.
    expect(nextDueCheckpoint(session(), -100_000, START + 101_000)).toBeNull()
    expect(nextDueCheckpoint(session(), -100_000, START + 300_000)?.at_seconds).toBe(200)
  })

  it('is null when there are no checkpoints', () => {
    expect(nextDueCheckpoint(session({ checkpoints: [] }), 0, START + 999_000)).toBeNull()
  })
})
