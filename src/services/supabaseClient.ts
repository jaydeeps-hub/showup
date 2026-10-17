import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config/constants'

/** True when `.env.local` contains both Supabase settings. */
export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== ''

/**
 * The one shared Supabase client for the whole app. It is `null` when the settings are
 * missing, so the app can show a setup message instead of crashing on startup.
 *
 * It uses the PUBLISHABLE key, which is safe in the browser. Never use a secret or
 * service_role key here: anything in frontend code is visible to every visitor.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        // PKCE is the recommended OAuth flow for browser apps: the redirect carries a one-time
        // code instead of the tokens themselves.
        flowType: 'pkce',
        persistSession: true, // keeps you signed in across page reloads (stored in localStorage)
        autoRefreshToken: true,
        detectSessionInUrl: true, // finishes the Google sign-in when Google sends the user back
      },
    })
  : null
