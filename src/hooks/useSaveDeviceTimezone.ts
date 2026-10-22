import { useEffect, useRef } from 'react'
import { saveDeviceTimezone } from '../services/timezoneService'

/**
 * Saves the device's time zone once when the signed-in app starts (after a sign-in, or when the
 * app is opened with a saved sign-in). It does not run again when the screen changes, when the
 * sign-in token refreshes, or when the tab is revisited; only a different user signing in, or
 * the page being opened again, triggers another save.
 */
export function useSaveDeviceTimezone(userId: string): void {
  const savedFor = useRef<string | null>(null)

  useEffect(() => {
    if (savedFor.current === userId) return
    savedFor.current = userId
    void saveDeviceTimezone() // never throws; failures are only logged
  }, [userId])
}
