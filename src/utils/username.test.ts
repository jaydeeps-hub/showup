import { describe, expect, it } from 'vitest'
import {
  cleanUsernameInput,
  USERNAME_HINT,
  USERNAME_INVALID_FORMAT,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_TOO_LONG,
  USERNAME_TOO_SHORT,
  usernameProblemMessage,
  usernameCannotBeRemovedMessage,
  usernameRuleMessage,
  usernameSaveStep,
  usernameTakenMessage,
} from './username'

describe('the limits match the database (username_problem and the profiles_username_format check)', () => {
  it('is 3 to 20 characters', () => {
    expect(USERNAME_MIN_LENGTH).toBe(3)
    expect(USERNAME_MAX_LENGTH).toBe(20)
  })
})

describe('cleanUsernameInput (what the box holds after every keystroke, as the prototype does)', () => {
  it.each([
    ['jay', 'jay'],
    ['Jay', 'jay'], // lowercased
    ['JAY_MEHTA', 'jay_mehta'],
    ['jay mehta', 'jaymehta'], // a space is removed
    ['jay-mehta', 'jaymehta'], // a hyphen is removed
    ['jay.mehta!', 'jaymehta'], // so are full stops and punctuation
    ['@jay', 'jay'], // the @ people often type themselves
    ['jay_shows_up', 'jay_shows_up'], // underscores stay
    ['gymbro_91', 'gymbro_91'], // digits stay
    ['1abc', '1abc'], // a digit first is KEPT here; the rule then complains (so the person sees why)
    ['_abc', '_abc'], // so is an underscore first
    ['josé', 'jos'], // an accented letter is dropped, not turned into a plain one
    ['आशा', ''], // other scripts are dropped entirely
    ['jay😀', 'jay'], // emoji
    ['   ', ''],
    ['', ''],
  ])('%j becomes %j', (raw, cleaned) => {
    expect(cleanUsernameInput(raw)).toBe(cleaned)
  })

  it('stops at 20 characters', () => {
    expect(cleanUsernameInput('a'.repeat(30))).toBe('a'.repeat(20))
    expect(cleanUsernameInput('a'.repeat(20))).toBe('a'.repeat(20))
  })

  it('counts the 20 AFTER removing what is not allowed, so spaces never eat into the length', () => {
    // 20 letters with a space between each pair: 39 characters typed, 20 kept.
    expect(cleanUsernameInput('a b c d e f g h i j k l m n o p q r s t')).toBe('abcdefghijklmnopqrst')
  })

  it('cleans an uppercase letter that becomes more than one letter in lowercase, without passing 20', () => {
    // "İ" (Turkish dotted capital I) lowercases to "i" plus a combining dot; the dot is then removed.
    expect(cleanUsernameInput('İ'.repeat(25))).toBe('i'.repeat(20))
  })

  it('is idempotent: cleaning a cleaned value changes nothing', () => {
    for (const raw of ['Jay Mehta!', 'GYMBRO_91', '  a_b_c  ', 'x'.repeat(40)]) {
      const once = cleanUsernameInput(raw)
      expect(cleanUsernameInput(once)).toBe(once)
    }
  })
})

describe('usernameRuleMessage (the instant rule, copied from the prototype’s unRule)', () => {
  it.each([
    ['ab', USERNAME_TOO_SHORT],
    ['a', USERNAME_TOO_SHORT],
    ['1abc', USERNAME_INVALID_FORMAT], // must start with a letter
    ['_abc', USERNAME_INVALID_FORMAT],
    ['a-b', USERNAME_INVALID_FORMAT], // a hyphen is not allowed (only reachable if the value was not cleaned)
    ['abc', null],
    ['a_b_c', null],
    ['jay_shows_up', null],
    ['gym2026', null],
    ['a'.repeat(20), null], // exactly 20: fine
    ['abcdefghij_klmnopq12', null], // a realistic 20-character name
  ])('%j gives %j', (value, message) => {
    expect(usernameRuleMessage(value)).toBe(message)
  })

  it('says nothing for an empty value: the default hint is shown for that', () => {
    expect(usernameRuleMessage('')).toBeNull()
  })

  it('checks the length before the format, as the prototype does: "1a" is "too short", not "start with a letter"', () => {
    expect(usernameRuleMessage('1a')).toBe(USERNAME_TOO_SHORT)
  })

  it('refuses a name over 20 characters (only reachable if the value was not cleaned)', () => {
    expect(usernameRuleMessage('a'.repeat(21))).toBe(USERNAME_TOO_LONG)
  })

  it('uses the prototype’s exact words', () => {
    expect(USERNAME_TOO_SHORT).toBe('Use at least 3 characters')
    expect(USERNAME_INVALID_FORMAT).toBe('Start with a letter, then use letters, numbers or underscores')
    expect(USERNAME_TOO_LONG).toBe('Use at most 20 characters')
    expect(USERNAME_HINT).toBe('Friends find you with this. 3–20 letters, numbers or underscores.')
  })
})

describe('usernameProblemMessage (the server’s reasons, in the same words as the instant rule)', () => {
  it.each([
    ['too_short', USERNAME_TOO_SHORT],
    ['too_long', USERNAME_TOO_LONG],
    ['invalid_format', USERNAME_INVALID_FORMAT],
    ['empty', USERNAME_HINT],
  ] as const)('%s gives %j', (problem, message) => {
    expect(usernameProblemMessage(problem)).toBe(message)
  })
})

describe('usernameSaveStep (what the Profile edit form does with the username on Save)', () => {
  it.each([
    // value, own, status, step
    ['', null, 'idle', 'unchanged'], // no username before, field left empty: save the rest
    ['', 'jay', 'idle', 'blocked'], // had one and cleared the field: cannot remove it here
    ['jay', 'jay', 'ok', 'unchanged'], // their own: no server call
    ['jaya', 'jay', 'ok', 'changed'], // a new free name: set_username first
    ['jaya', null, 'ok', 'changed'], // first username, set from Profile
    ['jaya', 'jay', 'checking', 'blocked'], // still being checked
    ['jaya', 'jay', 'error', 'blocked'], // taken, a rule, or the check failed
    ['ab', null, 'error', 'blocked'], // too short, even for someone with no username
    ['jaya', 'jay', 'idle', 'blocked'], // not checked at all is never ok
  ] as const)('%j (own %j, %s) gives %s', (value, own, status, step) => {
    expect(usernameSaveStep(value, own, status)).toBe(step)
  })

  it('treats a username missing from the profile (undefined) or empty the same as none, so Save is never blocked by it', () => {
    expect(usernameSaveStep('', undefined as unknown as null, 'idle')).toBe('unchanged')
    expect(usernameSaveStep('', '' as unknown as null, 'idle')).toBe('unchanged')
  })
})

describe('usernameCannotBeRemovedMessage', () => {
  it('says the username cannot be removed and names the one Cancel keeps', () => {
    expect(usernameCannotBeRemovedMessage('asha_rao')).toBe("You can't remove your username. Type a new one, or press Cancel to keep @asha_rao.")
  })
})

describe('usernameTakenMessage', () => {
  it('offers the suggestion when there is one', () => {
    expect(usernameTakenMessage('jay', 'jay_22')).toBe('@jay is taken. Try @jay_22')
  })

  it('leaves out the "Try" part when there is none', () => {
    expect(usernameTakenMessage('jay', null)).toBe('@jay is taken')
  })
})
