import { DEFAULT_GOAL_MASCOT_MESSAGES } from '../config/mascotDefaults'
import type { LastOutcome, MascotContent, MascotMessage, MascotPicture, MascotScreen } from '../types'

/**
 * The mascot's brain, as plain functions with no React and no network, so it can be tested exhaustively.
 *
 * The split of work: the CODE decides which situations are true right now (a situation is an
 * independent yes/no about the user); the DATABASE decides which true one wins (the message rows carry a
 * `priority`, lower wins) and what is said. So editing the table re-orders or re-words the mascot
 * without releasing the app.
 */

/** The phases of the timed Show Up, as the engine reports them. */
export type MascotEngineState = 'idle' | 'checking' | 'running' | 'done'

/** Everything the mascot needs to know, gathered from data the Home screen already loads. */
export interface MascotContext {
  /** This week's goal in days. Null until the user has set one. */
  goal: number | null
  /** Days shown up this week. */
  done: number
  /** Weeks in a row. */
  wk: number
  /** Total showups, ever. */
  total: number
  /** This week's Monday is in `active_pauses`. */
  paused: boolean
  engine: MascotEngineState
  remainingSeconds: number
  lastOutcome: LastOutcome | null
  /** Seconds left at which "almost there" starts. From `config.mascot_almost_seconds`. */
  almostSeconds: number
}

/** The keys the code knows how to judge. A message row with any other key is ignored. */
export const SITUATION_KEYS = [
  'checking',
  'running_almost',
  'running',
  'done_extra',
  'done_goal_hit',
  'done_progress',
  'paused',
  'left_early',
  'missed_checks',
  'new_user',
  'goal_met',
  'back_after_miss',
  'one_to_go',
  'high_goal',
  'week_start',
  'in_progress',
] as const

export type SituationKey = (typeof SITUATION_KEYS)[number]

/**
 * Which situations are true right now. Each one is an independent yes/no; none of them looks at the
 * others or at priority. With no goal set, every situation that needs the goal is false.
 */
export function trueSituations(context: MascotContext): Record<SituationKey, boolean> {
  const { goal, done: c, wk, total, paused, engine, remainingSeconds, lastOutcome, almostSeconds } = context
  const hasGoal = goal !== null
  const g = goal ?? 0

  return {
    checking: engine === 'checking',
    running_almost: engine === 'running' && remainingSeconds <= almostSeconds,
    running: engine === 'running',
    done_extra: engine === 'done' && hasGoal && c > g,
    done_goal_hit: engine === 'done' && hasGoal && c === g,
    done_progress: engine === 'done' && hasGoal && c < g,
    paused,
    left_early: lastOutcome === 'left_early',
    missed_checks: lastOutcome === 'missed_checks',
    new_user: total === 0,
    goal_met: hasGoal && c >= g,
    back_after_miss: wk === 0 && total > 0,
    one_to_go: hasGoal && c === g - 1,
    high_goal: hasGoal && g >= 5 && g - c > 1,
    week_start: c === 0,
    in_progress: true,
  }
}

/** The values a message can mention: {goal} {done} {next} {left} {remaining} {wk} {total}. */
export function placeholderValues(context: MascotContext): Record<string, number> {
  const goal = context.goal ?? 0
  return {
    goal,
    done: context.done,
    next: context.done + 1,
    remaining: Math.max(0, goal - context.done),
    left: Math.ceil(Math.max(0, context.remainingSeconds) / 60),
    wk: context.wk,
    total: context.total,
  }
}

/**
 * Fills the {placeholders} in a message. An unknown placeholder becomes an empty string (and is
 * reported in the console while developing), so an editor's typo can never put "{oops}" on screen.
 */
export function fillPlaceholders(text: string, values: Record<string, number | string>): string {
  return text.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(values, name)) return String(values[name])
    if (import.meta.env?.DEV) console.warn(`Unknown mascot placeholder {${name}}`)
    return ''
  })
}

export interface MascotPick {
  expression: string
  text: string
  /** The row's short caption, if it has one (the goal screen shows it under the big number). */
  label?: string | null
}

/** The screen a row belongs to. A row with no `screen` (old saved content, old bundled words) is a Home row. */
export function screenOf(row: Pick<MascotMessage, 'screen'>): MascotScreen {
  return row.screen ?? 'home'
}

/**
 * The line the mascot says now. Keeps the rows whose key is a situation that is true right now, orders
 * them by priority (then id), and takes the first. A row is skipped if its key is not one the code
 * knows, or if its expression has no picture row in `images` (the database also refuses that, but the
 * app does not trust it). Returns null when nothing qualifies.
 *
 * `knownExpressions` is the set of expression names that exist. Pass `null` to skip that check (the
 * bundled defaults have no pictures at all, and a message without a picture is still shown).
 *
 * `screen` says whose rows to consider; the others are ignored. It defaults to `'home'`, and a row with no
 * `screen` counts as Home, so every existing caller and every old saved copy behaves exactly as before. (It is
 * the last parameter so the existing third one stays where it was.) The goal screen has its own picker below.
 */
