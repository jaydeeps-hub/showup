/**
 * The username rules the app checks on the device before asking the database. They copy the database's own
 * `username_problem()` (docs/backend/phase11a_username.sql) and the prototype's `unRule()`: the database stays the
 * judge, these only spare a request for a name that cannot pass.
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20

/** Starts with a letter, then only lowercase letters, digits and underscores. The length is checked separately. */
const USERNAME_FORMAT = /^[a-z][a-z0-9_]*$/

/** Why the database says a name cannot be used. `own` (the person's current name) is not a problem; see UsernameCheck. */
export type UsernameProblem = 'empty' | 'too_short' | 'too_long' | 'invalid_format' | 'taken'

export const USERNAME_HINT = 'Friends find you with this. 3–20 letters, numbers or underscores.'
export const USERNAME_TOO_SHORT = 'Use at least 3 characters'
export const USERNAME_TOO_LONG = 'Use at most 20 characters'
export const USERNAME_INVALID_FORMAT = 'Start with a letter, then use letters, numbers or underscores'
export const USERNAME_OWN = 'This is your username'
export const USERNAME_CHECK_FAILED = 'Couldn’t check right now'
export const USERNAME_SAVE_FAILED = 'Something went wrong. Try again.'

/**
 * Shown when someone who HAS a username empties the field and presses Save. The database cannot remove a username
 * (set_username refuses an empty one), so the field must hold a name: a new one, or their current one via Cancel.
 */
export function usernameCannotBeRemovedMessage(ownUsername: string): string {
  return `You can't remove your username. Type a new one, or press Cancel to keep @${ownUsername}.`
}

/**
 * What a username box should hold after a keystroke or paste, as the prototype does on every input: lowercase, with
 * every character that is not a-z, 0-9 or an underscore removed, and at most 20 characters. So "Jay Mehta!" becomes
 * "jaymehta", and an accented letter is dropped rather than changed into a plain one.
 */
export function cleanUsernameInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, USERNAME_MAX_LENGTH)
}

/**
 * The instant rule, copied from the prototype's `unRule()`: the message for a name that cannot pass, or null when it
 * may. Expects a cleaned value. An empty value returns null: the hook shows the default hint for that instead.
 */
export function usernameRuleMessage(value: string): string | null {
  if (value === '') return null
  if (value.length < USERNAME_MIN_LENGTH) return USERNAME_TOO_SHORT
  if (value.length > USERNAME_MAX_LENGTH) return USERNAME_TOO_LONG
  if (!USERNAME_FORMAT.test(value)) return USERNAME_INVALID_FORMAT
  return null
}

/**
 * What the Profile edit form does with the username when Save is pressed:
 * - `blocked`: Save must not go ahead (the name breaks a rule, is taken, could not be checked, or is still being
 *   checked); put the cursor in the username field;
 * - `unchanged`: nothing to send for the username (it is the person's current one, or the field is empty and they
 *   never had one), so the rest is saved without calling the server for it;
 * - `changed`: send it with `set_username` BEFORE the rest.
 *
 * Someone who has a username cannot clear it here: an empty field is blocked for them (the database has no way to
 * remove a username).
 */
export type UsernameSaveStep = 'blocked' | 'unchanged' | 'changed'

export function usernameSaveStep(value: string, ownUsername: string | null, status: 'idle' | 'checking' | 'ok' | 'error'): UsernameSaveStep {
  // No username at all (null, or missing from an older profile object) is the same as "none".
  if (value === '') return ownUsername == null || ownUsername === '' ? 'unchanged' : 'blocked'
  if (status !== 'ok') return 'blocked'
  return value === ownUsername ? 'unchanged' : 'changed'
}

/** The "taken" text, with an alternative when the database offered one: "@jay is taken. Try @jay_22". */
export function usernameTakenMessage(username: string, suggestion: string | null): string {
  return suggestion ? `@${username} is taken. Try @${suggestion}` : `@${username} is taken`
}

/** The text for a reason the database gave. `taken` needs the name (and a suggestion), so it is built separately. */
export function usernameProblemMessage(problem: Exclude<UsernameProblem, 'taken'>): string {
  switch (problem) {
    case 'empty':
      return USERNAME_HINT
    case 'too_short':
      return USERNAME_TOO_SHORT
    case 'too_long':
      return USERNAME_TOO_LONG
    case 'invalid_format':
      return USERNAME_INVALID_FORMAT
  }
}
