import { supabase } from './supabaseClient'

/**
 * Tells the database which time zone this device is in, through the `set_my_timezone` function.
 * Weeks, "today" and the date of each Showup are all worked out from `profiles.timezone`, so it
 * needs to match where the person really is.
 *
 * This never throws and never shows anything: if it fails (offline, an unknown zone name, the
 * function missing) the app carries on and the error only goes to the console.
 */
export async function saveDeviceTimezone(): Promise<void> {
  try {
    if (!supabase) return
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof timeZone !== 'string' || timeZone.trim() === '') return

    const { error } = await supabase.rpc('set_my_timezone', { p_tz: timeZone })
    if (error) console.error('Could not save the device time zone', error)
  } catch (error) {
    console.error('Unexpected error saving the device time zone', error)
  }
}
