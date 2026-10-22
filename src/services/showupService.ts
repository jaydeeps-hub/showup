import { supabase } from './supabaseClient'

/**
 * Reads and writes Showups in Supabase. This is the only file that queries the `public.showups` table
 * or calls `record_showup`.
 *
 * Recording goes through the database function `record_showup`, which measures the distance ITSELF
 * from the position it is given, using the distance limit in the database config. So a modified app
 * cannot skip the distance check. The database also ties the Showup to the signed-in user and one of
 * THEIR OWN active gyms, and sets the time and the user's local date. It still cannot prove the
 * position is real (a device can report a false location); see docs/DATABASE_SCHEMA.md.
 */

export type CountResult = { status: 'ok'; count: number } | { status: 'error'; message: string }
export type RecordResult =
  /** A new Showup was saved. */
  | { status: 'recorded' }
  /** The user already showed up today. This is not an error: one Showup counts per day. */
  | { status: 'already-recorded' }
  /** The database measured the position and it is further from the gym than allowed. */
  | { status: 'too-far' }
  | { status: 'error'; message: string }

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

/**
 * Asks the database to record a Showup at `gymId` from the given position. The database returns
 * true when a new Showup was saved and false when today already had one.
 */
export async function recordShowup(details: {
  gymId: string
  latitude: number
  longitude: number
  accuracyMetres: number
}): Promise<RecordResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { data, error } = await supabase.rpc('record_showup', {
      p_gym: details.gymId,
      p_lat: details.latitude,
      p_lng: details.longitude,
      p_accuracy: Math.max(0, Math.round(details.accuracyMetres)),
    })
    if (error) {
      // The database raises exactly 'too_far' when the measured distance is over the limit.
      if (/too_far/.test(error.message ?? '')) return { status: 'too-far' }
      console.error('Could not record the Showup', error)
      return { status: 'error', message: describeError(error) }
    }
    return data === true ? { status: 'recorded' } : { status: 'already-recorded' }
  } catch (error) {
    console.error('Unexpected error recording the Showup', error)
    return { status: 'error', message: describeError({ message: error instanceof Error ? error.message : '' }) }
  }
}
