import { supabase } from './supabaseClient'

/**
 * Reads and writes Showups in the Supabase `public.showups` table. This is the only file that
 * queries that table.
 *
 * What the database guarantees: the Showup belongs to the signed-in user, points at one of THEIR
 * OWN active gyms, and gets its timestamp from the server. What it cannot guarantee is where the
 * person really was: the distance comes from the browser (see docs/DATABASE_SCHEMA.md).
 */

export type CountResult = { status: 'ok'; count: number } | { status: 'error'; message: string }
export type RecordResult = { status: 'recorded' } | { status: 'error'; message: string }

function describeError(error: { message?: string }): string {
  if (/failed to fetch|network|load failed|timed? ?out/i.test(error.message ?? '')) {
    return "We couldn't reach the server. Check your connection and try again."
  }
  return 'Something went wrong while talking to the server. Please try again.'
}

/** How many Showups the signed-in user has. The count comes from the database, never a stored total. */
export async function fetchShowupCount(): Promise<CountResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    // `head: true` asks only for the count, not the rows.
    const { count, error } = await supabase.from('showups').select('id', { count: 'exact', head: true })
    if (error) {
      console.error('Could not count Showups', error)
      return { status: 'error', message: describeError(error) }
    }
    return { status: 'ok', count: count ?? 0 }
  } catch (error) {
    console.error('Unexpected error counting Showups', error)
    return { status: 'error', message: describeError({ message: error instanceof Error ? error.message : '' }) }
  }
}

/** Records one successful Showup at `gymId`. Distances are stored as whole metres. */
export async function recordShowup(details: {
  gymId: string
  distanceMetres: number
  accuracyMetres: number
}): Promise<RecordResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { error } = await supabase.from('showups').insert({
      gym_id: details.gymId,
      distance_meters: Math.max(0, Math.round(details.distanceMetres)),
      location_accuracy_meters: Math.max(0, Math.round(details.accuracyMetres)),
    })
    if (error) {
      console.error('Could not record the Showup', error)
      return { status: 'error', message: describeError(error) }
    }
    return { status: 'recorded' }
  } catch (error) {
    console.error('Unexpected error recording the Showup', error)
    return { status: 'error', message: describeError({ message: error instanceof Error ? error.message : '' }) }
  }
}
