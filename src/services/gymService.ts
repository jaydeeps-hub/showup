import type { Gym, SelectedPlace } from '../types'
import { PRIMARY_GYM_LABEL } from '../config/constants'
import { supabase } from './supabaseClient'

/**
 * Reads and writes the signed-in user's gyms in the Supabase `public.gyms` table. This is the only
 * file that queries that table. Row Level Security means the database only ever returns or accepts
 * the signed-in user's own rows (see docs/DATABASE_SCHEMA.md).
 *
 * A user has many gyms over time but only ONE ACTIVE one. Changing gym deactivates the old row and
 * adds a new one, so Showups recorded at the old gym keep pointing at it.
 */

/** The columns we read, in the database's own snake_case names. */
interface GymRow {
  id: string
  user_id: string
  name: string
  google_place_id: string | null
  address: string | null
  latitude: number
  longitude: number
  created_at: string
}

const GYM_COLUMNS = 'id, user_id, name, google_place_id, address, latitude, longitude, created_at'

export type GymResult = { status: 'ok'; gym: Gym | null } | { status: 'error'; message: string }

function toGym(row: GymRow): Gym {
  return {
    id: row.id,
    userId: row.user_id,
    label: PRIMARY_GYM_LABEL,
    googlePlaceId: row.google_place_id,
    name: row.name,
    formattedAddress: row.address ?? '',
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
  }
}

function describeError(error: { message?: string }): string {
  if (/failed to fetch|network|load failed|timed? ?out/i.test(error.message ?? '')) {
    return "We couldn't reach the server. Check your connection and try again."
  }
  return 'Something went wrong while talking to the server. Please try again.'
}

/** Loads the user's active gym, or `null` when they have not chosen one yet. */
export async function fetchActiveGym(): Promise<GymResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  try {
    const { data, error } = await supabase
      .from('gyms')
      .select(GYM_COLUMNS)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<GymRow>()
    if (error) {
      console.error('Could not load the gym', error)
      return { status: 'error', message: describeError(error) }
    }
    return { status: 'ok', gym: data ? toGym(data) : null }
  } catch (error) {
    console.error('Unexpected error loading the gym', error)
    return { status: 'error', message: describeError({ message: error instanceof Error ? error.message : '' }) }
  }
}

/**
 * Saves `place` as the user's active gym. Any gym they had becomes inactive (kept as history).
 *
 * The order matters: the database allows only one active gym per user, so the old gym is
 * deactivated first. If adding the new gym then fails, the old one is switched back on so the
 * user is never left without a gym.
 */
export async function saveActiveGym(place: SelectedPlace): Promise<GymResult> {
  if (!supabase) return { status: 'error', message: 'Supabase is not configured.' }
  const client = supabase

  let deactivatedIds: string[] = []
  try {
    const deactivated = await client.from('gyms').update({ is_active: false }).eq('is_active', true).select('id')
    if (deactivated.error) {
      console.error('Could not retire the previous gym', deactivated.error)
      return { status: 'error', message: describeError(deactivated.error) }
    }
    deactivatedIds = (deactivated.data ?? []).map((row: { id: string }) => row.id)

    const inserted = await client
      .from('gyms')
      .insert({
        name: place.name,
        google_place_id: place.googlePlaceId,
        address: place.formattedAddress,
        latitude: place.latitude,
        longitude: place.longitude,
      })
      .select(GYM_COLUMNS)
      .single<GymRow>()

    if (inserted.error) {
      console.error('Could not save the gym', inserted.error)
      await restoreGyms(client, deactivatedIds)
      return { status: 'error', message: describeError(inserted.error) }
    }
    return { status: 'ok', gym: toGym(inserted.data) }
  } catch (error) {
    console.error('Unexpected error saving the gym', error)
    await restoreGyms(client, deactivatedIds)
    return { status: 'error', message: describeError({ message: error instanceof Error ? error.message : '' }) }
  }
}

/** Puts back gyms that were switched off, after a failed save. Best effort: never throws. */
async function restoreGyms(client: NonNullable<typeof supabase>, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    const { error } = await client.from('gyms').update({ is_active: true }).in('id', ids)
    if (error) console.error('Could not restore the previous gym', error)
  } catch (error) {
    console.error('Could not restore the previous gym', error)
  }
}
