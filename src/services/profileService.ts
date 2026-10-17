import type { PlaceSearchMode, Profile, ProfileEdits } from '../types'
import { supabase } from './supabaseClient'

/**
 * Reads the signed-in user's row from `public.profiles`. This is the only file that queries
 * that table, so screens never contain database code.
 *
 * Authentication (who is signed in) lives in authService.ts and is deliberately separate:
 * a user can be signed in even if their profile cannot be loaded.
 */

/** The database columns we read, in the database's own snake_case names. */
interface ProfileRow {
  id: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  is_admin: boolean
  place_search_mode: string
  created_at: string
  updated_at: string
}

const PROFILE_COLUMNS = 'id, first_name, last_name, date_of_birth, is_admin, place_search_mode, created_at, updated_at'

export type ProfileResult =
  | { status: 'found'; profile: Profile }
  /** Signed in, but no profile row exists. Normally the database trigger prevents this. */
  | { status: 'not-found' }
  | { status: 'error'; message: string }

/**
 * The mode that applies to this profile. Anything unexpected, or any mode for a non-administrator
 * other than the default, becomes the restrictive `fitness_only`. The database enforces the same
 * rule; doing it here too means a stale or odd value can never widen the search in the interface.
 */
function toEffectiveMode(row: Pick<ProfileRow, 'is_admin' | 'place_search_mode'>): PlaceSearchMode {
  return row.is_admin && row.place_search_mode === 'any_place' ? 'any_place' : 'fitness_only'
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    isAdmin: row.is_admin,
    placeSearchMode: toEffectiveMode(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Loads the profile for `userId`. Row Level Security means the database only ever returns
 * the signed-in user's own row, so asking for anyone else's simply finds nothing.
 */
export async function fetchProfile(userId: string): Promise<ProfileResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  if (error) {
    console.error('Could not load the profile', error)
    return { status: 'error', message: error.message }
  }
  return data ? { status: 'found', profile: toProfile(data) } : { status: 'not-found' }
}

export type SaveProfileResult = { status: 'saved'; profile: Profile } | { status: 'error'; message: string }

/** Turns a database or network error into a message a user can act on. Details go to the console. */
function describeSaveError(error: { message?: string; code?: string }): string {
  if (error.code === '23514') {
    return "Those details weren't accepted. Check your names and birthday and try again."
  }
  if (/failed to fetch|network|load failed|timed? ?out/i.test(error.message ?? '')) {
    return "We couldn't reach the server. Check your connection and try again."
  }
  return "We couldn't save your changes. Please try again."
}

/**
 * Saves the user's name and birthday to their EXISTING profile row (an UPDATE, never an
 * insert, so duplicates are impossible). Only the three editable columns are ever sent.
 * `is_admin` is not part of `ProfileEdits`, and the database refuses to let app users
 * write it anyway (column privileges, see docs/DATABASE_SCHEMA.md).
 */
export async function updateProfile(userId: string, edits: ProfileEdits): Promise<SaveProfileResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name: edits.firstName,
        last_name: edits.lastName,
        date_of_birth: edits.dateOfBirth,
      })
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle<ProfileRow>()

    if (error) {
      console.error('Could not save the profile', error)
      return { status: 'error', message: describeSaveError(error) }
    }
    // Zero rows updated: no profile row for this user (or the row is not theirs).
    if (!data) {
      return {
        status: 'error',
        message: "We couldn't find your profile to update. Try signing out and back in.",
      }
    }
    return { status: 'saved', profile: toProfile(data) }
  } catch (error) {
    // A network failure can also surface as a thrown error.
    console.error('Unexpected error saving the profile', error)
    return { status: 'error', message: describeSaveError({ message: error instanceof Error ? error.message : '' }) }
  }
}

export type SaveSearchModeResult = { status: 'saved'; mode: PlaceSearchMode } | { status: 'error'; message: string }

/**
 * Asks the database to change the signed-in user's place search mode. The database function
 * `set_place_search_mode` is the real gatekeeper: it refuses `any_place` unless the caller's
 * profile has is_admin = true, whatever this app does. The app never sends or changes is_admin.
 */
export async function updatePlaceSearchMode(mode: PlaceSearchMode): Promise<SaveSearchModeResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }

  try {
    const { data, error } = await supabase.rpc('set_place_search_mode', { new_mode: mode })

    if (error) {
      console.error('Could not change the place search mode', error)
      if (error.code === '42501') {
        return { status: 'error', message: 'Only administrators can search any place.' }
      }
      if (/failed to fetch|network|load failed|timed? ?out/i.test(error.message ?? '')) {
        return { status: 'error', message: "We couldn't reach the server. Check your connection and try again." }
      }
      return { status: 'error', message: "We couldn't change this setting. Please try again." }
    }
    // Trust what the database confirms, not what we asked for.
    return { status: 'saved', mode: data === 'any_place' ? 'any_place' : 'fitness_only' }
  } catch (error) {
    console.error('Unexpected error changing the place search mode', error)
    return { status: 'error', message: "We couldn't reach the server. Check your connection and try again." }
  }
}
