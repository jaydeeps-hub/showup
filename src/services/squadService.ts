import type { SearchResult, SquadMember, SquadPerson, SquadRelation, SquadRequest, SquadState } from '../types'
import { isRecord, toCount } from '../utils/jsonShape'
import { supabase } from './supabaseClient'

/**
 * The Squad, through the six database functions in docs/backend/phase12a_squad.sql. This is the only file that calls
 * them. The other person is always given by USERNAME, never by id; the database looks them up and works out the rest.
 *
 * Every reply is checked against the contract. A reply in an unexpected form is an ERROR, never a made-up empty
 * answer: an empty squad and a squad that failed to load must never look the same.
 */

/** A failure the screen can show as it is. */
export interface SquadFailure {
  status: 'error'
  message: string
  /** The database's code (for example `squad_full`), or null for a network failure or an unreadable reply. */
  code: string | null
}

export type SearchPeopleResult = { status: 'ok'; query: string; results: SearchResult[] } | SquadFailure
export type SendRequestResult = { status: 'requested' } | { status: 'squad' } | SquadFailure
export type RespondResult = { status: 'squad' } | { status: 'declined' } | SquadFailure
/** `done` is false when there was nothing to do (no such request, or not squad-mates). */
export type ToggleResult = { status: 'ok'; done: boolean } | SquadFailure
export type GetSquadResult = { status: 'ok'; squad: SquadState } | SquadFailure

export const SQUAD_GENERIC_ERROR = 'Something went wrong. Try again.'

/** Every code the squad functions raise (docs/backend/phase12a_squad.sql). Any other text is not one of their codes. */
export const SQUAD_ERROR_CODES = [
  'not_signed_in',
  'username_required',
  'user_not_found',
  'cannot_add_self',
  'already_in_squad',
  'already_requested',
  'squad_full',
  'their_squad_full',
  'request_cooldown',
  'too_many_requests',
  'invalid_answer',
  'no_request',
] as const

// --- Error texts --------------------------------------------------------------------------------------------------

/** The text for a squad error. `maxSize` fills in "max N" when the caller knows the limit (from get_squad). */
export function describeSquadError(error: { message?: string }, maxSize?: number): { message: string; code: string | null } {
  const raw = error.message ?? ''
  // The database's message starts with its code; match only the start, so a code mentioned inside other text is not
  // mistaken for one.
  const word = /^([a-z_]+)(?::|\b)/.exec(raw)?.[1]
  const code = word !== undefined && (SQUAD_ERROR_CODES as readonly string[]).includes(word) ? word : null

  switch (code) {
    case 'user_not_found':
      return { message: "We couldn't find that person.", code }
    case 'cannot_add_self':
      return { message: "That's you!", code }
    case 'already_requested':
      return { message: 'Request already sent.', code }
    case 'already_in_squad':
      return { message: 'Already in your squad.', code }
    case 'request_cooldown': {
      const days = /^request_cooldown:\s*(\d+)\s*day/.exec(raw)?.[1]
      return { message: days ? `You can ask again in ${days} day(s).` : 'You can ask again later.', code }
    }
    case 'squad_full':
      return { message: maxSize !== undefined && maxSize > 0 ? `Your squad is full (max ${maxSize}).` : 'Your squad is full.', code }
    case 'their_squad_full':
      return { message: 'Their squad is full.', code }
    case 'too_many_requests':
      return { message: 'You have too many requests waiting. Cancel some first.', code }
    case 'no_request':
      return { message: 'That request is no longer there.', code }
    case 'username_required':
      return { message: 'Set a username on Profile first.', code }
    default:
      // not_signed_in, invalid_answer, a network failure, anything new: the generic text. The code is kept (if it
      // was one) so a screen can still tell what happened.
      return { message: SQUAD_GENERIC_ERROR, code }
  }
}

function failure(error: { message?: string }, maxSize?: number): SquadFailure {
  return { status: 'error', ...describeSquadError(error, maxSize) }
}

/** A reply that does not match the contract. */
function malformed(what: string, data: unknown): SquadFailure {
  console.error(`The ${what} reply had an unexpected shape`, data)
  return { status: 'error', message: SQUAD_GENERIC_ERROR, code: null }
}

/** A thrown error (often the network). */
function thrown(what: string, error: unknown): SquadFailure {
  console.error(`Unexpected error: ${what}`, error)
  return failure({ message: error instanceof Error ? error.message : '' })
}

// --- Reading the replies ------------------------------------------------------------------------------------------

/** Text or null; anything else (a number, an object) is invalid. Undefined counts as null (the key was left out). */
function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : undefined
}

/** A person: a non-empty username, and names that are text or null. Null if it does not match. */
function parsePerson(raw: unknown): SquadPerson | null {
  if (!isRecord(raw) || typeof raw.username !== 'string' || raw.username === '') return null
  const firstName = nullableText(raw.first_name)
  const lastName = nullableText(raw.last_name)
  if (firstName === undefined || lastName === undefined) return null
  return { username: raw.username, firstName, lastName }
}

const RELATIONS: readonly SquadRelation[] = ['none', 'requested', 'incoming', 'squad']

export function parseSearchResult(raw: unknown): SearchResult | null {
  const person = parsePerson(raw)
  if (!person || !isRecord(raw) || !RELATIONS.includes(raw.relation as SquadRelation)) return null
  return { ...person, relation: raw.relation as SquadRelation }
}

