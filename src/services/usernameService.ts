import type { UsernameCheck } from '../types'
import { isRecord } from '../utils/jsonShape'
import {
  USERNAME_SAVE_FAILED,
  usernameProblemMessage,
  usernameTakenMessage,
  type UsernameProblem,
} from '../utils/username'
import { supabase } from './supabaseClient'

/**
 * Usernames, through the two database functions from docs/backend/phase11a_username.sql: `is_username_available`
 * (the live "is it free?" check) and `set_username` (the ONLY way a username is set or changed). This is the only file
 * that calls them. The app never writes `profiles.username` itself; a database guard refuses it.
 */

export type CheckUsernameResult = { status: 'ok'; check: UsernameCheck } | { status: 'error' }

/**
 * `saved`: the database now holds `username` (`changed` is false when it already did). `error`: what to tell the
 * person; `taken` is true for a name someone else has, so the screen can run the check again to offer a suggestion.
 */
export type SaveUsernameResult =
  | { status: 'saved'; username: string; changed: boolean }
  | { status: 'error'; message: string; taken: boolean }

const REASONS = ['own', 'empty', 'too_short', 'too_long', 'invalid_format', 'taken'] as const

/** Turns the database's JSON into a UsernameCheck, or null if it is not in the expected form. */
export function parseUsernameCheck(raw: unknown): UsernameCheck | null {
  if (!isRecord(raw) || typeof raw.username !== 'string' || typeof raw.available !== 'boolean') return null
  const reason = raw.reason === null || raw.reason === undefined ? null : raw.reason
  if (reason !== null && !REASONS.includes(reason as (typeof REASONS)[number])) return null
  return {
    username: raw.username,
    available: raw.available,
    reason: reason as UsernameCheck['reason'],
    suggestion: typeof raw.suggestion === 'string' && raw.suggestion !== '' ? raw.suggestion : null,
  }
}

/**
 * Asks the database whether `value` can be used. Any failure (no connection, the server refusing, a reply in an
 * unexpected form) is `error`, never "taken": the hook then says it could not check and does not let the name pass.
 */
export async function checkUsername(value: string): Promise<CheckUsernameResult> {
  if (!supabase) return { status: 'error' }
  try {
    const { data, error } = await supabase.rpc('is_username_available', { p_username: value })
    if (error) {
      console.error('Could not check the username', error)
      return { status: 'error' }
    }
    const check = parseUsernameCheck(data)
    if (!check) {
      console.error('The username check had an unexpected shape', data)
      return { status: 'error' }
    }
    return { status: 'ok', check }
  } catch (error) {
    console.error('Unexpected error checking the username', error)
    return { status: 'error' }
  }
}

/** What set_username's error means for the person. `value` is the name they tried, for the "taken" text. */
export function describeSaveUsernameError(error: { message?: string }, value: string): { message: string; taken: boolean } {
  const message = error.message ?? ''
  // The database's message starts with its code; match the start so a code inside other text is not mistaken for one.
  if (/^username_taken\b/.test(message)) return { message: usernameTakenMessage(value, null), taken: true }

  const cooldown = /^username_cooldown:\s*(\d+)\s*day/.exec(message)
  if (cooldown) return { message: `You can change your username again in ${cooldown[1]} day(s).`, taken: false }

  const invalid = /^invalid_username:\s*([a-z_]+)/.exec(message)
  if (invalid) {
    const problem = invalid[1] as UsernameProblem
    if (problem === 'empty' || problem === 'too_short' || problem === 'too_long' || problem === 'invalid_format') {
      return { message: usernameProblemMessage(problem), taken: false }
    }
  }
  return { message: USERNAME_SAVE_FAILED, taken: false }
}

/**
 * Sets or changes the signed-in person's username. The database cleans the value, checks it again (format, reserved
 * names, someone else having it, the cooldown between changes) and is the final word.
 */
export async function saveUsername(value: string): Promise<SaveUsernameResult> {
  if (!supabase) return { status: 'error', message: USERNAME_SAVE_FAILED, taken: false }
  try {
    const { data, error } = await supabase.rpc('set_username', { p_username: value })
    if (error) {
      console.error('Could not save the username', error)
      return { status: 'error', ...describeSaveUsernameError(error, value) }
    }
    if (!isRecord(data) || typeof data.username !== 'string' || typeof data.changed !== 'boolean') {
      console.error('Saving the username gave an unexpected shape', data)
      return { status: 'error', message: USERNAME_SAVE_FAILED, taken: false }
    }
    return { status: 'saved', username: data.username, changed: data.changed }
  } catch (error) {
    console.error('Unexpected error saving the username', error)
    return { status: 'error', message: USERNAME_SAVE_FAILED, taken: false }
  }
}
