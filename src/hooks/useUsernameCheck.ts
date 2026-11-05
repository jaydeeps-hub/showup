import { useCallback, useEffect, useState } from 'react'
import { checkUsername } from '../services/usernameService'
import {
  USERNAME_CHECK_FAILED,
  USERNAME_HINT,
  USERNAME_OWN,
  usernameProblemMessage,
  usernameRuleMessage,
  usernameTakenMessage,
} from '../utils/username'

/** How long typing must pause before the database is asked, as the prototype's `unCheck()` waits. */
export const USERNAME_CHECK_DEBOUNCE_MS = 500

/**
 * - `idle`: nothing typed; the hint is the default one.
 * - `checking`: waiting for the pause, or for the database's answer ("Checking @v…").
 * - `ok`: the name can be used (free, or already the person's own).
 * - `error`: it cannot (a rule, taken, or the check itself failed).
 * Only `ok` lets a form go on.
 */
export type UsernameCheckStatus = 'idle' | 'checking' | 'ok' | 'error'

export interface UsernameCheckState {
  status: UsernameCheckStatus
  /** The line to show under the field. */
  hint: string
  /** Re-runs the check for the current value straight away (for example after a save was refused as taken). */
  recheck: () => void
}

interface Verdict {
  /** The value this verdict is for. A verdict for any other value is ignored, so a late reply can never win. */
  value: string
  status: 'ok' | 'error'
  hint: string
}

/**
 * The live check under a username field, following the prototype's `unCheck()`. Give it the CLEANED value (see
 * `cleanUsernameInput`) and the person's current username (null if they have none yet):
 *
 * - empty: `idle`, the default hint;
 * - a rule fails (too short, a bad first character…): `error` with that rule's text at once, no request;
 * - their own username: `ok`, "This is your username", no request;
 * - otherwise: `checking` with "Checking @v…", then after 500 ms without typing it asks the database: free gives
 *   `ok` "✓ @v is available", taken gives `error` "@v is taken. Try @suggestion" (no "Try" part without one), and a
 *   failed check gives `error` "Couldn’t check right now".
 */
export function useUsernameCheck(value: string, ownUsername: string | null): UsernameCheckState {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  // Bumped by recheck() to ask again for the same value.
  const [attempt, setAttempt] = useState(0)
  const ruleMessage = usernameRuleMessage(value)
  const isOwn = ownUsername !== null && value === ownUsername
  const needsServer = value !== '' && ruleMessage === null && !isOwn

  useEffect(() => {
    if (!needsServer) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await checkUsername(value)
      // A new value (or a recheck, or the field going away) replaces this effect, and its clean-up sets `cancelled`, so an
      // answer that arrives after the input moved on is dropped here. A stored verdict is also only shown for its own
      // value (below), so a late answer can never show under a different name.
      if (cancelled) return
      if (result.status === 'error') {
        setVerdict({ value, status: 'error', hint: USERNAME_CHECK_FAILED })
        return
      }
      const { check } = result
      if (check.available) {
        setVerdict({ value, status: 'ok', hint: check.reason === 'own' ? USERNAME_OWN : `✓ @${check.username} is available` })
      } else if (check.reason === 'taken') {
        setVerdict({ value, status: 'error', hint: usernameTakenMessage(check.username, check.suggestion) })
      } else if (check.reason === null || check.reason === 'own') {
        // Not available but no reason given: the reply does not make sense, so do not let the name through.
        setVerdict({ value, status: 'error', hint: USERNAME_CHECK_FAILED })
      } else {
        setVerdict({ value, status: 'error', hint: usernameProblemMessage(check.reason) })
      }
    }, USERNAME_CHECK_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, needsServer, attempt])

  const recheck = useCallback(() => {
    setVerdict(null)
    setAttempt((count) => count + 1)
  }, [])

  if (value === '') return { status: 'idle', hint: USERNAME_HINT, recheck }
  if (ruleMessage !== null) return { status: 'error', hint: ruleMessage, recheck }
  if (isOwn) return { status: 'ok', hint: USERNAME_OWN, recheck }
  if (verdict && verdict.value === value) return { status: verdict.status, hint: verdict.hint, recheck }
  return { status: 'checking', hint: `Checking @${value}…`, recheck }
}
