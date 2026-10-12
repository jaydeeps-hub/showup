import type { GeolocationFailureReason, ShowupOutcome } from '../types'
import { GEOFENCE_RADIUS_METRES, PRIMARY_GYM_LABEL } from './constants'

/** All text shown after pressing SHOW UP lives here so it is easy to edit. */
export interface FeedbackContent {
  severity: 'success' | 'error' | 'warning'
  title: string
  message: string
}

const LOCATION_ERROR_MESSAGES: Record<GeolocationFailureReason, string> = {
  unsupported: 'This browser does not support location services. Try a recent version of Chrome, Safari, Edge or Firefox.',
  'permission-denied':
    'Showup needs your location to confirm you are at your gym. Allow location access for this site in your browser settings, then try again.',
  unavailable: 'Your location could not be determined. Check that location services are turned on for your device, then try again.',
  timeout: 'Finding your location took too long. Move somewhere with a clearer view of the sky or a better signal, then try again.',
}

export function getFeedbackForOutcome(outcome: ShowupOutcome): FeedbackContent {
  switch (outcome.type) {
    case 'success':
      return { severity: 'success', title: 'Showup recorded', message: 'You showed up!' }
    case 'outside-geofence':
      return {
        severity: 'error',
        title: 'Not at your gym',
        message: `You're not at your saved gym. Please go to ${PRIMARY_GYM_LABEL} and try again.`,
      }
    case 'poor-accuracy':
      return {
        severity: 'warning',
        title: 'Location not precise enough',
        message: `Your location is only accurate to about ${Math.round(outcome.accuracyMetres)} metres, which is not precise enough to confirm you are within ${GEOFENCE_RADIUS_METRES} metres of your gym. Wait a moment, or turn on precise location / Wi-Fi, and try again.`,
      }
    case 'location-error':
      return { severity: 'error', title: 'Location unavailable', message: LOCATION_ERROR_MESSAGES[outcome.reason] }
  }
}
