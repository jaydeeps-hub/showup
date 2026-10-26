import type {
  CheckResult,
  CheckShowupResult,
  DevicePosition,
  SessionCheckpoint,
  SessionStatus,
  ShowupSession,
  ShowupState,
  StartShowupResult,
} from '../types'
import { isRecord, toCount } from '../utils/jsonShape'
import { supabase } from './supabaseClient'

/**
 * Calls the four timed-Show-Up database functions (`get_showup_state`, `start_showup`, `check_showup`,
 * `cancel_showup`). This is the only file that does. The answers are checked before they are used:
 * anything unexpected becomes an error instead of a half-built session.
 *
 * Every call returns `{ ok: true, ... }` or `{ ok: false, error }`; nothing here throws. `error` is
 * the CODE the database raised (the text before the first colon, for example `too_far` or
 * `poor_accuracy`), or `network` / `unexpected` / `not_configured` when the call itself failed. The
 * engine decides what each code means; raw database text never reaches the screen.
 */

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; error: string }

const SESSION_STATUSES: readonly SessionStatus[] = ['running', 'completed', 'left_early', 'missed_checks', 'expired', 'cancelled']
const CHECK_RESULTS: readonly CheckResult[] = ['running', 'not_due', 'poor_accuracy', ...SESSION_STATUSES.filter((s) => s !== 'running')]

function parseCheckpoint(raw: unknown): SessionCheckpoint | null {
  if (!isRecord(raw)) return null
  const atSeconds = toCount(raw.at_seconds)
  if (atSeconds === null || typeof raw.needs_location !== 'boolean' || typeof raw.done !== 'boolean') return null
  return { at_seconds: atSeconds, needs_location: raw.needs_location, done: raw.done }
}

/** Turns the database's session JSON into a ShowupSession, or null if anything required is missing or wrong. */
export function parseSession(raw: unknown): ShowupSession | null {
  if (!isRecord(raw)) return null
  const status = SESSION_STATUSES.find((candidate) => candidate === raw.status)
  const elapsed = toCount(raw.elapsed_seconds)
  const duration = toCount(raw.duration_seconds)
  const interval = toCount(raw.interval_seconds)
  const maxMissed = toCount(raw.max_missed_checks)
  const checksDone = toCount(raw.location_checks_done)
  const checksTotal = toCount(raw.location_checks_total)
  if (
    typeof raw.session_id !== 'string' ||
    !status ||
    typeof raw.started_at !== 'string' ||
    Number.isNaN(Date.parse(raw.started_at)) ||
    typeof raw.server_now !== 'string' ||
    Number.isNaN(Date.parse(raw.server_now)) ||
    elapsed === null ||
    duration === null ||
    interval === null ||
    maxMissed === null ||
    checksDone === null ||
    checksTotal === null ||
    !Array.isArray(raw.checkpoints)
  ) {
    return null
  }
  const checkpoints = raw.checkpoints.map(parseCheckpoint)
  if (checkpoints.some((checkpoint) => checkpoint === null)) return null

  return {
    session_id: raw.session_id,
    status,
    started_at: raw.started_at,
    server_now: raw.server_now,
    elapsed_seconds: elapsed,
    duration_seconds: duration,
    interval_seconds: interval,
    max_missed_checks: maxMissed,
    checkpoints: checkpoints as SessionCheckpoint[],
    location_checks_done: checksDone,
    location_checks_total: checksTotal,
  }
}

/** `get_showup_state`'s JSON. A session of `null` is a real answer ("none running"). */
export function parseShowupState(raw: unknown): ShowupState | null {
  if (!isRecord(raw) || typeof raw.today !== 'string' || typeof raw.showed_up_today !== 'boolean') return null
  if (raw.session === null || raw.session === undefined) return { today: raw.today, showed_up_today: raw.showed_up_today, session: null }
  const session = parseSession(raw.session)
  return session ? { today: raw.today, showed_up_today: raw.showed_up_today, session } : null
}

/** `start_showup`'s JSON. */
export function parseStartResult(raw: unknown): StartShowupResult | null {
  if (!isRecord(raw) || typeof raw.already_done !== 'boolean') return null
  if (raw.session === null || raw.session === undefined) return { already_done: raw.already_done, session: null }
  const session = parseSession(raw.session)
  return session ? { already_done: raw.already_done, session } : null
}

/** `check_showup`'s JSON. */
export function parseCheckResult(raw: unknown): CheckShowupResult | null {
  if (!isRecord(raw)) return null
  const result = CHECK_RESULTS.find((candidate) => candidate === raw.result)
  const session = parseSession(raw.session)
  if (!result || !session) return null

  const parsed: CheckShowupResult = { result, session }
  if (typeof raw.check_passed === 'boolean') parsed.check_passed = raw.check_passed
  const next = toCount(raw.next_check_in_seconds)
  if (next !== null) parsed.next_check_in_seconds = next
  if (typeof raw.recorded === 'boolean') parsed.recorded = raw.recorded
  return parsed
}

/**
 * The code at the start of a database error message, e.g. `too_far` from "too_far" or `poor_accuracy`
 * from "poor_accuracy: the location signal is too weak". A network failure is `network`.
 */
export function errorCode(error: { message?: string }): string {
  const message = error.message ?? ''
  if (/failed to fetch|network|load failed|timed? ?out/i.test(message)) return 'network'
  return /^\s*([a-z_]+)/.exec(message)?.[1] ?? 'unexpected'
}

/** Runs one RPC and checks its answer with `parse`. */
async function callRpc<T>(name: string, args: Record<string, unknown> | undefined, parse: (raw: unknown) => T | null): Promise<ServiceResult<{ value: T }>> {
  if (!supabase) return { ok: false, error: 'not_configured' }
  try {
    const { data, error } = await supabase.rpc(name, args)
    if (error) {
      console.error(`${name} failed`, error)
      return { ok: false, error: errorCode(error) }
    }
    const value = parse(data)
    if (value === null) {
      console.error(`${name} returned an unexpected shape`, data)
      return { ok: false, error: 'unexpected' }
    }
    return { ok: true, value }
  } catch (error) {
    console.error(`Unexpected error in ${name}`, error)
    return { ok: false, error: errorCode({ message: error instanceof Error ? error.message : '' }) }
  }
}

export function getShowupState(): Promise<ServiceResult<{ value: ShowupState }>> {
  return callRpc('get_showup_state', undefined, parseShowupState)
}

export function startShowup(gymId: string, position: DevicePosition): Promise<ServiceResult<{ value: StartShowupResult }>> {
  return callRpc(
    'start_showup',
    { p_gym: gymId, p_lat: position.lat, p_lng: position.lng, p_accuracy: Math.max(0, Math.round(position.accuracy)) },
    parseStartResult,
  )
}

/** `position` is null for a session with no location checks (only the end counts). */
export function checkShowup(sessionId: string, position: DevicePosition | null): Promise<ServiceResult<{ value: CheckShowupResult }>> {
  return callRpc(
    'check_showup',
    position
      ? { p_session: sessionId, p_lat: position.lat, p_lng: position.lng, p_accuracy: Math.max(0, Math.round(position.accuracy)) }
      : { p_session: sessionId },
    parseCheckResult,
  )
}

/** True if a running session was cancelled, false if there was nothing to cancel. */
export function cancelShowup(sessionId: string): Promise<ServiceResult<{ value: boolean }>> {
  return callRpc('cancel_showup', { p_session: sessionId }, (raw) => (typeof raw === 'boolean' ? raw : null))
}