export function pickMascotMessage(
  messages: readonly MascotMessage[],
  context: MascotContext,
  knownExpressions: ReadonlySet<string> | null = null,
  screen: MascotScreen = 'home',
): MascotPick | null {
  const truth = trueSituations(context)
  const candidates = messages
    .filter((row) => screenOf(row) === screen)
    .filter((row) => Object.prototype.hasOwnProperty.call(truth, row.key) && truth[row.key as SituationKey])
    .filter((row) => knownExpressions === null || knownExpressions.has(row.expression))
    .sort((a, b) => a.priority - b.priority || a.id - b.id)
  const winner = candidates[0]
  if (!winner) return null
  return { expression: winner.expression, text: fillPlaceholders(winner.message, placeholderValues(context)), label: winner.label ?? null }
}

/** How many numbers the goal screen offers: 1 to 7 days a week. */
export const GOAL_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const

/** The keys the goal screen's rows use: `goal_1` ... `goal_7`. */
export const GOAL_SITUATION_KEYS = GOAL_DAY_OPTIONS.map((days) => `goal_${days}`)

/**
 * Which goal situations are true for the selected number: `goal_N` is true exactly when the selected number is N.
 * So at most one is true, and none is when the number is not a whole number from 1 to 7.
 */
export function trueGoalSituations(selectedDays: number): Record<string, boolean> {
  return Object.fromEntries(GOAL_DAY_OPTIONS.map((days) => [`goal_${days}`, selectedDays === days]))
}

/**
 * The goal screen's rows: the ones the database sent for it, or, when it sent none (an old saved copy, or a
 * database that has not had Phase 10a applied), the bundled ones. It is "none at all", not "some missing":
 * if the database has the goal screen at all, what it says is used as it is.
 */
export function goalMessagesFrom(messages: readonly MascotMessage[]): readonly MascotMessage[] {
  const fetched = messages.filter((row) => screenOf(row) === 'goal')
  return fetched.length > 0 ? fetched : DEFAULT_GOAL_MASCOT_MESSAGES
}

/**
 * What the mascot says and shows on the goal screen for the selected number of days: the winning row's face
 * (`expression`), bubble (`text`) and caption under the big number (`label`). Same rules as Home: only rows of
 * the goal screen whose key is a true situation count, the lowest priority wins (then id), and a row whose
 * expression has no picture is skipped when `knownExpressions` is given. If the content has no goal rows, the
 * bundled ones are used. Returns null only when nothing qualifies (a number outside 1 to 7).
 */
export function pickGoalMascotMessage(
  messages: readonly MascotMessage[],
  selectedDays: number,
  knownExpressions: ReadonlySet<string> | null = null,
): MascotPick | null {
  const truth = trueGoalSituations(selectedDays)
  const winner = goalMessagesFrom(messages)
    .filter((row) => Object.prototype.hasOwnProperty.call(truth, row.key) && truth[row.key])
    .filter((row) => knownExpressions === null || knownExpressions.has(row.expression))
    .sort((a, b) => a.priority - b.priority || a.id - b.id)[0]
  if (!winner) return null
  // No placeholders yet in the goal lines, but the same filling keeps an editor's {goal} working if one is added.
  return { expression: winner.expression, text: fillPlaceholders(winner.message, { goal: selectedDays }), label: winner.label ?? null }
}

/**
 * A coarser stand-in for the seconds left, for screens that must not re-render every second.
 *
 * The mascot uses the seconds in exactly two ways: "{left}" (whole minutes, rounded up) and "are we within
 * `almostSeconds`". This returns a value that gives the SAME answer to both questions and changes at most
 * once a minute (plus once when the window is entered):
 *   - not yet "almost" (seconds > almostSeconds): the next whole minute at or above `seconds`, but never at or
 *     below `almostSeconds`, so it is still outside the window and has the same minutes-left;
 *   - "almost" (seconds <= almostSeconds): the largest value in the same minutes-left bucket that is still
 *     inside the window, i.e. min(minutes * 60, almostSeconds).
 * "Minutes left" is ceil(seconds / 60), the same bucket the words use.
 */
export function coarseRemainingSeconds(remainingSeconds: number, almostSeconds: number): number {
  const seconds = Math.max(0, remainingSeconds)
  const bucketTop = Math.ceil(seconds / 60) * 60 // the last second that still reads as the same minutes-left
  return seconds <= almostSeconds ? Math.min(bucketTop, almostSeconds) : bucketTop
}

/** Adds `?v=123` (or `&v=123` when the address already has a query) so a changed picture is fetched again. */
export function withCacheBuster(url: string, v: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}

/**
 * The picture for an expression, or null. If that expression has no picture it falls back to `smile`,
 * and if there is no `smile` either, null: the mascot then speaks without a picture.
 */
export function imageFor(content: Pick<MascotContent, 'images'>, expression: string): MascotPicture | null {
  const image = content.images[expression] ?? content.images['smile']
  if (!image || image.url === '') return null
  return { url: withCacheBuster(image.url, image.v), width: image.width, height: image.height, alt: image.alt }
}
