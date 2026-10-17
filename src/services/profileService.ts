import type { Profile } from '../types'
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
