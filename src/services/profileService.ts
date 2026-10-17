import type { Profile, ProfileEdits } from '../types'
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
  created_at: string
  updated_at: string
}

const PROFILE_COLUMNS = 'id, first_name, last_name, date_of_birth, is_admin, created_at, updated_at'

export type ProfileResult =
  | { status: 'found'; profile: Profile }
  /** Signed in, but no profile row exists. Normally the database trigger prevents this. */
  | { status: 'not-found' }
  | { status: 'error'; message: string }

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    isAdmin: row.is_admin,
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
