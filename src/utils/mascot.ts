import type { LastOutcome, MascotContent, MascotMessage, MascotPicture } from '../types'

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
}

/**
 * The line the mascot says now. Keeps the rows whose key is a situation that is true right now, orders
 * them by priority (then id), and takes the first. A row is skipped if its key is not one the code
 * knows, or if its expression has no picture row in `images` (the database also refuses that, but the
 * app does not trust it). Returns null when nothing qualifies.
 *
 * `knownExpressions` is the set of expression names that exist. Pass `null` to skip that check (the
 * bundled defaults have no pictures at all, and a message without a picture is still shown).
 */
export function pickMascotMessage(
  messages: readonly MascotMessage[],
  context: MascotContext,
  knownExpressions: ReadonlySet<string> | null = null,
): MascotPick | null {
  const truth = trueSituations(context)
  const candidates = messages
    .filter((row) => Object.prototype.hasOwnProperty.call(truth, row.key) && truth[row.key as SituationKey])
    .filter((row) => knownExpressions === null || knownExpressions.has(row.expression))
    .sort((a, b) => a.priority - b.priority || a.id - b.id)
  const winner = candidates[0]
  if (!winner) return null
  return { expression: winner.expression, text: fillPlaceholders(winner.message, placeholderValues(context)) }
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