export function parseSquadMember(raw: unknown): SquadMember | null {
  const person = parsePerson(raw)
  if (!person || !isRecord(raw)) return null
  const totalShowups = toCount(raw.total_showups)
  const weeksInARow = toCount(raw.weeks_in_a_row)
  const since = nullableText(raw.since)
  if (totalShowups === null || weeksInARow === null || since === undefined) return null
  return { ...person, since, totalShowups, weeksInARow }
}

export function parseSquadRequest(raw: unknown): SquadRequest | null {
  const person = parsePerson(raw)
  if (!person || !isRecord(raw) || typeof raw.requested_at !== 'string' || raw.requested_at === '') return null
  return { ...person, requestedAt: raw.requested_at }
}

/** Every item must parse; one bad item makes the whole list invalid (never a silently shorter list). */
function parseList<T>(value: unknown, parse: (raw: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const items: T[] = []
  for (const raw of value) {
    const item = parse(raw)
    if (item === null) return null
    items.push(item)
  }
  return items
}

export function parseSquadState(raw: unknown): SquadState | null {
  if (!isRecord(raw)) return null
  const squadCount = toCount(raw.squad_count)
  const maxSize = toCount(raw.max_size)
  const incomingCount = toCount(raw.incoming_count)
  const squad = parseList(raw.squad, parseSquadMember)
  const incoming = parseList(raw.incoming, parseSquadRequest)
  const outgoing = parseList(raw.outgoing, parseSquadRequest)
  if (squadCount === null || maxSize === null || incomingCount === null || !squad || !incoming || !outgoing) return null
  return { squadCount, maxSize, incomingCount, squad, incoming, outgoing }
}

export function parseSearchReply(raw: unknown): { query: string; results: SearchResult[] } | null {
  if (!isRecord(raw) || typeof raw.query !== 'string') return null
  const results = parseList(raw.results, parseSearchResult)
  return results ? { query: raw.query, results } : null
}

// --- The six calls ------------------------------------------------------------------------------------------------

export async function searchPeople(query: string): Promise<SearchPeopleResult> {
  if (!supabase) return { status: 'error', message: SQUAD_GENERIC_ERROR, code: null }
  try {
    const { data, error } = await supabase.rpc('search_people', { p_query: query })
    if (error) {
      console.error('Could not search people', error)
      return failure(error)
    }
    const reply = parseSearchReply(data)
    return reply ? { status: 'ok', ...reply } : malformed('search_people', data)
  } catch (error) {
    return thrown('searching people', error)
  }
}

/** Asks `username` to join your squad. `squad` means they had already asked you, so you are squad-mates now. */
export async function sendSquadRequest(username: string, maxSize?: number): Promise<SendRequestResult> {
  if (!supabase) return { status: 'error', message: SQUAD_GENERIC_ERROR, code: null }
  try {
    const { data, error } = await supabase.rpc('send_squad_request', { p_username: username })
    if (error) {
      console.error('Could not send the squad request', error)
      return failure(error, maxSize)
    }
    if (isRecord(data) && (data.status === 'requested' || data.status === 'squad')) return { status: data.status }
    return malformed('send_squad_request', data)
  } catch (error) {
    return thrown('sending a squad request', error)
  }
}

/** Accepts (true) or declines (false) a request `username` sent you. */
export async function respondSquadRequest(username: string, accept: boolean, maxSize?: number): Promise<RespondResult> {
  if (!supabase) return { status: 'error', message: SQUAD_GENERIC_ERROR, code: null }
  try {
    const { data, error } = await supabase.rpc('respond_squad_request', { p_username: username, p_accept: accept })
    if (error) {
      console.error('Could not answer the squad request', error)
      return failure(error, maxSize)
    }
    if (isRecord(data) && (data.status === 'squad' || data.status === 'declined')) return { status: data.status }
    return malformed('respond_squad_request', data)
  } catch (error) {
    return thrown('answering a squad request', error)
  }
}

async function callToggle(name: 'cancel_squad_request' | 'remove_from_squad', username: string, what: string): Promise<ToggleResult> {
  if (!supabase) return { status: 'error', message: SQUAD_GENERIC_ERROR, code: null }
  try {
    const { data, error } = await supabase.rpc(name, { p_username: username })
    if (error) {
      console.error(`Could not ${what}`, error)
      return failure(error)
    }
    return typeof data === 'boolean' ? { status: 'ok', done: data } : malformed(name, data)
  } catch (error) {
    return thrown(what, error)
  }
}

/** Takes back a request you sent. `done` is false when there was none to take back. */
export function cancelSquadRequest(username: string): Promise<ToggleResult> {
  return callToggle('cancel_squad_request', username, 'cancel the squad request')
}

/** Leaves `username`'s squad (both stop seeing each other). `done` is false when you were not squad-mates. */
export function removeFromSquad(username: string): Promise<ToggleResult> {
  return callToggle('remove_from_squad', username, 'remove from the squad')
}

/** The whole Squad page: the squad with its stats, and the requests both ways. */
export async function getSquad(): Promise<GetSquadResult> {
  if (!supabase) return { status: 'error', message: SQUAD_GENERIC_ERROR, code: null }
  try {
    const { data, error } = await supabase.rpc('get_squad')
    if (error) {
      console.error('Could not load the squad', error)
      return failure(error)
    }
    const squad = parseSquadState(data)
    return squad ? { status: 'ok', squad } : malformed('get_squad', data)
  } catch (error) {
    return thrown('loading the squad', error)
  }
}
