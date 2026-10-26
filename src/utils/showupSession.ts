import type { SessionCheckpoint, ShowupSession } from '../types'

/**
 * Pure helpers for the timed Show Up session. No React, no network, no clock of their own: every
 * function takes "now" as a parameter, so they are easy to test.
 *
 * The SERVER is the clock. Every answer carries the server's `server_now`; the difference between it
 * and the device clock (the server offset) is applied to every time below, so a device with a wrong
 * clock still sees the same countdown as the server. Nothing here knows how long a session is or how
 * often it checks: all of that is read from the session.
 */

/** The server's clock minus the device's clock, in milliseconds, measured when an answer arrived. */
export function computeServerOffsetMs(serverNowIso: string, deviceNowMs: number): number {
  const serverNow = Date.parse(serverNowIso)
  return Number.isNaN(serverNow) ? 0 : serverNow - deviceNowMs
}

/** When a checkpoint is due, on the DEVICE's clock (what `Date.now()` will read at that moment). */
export function checkpointDueAtMs(session: ShowupSession, checkpoint: SessionCheckpoint, serverOffsetMs: number): number {
  return Date.parse(session.started_at) + checkpoint.at_seconds * 1000 - serverOffsetMs
}

/** When the session ends (the end is where the timer reaches `duration_seconds`), on the device's clock. */
export function sessionEndsAtMs(session: ShowupSession, serverOffsetMs: number): number {
  return Date.parse(session.started_at) + session.duration_seconds * 1000 - serverOffsetMs
}

/** Whole seconds left until the end, rounded up so the display never shows 0 before the end. Never negative. */
export function remainingSeconds(session: ShowupSession, serverOffsetMs: number, nowMs: number): number {
  const ms = sessionEndsAtMs(session, serverOffsetMs) - nowMs
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0
}

/** How far through the session we are, from 0 to 1. */
export function sessionProgress(session: ShowupSession, serverOffsetMs: number, nowMs: number): number {
  if (session.duration_seconds <= 0) return 1
  const total = session.duration_seconds * 1000
  const elapsed = total - (sessionEndsAtMs(session, serverOffsetMs) - nowMs)
  return Number.isFinite(elapsed) ? Math.min(1, Math.max(0, elapsed / total)) : 0
}

/** The countdown as people read it: "12:05", "2:05", or just seconds ("45") under a minute. */
export function formatRemaining(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return String(seconds)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * The checkpoint the engine should check right now, or null.
 *
 * The database credits a reading to the LATEST checkpoint that is due, so this looks at that one
 * only: if it already has a passing check there is nothing to do. An earlier checkpoint that was
 * missed can never be fixed afterwards (the server would just answer `not_due`), so chasing it would
 * only produce pointless calls.
 */
export function nextDueCheckpoint(session: ShowupSession, serverOffsetMs: number, nowMs: number): SessionCheckpoint | null {
  let latestDue: SessionCheckpoint | null = null
  for (const checkpoint of session.checkpoints) {
    if (checkpointDueAtMs(session, checkpoint, serverOffsetMs) > nowMs) continue
    if (latestDue === null || checkpoint.at_seconds > latestDue.at_seconds) latestDue = checkpoint
  }
  return latestDue !== null && !latestDue.done ? latestDue : null
}
