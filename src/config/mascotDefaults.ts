import type { MascotMessage } from '../types'

/**
 * The mascot's words when the database has none to give (first launch with no network, or a database
 * with no messages yet). These are the 16 starting rows from docs/backend/phase7a_mascot_tables.sql,
 * copied exactly: key, priority, expression, message. Placeholders: {goal} {done} {next} {left}
 * {remaining} {wk} {total}.
 *
 * There are NO default pictures. A message whose picture is missing is shown without one.
 *
 * Ids are negative so they can never clash with a real database row (those are positive).
 *
 * These are the HOME rows only. The goal screen's rows are in DEFAULT_GOAL_MASCOT_MESSAGES below, kept apart so
 * that "the defaults cover every Home situation" stays true.
 */
export const DEFAULT_MASCOT_MESSAGES: readonly MascotMessage[] = [
  { id: -1, key: 'checking', locale: 'en', priority: 10, expression: 'focus', message: 'Hang on, confirming where you are.' },
  { id: -2, key: 'running_almost', locale: 'en', priority: 20, expression: 'cheer', message: 'Almost there. {left} min left.' },
  { id: -3, key: 'running', locale: 'en', priority: 30, expression: 'focus', message: 'Stay put. {left} min to go.' },
  { id: -4, key: 'done_extra', locale: 'en', priority: 40, expression: 'lift', message: 'Bonus visit. That’s {done} this week.' },
  { id: -5, key: 'done_goal_hit', locale: 'en', priority: 50, expression: 'cheer', message: 'Week goal hit! {wk} weeks in a row.' },
  { id: -6, key: 'done_progress', locale: 'en', priority: 60, expression: 'smile', message: 'Nice. {remaining} more to hit your week.' },
  { id: -7, key: 'paused', locale: 'en', priority: 70, expression: 'sleep', message: 'Taking a pause. See you when you’re back.' },
  { id: -8, key: 'left_early', locale: 'en', priority: 80, expression: 'wave', message: 'Left early? No stress. The timer reset, so try again when you’re back.' },
  { id: -9, key: 'missed_checks', locale: 'en', priority: 85, expression: 'wave', message: 'We couldn’t confirm you stayed. Keep Showup open with the screen on, then try again.' },
  { id: -10, key: 'new_user', locale: 'en', priority: 90, expression: 'wave', message: 'Let’s get your first week going. One visit is all it takes today.' },
  { id: -11, key: 'goal_met', locale: 'en', priority: 100, expression: 'lift', message: 'Weekly goal done. Extra visits still count.' },
  { id: -12, key: 'back_after_miss', locale: 'en', priority: 110, expression: 'wave', message: 'Welcome back. A missed week doesn’t erase your {total} showups.' },
  { id: -13, key: 'one_to_go', locale: 'en', priority: 120, expression: 'cheer', message: 'One more and your week is done. You’ve got this.' },
  { id: -14, key: 'high_goal', locale: 'en', priority: 130, expression: 'lift', message: '{done} of {goal} so far. Rest days are part of the plan too.' },
  { id: -15, key: 'week_start', locale: 'en', priority: 140, expression: 'smile', message: 'New week, fresh start. Show up today and you’re at 1 of {goal}.' },
  { id: -16, key: 'in_progress', locale: 'en', priority: 150, expression: 'smile', message: 'Show up today and you’re at {next} of {goal}.' },
]

/**
 * The goal screen's words when the database has none for it: the 7 rows from
 * docs/backend/10a_onboarding_mascot.sql, copied exactly (key, screen, priority, expression, message, label).
 * One row per number of days: `goal_1` ... `goal_7`. The bubble is the same for every number; the label under the
 * big number and the face change.
 *
 * Ids are negative, as above, and continue after the Home rows.
 */
const GOAL_BUBBLE = 'Pick a number you can keep. Rest days are part of the plan.'

export const DEFAULT_GOAL_MASCOT_MESSAGES: readonly MascotMessage[] = [
  { id: -17, key: 'goal_1', screen: 'goal', locale: 'en', priority: 1, expression: 'smile', message: GOAL_BUBBLE, label: 'A gentle start' },
  { id: -18, key: 'goal_2', screen: 'goal', locale: 'en', priority: 2, expression: 'smile', message: GOAL_BUBBLE, label: 'Light and steady' },
  { id: -19, key: 'goal_3', screen: 'goal', locale: 'en', priority: 3, expression: 'smile', message: GOAL_BUBBLE, label: 'Steady' },
  { id: -20, key: 'goal_4', screen: 'goal', locale: 'en', priority: 4, expression: 'smile', message: GOAL_BUBBLE, label: 'Committed' },
  { id: -21, key: 'goal_5', screen: 'goal', locale: 'en', priority: 5, expression: 'lift', message: GOAL_BUBBLE, label: 'A strong week' },
  { id: -22, key: 'goal_6', screen: 'goal', locale: 'en', priority: 6, expression: 'lift', message: GOAL_BUBBLE, label: 'Nearly every day' },
  { id: -23, key: 'goal_7', screen: 'goal', locale: 'en', priority: 7, expression: 'sleep', message: GOAL_BUBBLE, label: 'Are you sure? Rest days are important too.' },
]
