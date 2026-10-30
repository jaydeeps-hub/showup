import { useCallback, useEffect, useRef, useState } from 'react'
import { getNearMePosition } from '../services/devicePosition'
import type { LatLng } from '../utils/distance'

/** The one thing kept in the browser for "Gyms near me": whether the person last left it on. Never a position. */
export const NEAR_ME_STORAGE_KEY = 'showup:gyms-near-me'

export type NearMeStatus =
  /** Off, or on and ready. */
  | 'idle'
  /** Waiting for the browser to give a position. */
  | 'finding'
  /** The last try failed (refused, unavailable or timed out): the toggle is off and a note explains. */
  | 'failed'

export interface NearMeState {
  /** The toggle. True only while there is a position to sort by. */
  on: boolean
  status: NearMeStatus
  /** The device position, held in memory only: never stored, never sent anywhere except to Google for the search. */
  position: LatLng | null
  /** The person's tap on the toggle. Turning ON is the one moment the browser is asked for location. */
  toggle: (wantOn: boolean) => void
}

/** Storage that may be missing or blocked (private mode). Everything here treats that as "no saved choice". */
function readSavedChoice(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(NEAR_ME_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveChoice(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (on) localStorage.setItem(NEAR_ME_STORAGE_KEY, '1')
    else localStorage.removeItem(NEAR_ME_STORAGE_KEY)
  } catch {
    // Storage blocked or full: the choice is just not remembered.
  }
}

/** True only when the browser says location is ALREADY allowed. Anywhere it cannot tell, the answer is no. */
export async function locationAlreadyAllowed(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return false
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state === 'granted'
  } catch {
    return false
  }
}

/**
 * The state of the "Gyms near me" toggle.
 *
 *   - It NEVER asks for location by itself. The browser is asked only when the person turns the toggle on
 *     (`toggle(true)`, from their tap).
 *   - If they refuse, or location is unavailable or times out, the toggle goes back to off (`status: 'failed'`)
 *     and the screen shows a note. Name and area search carry on as before.
 *   - The choice is remembered in this browser as a plain on/off flag. When the screen opens with the flag on, it is
 *     applied only if the browser says location is already allowed (so reading the position cannot prompt);
 *     otherwise the toggle stays off and nothing is asked.
 *   - The position lives in memory only.
 */
export function useNearMe(): NearMeState {
  const [on, setOn] = useState(false)
  const [status, setStatus] = useState<NearMeStatus>('idle')
  const [position, setPosition] = useState<LatLng | null>(null)
  // Guards against an answer arriving after the person has switched off or the screen has closed.
  const attempt = useRef(0)

  const findPosition = useCallback(async (): Promise<boolean> => {
    const mine = ++attempt.current
    setStatus('finding')
    try {
      const found = await getNearMePosition()
      if (mine !== attempt.current) return false
      setPosition({ lat: found.lat, lng: found.lng })
      setOn(true)
      setStatus('idle')
      return true
    } catch {
      if (mine !== attempt.current) return false
      setPosition(null)
      setOn(false)
      setStatus('failed')
      return false
    }
  }, [])

  const toggle = useCallback(
    (wantOn: boolean) => {
      if (!wantOn) {
        attempt.current += 1 // forget any answer still on its way
        setOn(false)
        setPosition(null)
        setStatus('idle')
        saveChoice(false)
        return
      }
      saveChoice(true)
      void findPosition().then((ok) => {
        if (!ok) saveChoice(false) // a refused toggle is not a remembered choice
      })
    },
    [findPosition],
  )

  // On open: apply a remembered "on" only if the browser already allows location. No prompt, ever, from here.
  useEffect(() => {
    if (!readSavedChoice()) return
    let cancelled = false
    void locationAlreadyAllowed().then((allowed) => {
      if (cancelled || !allowed) return
      void findPosition()
    })
    return () => {
      cancelled = true
      attempt.current += 1
    }
  }, [findPosition])

  return { on, status, position, toggle }
}
