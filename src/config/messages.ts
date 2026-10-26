import type { ToastContent } from '../components/Toast'
import type { ShowupEvent } from '../services/showupEngine'
import { PRIMARY_GYM_LABEL } from './constants'

/**
 * Everything the user is told about a Show Up lives here, in one function, so the mascot can replace
 * it later without touching the screens. Plain text for now.
 *
 * `totalShowups` is the user's Showup count after a visit finished (from get_home_summary). It is only
 * needed for `completed`; without it that message falls back to the plain version.
 */
export function showupMessage(event: ShowupEvent, totalShowups?: number | null): ToastContent {
  switch (event.type) {
    case 'completed':
      // `recorded: false` means the day already had a Showup, so nothing new was added.
      if (event.recorded === false) return { severity: 'success', message: 'Already counted today' }
      return {
        severity: 'success',
        message: totalShowups != null ? `You showed up. Showup #${totalShowups}` : 'You showed up.',
      }
    case 'already_done':
      return { severity: 'success', message: 'You already showed up today.' }
    case 'left_early':
      return { severity: 'error', message: "You left before the timer finished. It's been reset." }
    case 'missed_checks':
      return {
        severity: 'error',
        message: "We couldn't confirm you stayed. Keep Showup open with the screen on until the timer ends.",
      }
    case 'expired':
      return { severity: 'error', message: 'That timer expired. Tap Show up to start again.' }
    case 'cancelled':
      return { severity: 'success', message: 'Timer stopped. Tap Show up to start again.' }
    case 'too_far':
      return { severity: 'error', message: `You're not at your saved gym. Please go to ${PRIMARY_GYM_LABEL} and try again.` }
    case 'poor_accuracy':
      return { severity: 'error', message: 'Your location signal is weak. Try near a window or outside.' }
    case 'location_denied':
      return { severity: 'error', message: 'Location is off for Showup. Allow it in your browser settings, then try again.' }
    case 'location_unavailable':
      return { severity: 'error', message: "Couldn't get your location. Try again." }
    case 'error':
      return { severity: 'error', message: 'Something went wrong. Try again.' }
  }
}
