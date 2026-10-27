import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MASCOT_MESSAGES } from '../config/mascotDefaults'
import type { LastOutcome, MascotContent, MascotMessage } from '../types'
import {
  coarseRemainingSeconds,
  fillPlaceholders,
  imageFor,
  pickMascotMessage,
  placeholderValues,
  SITUATION_KEYS,
  trueSituations,
  withCacheBuster,
  type MascotContext,
  type MascotEngineState,
} from './mascot'

/** A context for an ordinary idle mid-week user, with any field overridden. */
function ctx(overrides: Partial<MascotContext> = {}): MascotContext {
  return {
    goal: 3,
    done: 1,
    wk: 4,
    total: 20,
    paused: false,
    engine: 'idle',
    remainingSeconds: 0,
    lastOutcome: null,
    almostSeconds: 180,
    ...overrides,
  }
}

const trueKeys = (context: MascotContext) =>
  SITUATION_KEYS.filter((key) => trueSituations(context)[key]).sort()

describe('trueSituations: one test per situation', () => {
  it('checking: only while the engine is checking', () => {
    expect(trueSituations(ctx({ engine: 'checking' })).checking).toBe(true)
    for (const engine of ['idle', 'running', 'done'] as const) expect(trueSituations(ctx({ engine })).checking).toBe(false)
  })

  it('running_almost: running with the almost-threshold or less left (inclusive)', () => {
    expect(trueSituations(ctx({ engine: 'running', remainingSeconds: 181 })).running_almost).toBe(false)
    expect(trueSituations(ctx({ engine: 'running', remainingSeconds: 180 })).running_almost).toBe(true)
    expect(trueSituations(ctx({ engine: 'running', remainingSeconds: 1 })).running_almost).toBe(true)
    expect(trueSituations(ctx({ engine: 'idle', remainingSeconds: 1 })).running_almost).toBe(false)
  })

  it('running_almost follows the configured threshold, not a hard-coded one', () => {
    expect(trueSituations(ctx({ engine: 'running', remainingSeconds: 60, almostSeconds: 30 })).running_almost).toBe(false)
    expect(trueSituations(ctx({ engine: 'running', remainingSeconds: 60, almostSeconds: 90 })).running_almost).toBe(true)
  })

  it('running: whenever the engine is running', () => {
    expect(trueSituations(ctx({ engine: 'running', remainingSeconds: 900 })).running).toBe(true)
    expect(trueSituations(ctx({ engine: 'done' })).running).toBe(false)
  })

  it('done_extra: done and more days than the goal', () => {
    expect(trueSituations(ctx({ engine: 'done', goal: 3, done: 4 })).done_extra).toBe(true)
    expect(trueSituations(ctx({ engine: 'done', goal: 3, done: 3 })).done_extra).toBe(false)
    expect(trueSituations(ctx({ engine: 'idle', goal: 3, done: 4 })).done_extra).toBe(false)
  })

  it('done_goal_hit: done and exactly the goal', () => {
    expect(trueSituations(ctx({ engine: 'done', goal: 3, done: 3 })).done_goal_hit).toBe(true)
    expect(trueSituations(ctx({ engine: 'done', goal: 3, done: 2 })).done_goal_hit).toBe(false)
  })

  it('done_progress: done and fewer days than the goal', () => {
    expect(trueSituations(ctx({ engine: 'done', goal: 3, done: 2 })).done_progress).toBe(true)
    expect(trueSituations(ctx({ engine: 'done', goal: 3, done: 3 })).done_progress).toBe(false)
  })

  it('paused: when this week is paused', () => {
    expect(trueSituations(ctx({ paused: true })).paused).toBe(true)
    expect(trueSituations(ctx({ paused: false })).paused).toBe(false)
  })

  it('left_early: when the last timer ended by leaving early', () => {
    expect(trueSituations(ctx({ lastOutcome: 'left_early' })).left_early).toBe(true)
    expect(trueSituations(ctx({ lastOutcome: 'missed_checks' })).left_early).toBe(false)
    expect(trueSituations(ctx({ lastOutcome: null })).left_early).toBe(false)
  })

  it('missed_checks: when the last timer ended by missed checks', () => {
    expect(trueSituations(ctx({ lastOutcome: 'missed_checks' })).missed_checks).toBe(true)
    expect(trueSituations(ctx({ lastOutcome: 'left_early' })).missed_checks).toBe(false)
  })

  it('new_user: no showups at all', () => {
    expect(trueSituations(ctx({ total: 0, done: 0, wk: 0 })).new_user).toBe(true)
    expect(trueSituations(ctx({ total: 1 })).new_user).toBe(false)
  })

  it('goal_met: days at or above the goal', () => {
    expect(trueSituations(ctx({ goal: 3, done: 3 })).goal_met).toBe(true)
    expect(trueSituations(ctx({ goal: 3, done: 5 })).goal_met).toBe(true)
    expect(trueSituations(ctx({ goal: 3, done: 2 })).goal_met).toBe(false)
  })

  it('back_after_miss: no weeks in a row but showups in the past', () => {
    expect(trueSituations(ctx({ wk: 0, total: 5 })).back_after_miss).toBe(true)
    expect(trueSituations(ctx({ wk: 0, total: 0 })).back_after_miss).toBe(false)
    expect(trueSituations(ctx({ wk: 2, total: 5 })).back_after_miss).toBe(false)
  })

  it('one_to_go: exactly one day short of the goal', () => {
    expect(trueSituations(ctx({ goal: 3, done: 2 })).one_to_go).toBe(true)
    expect(trueSituations(ctx({ goal: 3, done: 1 })).one_to_go).toBe(false)
    expect(trueSituations(ctx({ goal: 3, done: 3 })).one_to_go).toBe(false)
  })

  it('high_goal: a goal of 5 or more with more than one day to go', () => {
    expect(trueSituations(ctx({ goal: 5, done: 2 })).high_goal).toBe(true)
    expect(trueSituations(ctx({ goal: 5, done: 3 })).high_goal).toBe(true)
    expect(trueSituations(ctx({ goal: 5, done: 4 })).high_goal).toBe(false) // only one to go
    expect(trueSituations(ctx({ goal: 4, done: 0 })).high_goal).toBe(false) // goal under 5
  })

  it('week_start: no days yet this week', () => {
    expect(trueSituations(ctx({ done: 0 })).week_start).toBe(true)
    expect(trueSituations(ctx({ done: 1 })).week_start).toBe(false)
  })

  it('in_progress: always', () => {
    expect(trueSituations(ctx()).in_progress).toBe(true)
    expect(trueSituations(ctx({ goal: null, engine: 'running' })).in_progress).toBe(true)
  })

  it('with no goal set, every situation that needs the goal is false', () => {
    const t = trueSituations(ctx({ goal: null, engine: 'done', done: 2 }))
    expect([t.done_extra, t.done_goal_hit, t.done_progress, t.goal_met, t.one_to_go, t.high_goal]).toEqual([
      false, false, false, false, false, false,
    ])
    // The ones that do not need the goal still work.
    expect(t.week_start).toBe(false)
    expect(trueSituations(ctx({ goal: null, done: 0 })).week_start).toBe(true)
  })

  it('judges every situation key the table can use', () => {
    expect(Object.keys(trueSituations(ctx())).sort()).toEqual([...SITUATION_KEYS].sort())
  })
})

describe('placeholderValues', () => {
  it('derives next, remaining and left from the context', () => {
    expect(placeholderValues(ctx({ goal: 5, done: 2, wk: 7, total: 40, remainingSeconds: 601 }))).toEqual({
      goal: 5,
      done: 2,
      next: 3,
      remaining: 3,
      left: 11, // 601 s rounds UP to 11 minutes
      wk: 7,
      total: 40,
    })
  })

  it('never goes negative', () => {
    const values = placeholderValues(ctx({ goal: 2, done: 5, remainingSeconds: -30 }))
    expect(values.remaining).toBe(0)
    expect(values.left).toBe(0)
  })

  it('treats no goal as 0', () => {
    expect(placeholderValues(ctx({ goal: null, done: 0 })).goal).toBe(0)
  })
})

describe('fillPlaceholders', () => {
  const values = { goal: 3, done: 1, next: 2, left: 4, remaining: 2, wk: 9, total: 47 }

  it('fills every known placeholder', () => {
    expect(fillPlaceholders('{done} of {goal}, {next} next, {left} min, {remaining} to go, {wk} wk, {total}', values)).toBe(
      '1 of 3, 2 next, 4 min, 2 to go, 9 wk, 47',
    )
  })

  it('fills the same placeholder more than once', () => {
    expect(fillPlaceholders('{goal}-{goal}', values)).toBe('3-3')
  })

  it('turns an unknown placeholder into an empty string, never leaving braces on screen', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(fillPlaceholders('Hello {nope} there', values)).toBe('Hello  there')
    vi.restoreAllMocks()
  })

  it('warns in development about an unknown placeholder', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fillPlaceholders('{typo}', values)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('typo')
    vi.restoreAllMocks()
  })

  it('does not treat a zero as missing', () => {
    expect(fillPlaceholders('{done} days', { done: 0 })).toBe('0 days')
  })

  it('leaves text without placeholders alone', () => {
    expect(fillPlaceholders('Plain text.', values)).toBe('Plain text.')
  })

  it('does not look up inherited object properties as placeholders', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(fillPlaceholders('{toString}{constructor}', {})).toBe('')
    vi.restoreAllMocks()
  })
})

describe('coarseRemainingSeconds (so the bubble does not re-render every second)', () => {
  // The only two things the mascot reads from the seconds left:
  const minutesLeft = (seconds: number) => Math.ceil(Math.max(0, seconds) / 60)
  const isAlmost = (seconds: number, almost: number) => seconds <= almost

  it('gives exactly the same answers as the real seconds, for every second and many thresholds', () => {
    const thresholds = [0, 1, 59, 60, 61, 90, 120, 179, 180, 181, 240, 300, 600, 900, 1800]
    for (const almost of thresholds) {
      for (let seconds = 0; seconds <= 2000; seconds++) {
        const coarse = coarseRemainingSeconds(seconds, almost)
        expect(minutesLeft(coarse), `minutes at ${seconds}s, threshold ${almost}`).toBe(minutesLeft(seconds))
        expect(isAlmost(coarse, almost), `almost at ${seconds}s, threshold ${almost}`).toBe(isAlmost(seconds, almost))
      }
    }
  })

  it('produces the same words as the real seconds in a full picture of the message', () => {
    for (const seconds of [0, 1, 59, 60, 61, 179, 180, 181, 599, 600, 601, 899, 900]) {
      const real = ctx({ engine: 'running', remainingSeconds: seconds })
      const coarse = ctx({ engine: 'running', remainingSeconds: coarseRemainingSeconds(seconds, 180) })
      expect(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, coarse)).toEqual(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, real))
    }
  })

  it('changes far less often than the seconds do: 16 values over a 15 minute countdown, not 901', () => {
    const seen = new Set<number>()
    for (let seconds = 900; seconds >= 0; seconds--) seen.add(coarseRemainingSeconds(seconds, 180))
    expect(seen.size).toBe(16)
  })

  it('never goes negative, and treats a negative as zero', () => {
    expect(coarseRemainingSeconds(-5, 180)).toBe(0)
    expect(coarseRemainingSeconds(0, 180)).toBe(0)
  })
})

describe('withCacheBuster', () => {
  it('adds ?v= to a plain address', () => {
    expect(withCacheBuster('https://x.test/a.png', 123)).toBe('https://x.test/a.png?v=123')
  })

  it('adds &v= when the address already has a query', () => {
    expect(withCacheBuster('https://x.test/a.png?token=abc', 123)).toBe('https://x.test/a.png?token=abc&v=123')
  })
})

describe('imageFor', () => {
  const content: Pick<MascotContent, 'images'> = {
    images: {
      smile: { kind: 'expression', url: 'https://x.test/smile.png', alt: 'Smiling', width: 180, height: 250, v: 11 },
      wave: { kind: 'expression', url: 'https://x.test/wave.png?token=t', alt: null, width: null, height: null, v: 22 },
    },
  }

  it('returns the picture with its shape and a cache buster', () => {
    expect(imageFor(content, 'smile')).toEqual({ url: 'https://x.test/smile.png?v=11', width: 180, height: 250, alt: 'Smiling' })
  })

  it('uses & when the stored address already has a query', () => {
    expect(imageFor(content, 'wave')?.url).toBe('https://x.test/wave.png?token=t&v=22')
  })

  it('falls back to smile when the expression has no picture', () => {
    expect(imageFor(content, 'cheer')?.url).toBe('https://x.test/smile.png?v=11')
  })

  it('returns null when there is neither the expression nor a smile', () => {
    expect(imageFor({ images: { wave: content.images.wave } }, 'cheer')).toBeNull()
    expect(imageFor({ images: {} }, 'smile')).toBeNull()
  })
})

describe('pickMascotMessage', () => {
  const rows = (...list: [string, number, string, string][]): MascotMessage[] =>
    list.map(([key, priority, expression, message], index) => ({ id: index + 1, key, locale: 'en', priority, expression, message }))

  it('picks the true situation with the lowest priority number', () => {
    const messages = rows(['in_progress', 150, 'smile', 'default'], ['week_start', 140, 'smile', 'fresh'])
    expect(pickMascotMessage(messages, ctx({ done: 0 }))?.text).toBe('fresh')
  })

  it('lets the TABLE decide: changing priorities changes the winner without changing code', () => {
    const before = rows(['one_to_go', 120, 'cheer', 'one more'], ['in_progress', 150, 'smile', 'default'])
    const after = rows(['one_to_go', 200, 'cheer', 'one more'], ['in_progress', 150, 'smile', 'default'])
    const context = ctx({ goal: 3, done: 2 })
    expect(pickMascotMessage(before, context)?.text).toBe('one more')
    expect(pickMascotMessage(after, context)?.text).toBe('default')
  })

  it('breaks a priority tie by id', () => {
    const messages: MascotMessage[] = [
      { id: 9, key: 'in_progress', locale: 'en', priority: 50, expression: 'smile', message: 'second' },
      { id: 2, key: 'in_progress', locale: 'en', priority: 50, expression: 'smile', message: 'first' },
    ]
    expect(pickMascotMessage(messages, ctx())?.text).toBe('first')
  })

  it('ignores rows whose key is unknown', () => {
    const messages = rows(['made_up_situation', 1, 'smile', 'never'], ['in_progress', 150, 'smile', 'ok'])
    expect(pickMascotMessage(messages, ctx())?.text).toBe('ok')
  })

  it('ignores rows whose situation is not true', () => {
    const messages = rows(['paused', 1, 'sleep', 'zzz'], ['in_progress', 150, 'smile', 'ok'])
    expect(pickMascotMessage(messages, ctx({ paused: false }))?.text).toBe('ok')
    expect(pickMascotMessage(messages, ctx({ paused: true }))?.text).toBe('zzz')
  })

  it('ignores a row whose expression has no picture row, when expressions are checked', () => {
    const messages = rows(['paused', 1, 'sleep', 'zzz'], ['in_progress', 150, 'smile', 'ok'])
    expect(pickMascotMessage(messages, ctx({ paused: true }), new Set(['smile']))?.text).toBe('ok')
    expect(pickMascotMessage(messages, ctx({ paused: true }), new Set(['smile', 'sleep']))?.text).toBe('zzz')
  })

  it('does not check expressions when asked not to (null)', () => {
    const messages = rows(['paused', 1, 'sleep', 'zzz'])
    expect(pickMascotMessage(messages, ctx({ paused: true }), null)?.expression).toBe('sleep')
  })

  it('fills the placeholders in the winner', () => {
    const messages = rows(['in_progress', 150, 'smile', 'You are at {next} of {goal}.'])
    expect(pickMascotMessage(messages, ctx({ goal: 4, done: 1 }))?.text).toBe('You are at 2 of 4.')
  })

  it('returns the winner\'s expression', () => {
    const messages = rows(['paused', 1, 'sleep', 'zzz'])
    expect(pickMascotMessage(messages, ctx({ paused: true }))?.expression).toBe('sleep')
  })

  it('returns null for no messages, or none that qualify', () => {
    expect(pickMascotMessage([], ctx())).toBeNull()
    expect(pickMascotMessage(rows(['paused', 1, 'sleep', 'zzz']), ctx({ paused: false }))).toBeNull()
  })

  it('does not change the list it is given', () => {
    const messages = rows(['in_progress', 150, 'smile', 'b'], ['week_start', 140, 'smile', 'a'])
    const copy = JSON.stringify(messages)
    pickMascotMessage(messages, ctx({ done: 0 }))
    expect(JSON.stringify(messages)).toBe(copy)
  })
})

describe('the bundled defaults', () => {
  it('are the 16 seed messages, each for a situation the code knows', () => {
    expect(DEFAULT_MASCOT_MESSAGES).toHaveLength(16)
    for (const row of DEFAULT_MASCOT_MESSAGES) expect(SITUATION_KEYS as readonly string[]).toContain(row.key)
  })

  it('cover every situation the code can judge, so the app always has something to say', () => {
    expect(new Set(DEFAULT_MASCOT_MESSAGES.map((row) => row.key))).toEqual(new Set(SITUATION_KEYS))
  })

  it('always produce a line for any user, because in_progress is always true', () => {
    expect(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, ctx({ goal: null, done: 0 }))).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------
// PARITY: the old way (the design prototype's skey()) against the new way (situations + priority).
// ---------------------------------------------------------------------------------------------

/**
 * TEST-ONLY ORACLE. The prototype's skey() (docs/design/showup-prototype.html, function skey), written
 * out as the same chain of ifs, with `missed_checks` added right after `left_early`. It returns the ONE
 * key the prototype would show. Variable names follow the prototype: c = days done, g = goal.
 *
 * The prototype tracks time as `el` seconds elapsed of 15 minutes, and calls 3 minutes or less left
 * "almost". Here that is expressed through remainingSeconds and the same 180 s threshold.
 */
function prototypeSkey(x: {
  engine: MascotEngineState
  remainingSeconds: number
  done: number
  goal: number
  paused: boolean
  lastOutcome: LastOutcome | null
  total: number
  wk: number
}): string {
  const c = x.done
  const g = x.goal
  if (x.engine === 'checking') return 'checking'
  if (x.engine === 'running') return x.remainingSeconds <= 180 ? 'running_almost' : 'running'
  if (x.engine === 'done') return c > g ? 'done_extra' : c === g ? 'done_goal_hit' : 'done_progress'
  if (x.paused) return 'paused'
  if (x.lastOutcome === 'left_early') return 'left_early'
  if (x.lastOutcome === 'missed_checks') return 'missed_checks'
  if (!x.total) return 'new_user'
  if (c >= g) return 'goal_met'
  if (!x.wk) return 'back_after_miss'
  if (c === g - 1) return 'one_to_go'
  if (g >= 5) return 'high_goal'
  if (!c) return 'week_start'
  return 'in_progress'
}

/** Which message the seed table would show for a key, with the placeholders filled. */
function seedLine(key: string, context: MascotContext): string {
  const row = DEFAULT_MASCOT_MESSAGES.find((message) => message.key === key)
  if (!row) throw new Error(`The seed has no message for ${key}`)
  return fillPlaceholders(row.message, placeholderValues(context))
}

describe('parity with the prototype\'s skey()', () => {
  it('agrees on every reachable case of the grid', () => {
    const engines: MascotEngineState[] = ['idle', 'checking', 'running', 'done']
    const remainingMinutes = [1, 3, 4, 15]
    const lastOutcomes: (LastOutcome | null)[] = [null, 'left_early']
    const totals = [0, 5]
    const weeks = [0, 4]

    let compared = 0
    let skipped = 0
    const disagreements: string[] = []

    for (const engine of engines)
      for (const minutes of remainingMinutes)
        for (let done = 0; done <= 9; done++)
          for (let goal = 1; goal <= 7; goal++)
            for (const paused of [false, true])
              for (const lastOutcome of lastOutcomes)
                for (const total of totals)
                  for (const wk of weeks) {
                    // Impossible: with no showups at all there cannot be days this week or a streak.
                    if (total === 0 && (done > 0 || wk > 0)) {
                      skipped++
                      continue
                    }
                    const context = ctx({
                      goal,
                      done,
                      wk,
                      total,
                      paused,
                      engine,
                      remainingSeconds: minutes * 60,
                      lastOutcome,
                    })
                    const expectedKey = prototypeSkey({ engine, remainingSeconds: minutes * 60, done, goal, paused, lastOutcome, total, wk })
                    const actual = pickMascotMessage(DEFAULT_MASCOT_MESSAGES, context)
                    const expectedRow = DEFAULT_MASCOT_MESSAGES.find((row) => row.key === expectedKey)!
                    compared++

                    if (!actual || actual.text !== seedLine(expectedKey, context) || actual.expression !== expectedRow.expression) {
                      if (disagreements.length < 12) {
                        disagreements.push(
                          `engine=${engine} min=${minutes} done=${done} goal=${goal} paused=${paused} last=${lastOutcome} total=${total} wk=${wk}: ` +
                            `prototype=${expectedKey} app=${actual?.text ?? 'null'}`,
                        )
                      }
                    }
                  }

    expect(disagreements).toEqual([])
    // The grid really was exercised in full, not quietly shrunk. Counting the cases:
    //   engine 4 x minutes 4 x goal 7 x paused 2 x outcome 2 = 448 combinations of the "other" inputs.
    //   total = 5: every done (10) and every streak (2)      -> 448 x 10 x 2 = 8,960 cases
    //   total = 0: only done = 0 and no streak is possible   -> 448 x 1 x 1  =   448 cases
    expect(compared).toBe(8_960 + 448)
    // Everything else in the 448 x 10 x 2 x 2 = 17,920 grid is an impossible state and was skipped.
    expect(skipped).toBe(17_920 - 9_408)
  })

  it('the oracle itself covers every situation key (so the parity test cannot quietly miss one)', () => {
    const seen = new Set<string>()
    for (const engine of ['idle', 'checking', 'running', 'done'] as const)
      for (const minutes of [1, 4])
        for (let done = 0; done <= 8; done++)
          for (let goal = 1; goal <= 7; goal++)
            for (const paused of [false, true])
              for (const lastOutcome of [null, 'left_early', 'missed_checks'] as const)
                for (const total of [0, 5])
                  for (const wk of [0, 4]) {
                    if (total === 0 && (done > 0 || wk > 0)) continue
                    seen.add(prototypeSkey({ engine, remainingSeconds: minutes * 60, done, goal, paused, lastOutcome, total, wk }))
                  }
    expect([...seen].sort()).toEqual([...SITUATION_KEYS].sort())
  })

  it('also agrees for missed_checks (the case added after the prototype), over its own grid', () => {
    // The main grid uses the outcomes {none, left_early} as specified. missed_checks sits right after
    // left_early, so it gets the same treatment here: every state that can sit beneath it.
    let compared = 0
    for (const paused of [false, true])
      for (const total of [0, 5])
        for (const wk of [0, 4])
          for (let done = 0; done <= 4; done++)
            for (let goal = 1; goal <= 7; goal++) {
              if (total === 0 && (done > 0 || wk > 0)) continue
              const context = ctx({ goal, done, wk, total, paused, lastOutcome: 'missed_checks' })
              const expectedKey = prototypeSkey({ engine: 'idle', remainingSeconds: 0, done, goal, paused, lastOutcome: 'missed_checks', total, wk })
              const actual = pickMascotMessage(DEFAULT_MASCOT_MESSAGES, context)
              expect(actual?.text, `paused=${paused} total=${total} wk=${wk} done=${done} goal=${goal}`).toBe(seedLine(expectedKey, context))
              compared++
            }
    expect(compared).toBeGreaterThan(100)
  })

  it('missed_checks beats new_user and the rest of the idle messages, but not paused', () => {
    // A brand-new user whose first timer failed on missed checks: the failure message, not the welcome.
    const newUser = ctx({ goal: 3, done: 0, wk: 0, total: 0, lastOutcome: 'missed_checks' })
    expect(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, newUser)?.text).toBe(seedLine('missed_checks', newUser))
    // paused (70) is a lower number than missed_checks (85), so a paused week wins.
    const pausedToo = ctx({ paused: true, lastOutcome: 'missed_checks' })
    expect(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, pausedToo)?.text).toBe(seedLine('paused', pausedToo))
  })

  it('left_early beats new_user in the same way', () => {
    const newUser = ctx({ goal: 3, done: 0, wk: 0, total: 0, lastOutcome: 'left_early' })
    expect(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, newUser)?.text).toBe(seedLine('left_early', newUser))
  })

  it('shows what each situation says, as a readable summary of the default behaviour', () => {
    expect(trueKeys(ctx({ engine: 'running', remainingSeconds: 600 }))).toContain('running')
    expect(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, ctx({ engine: 'running', remainingSeconds: 600 }))?.text).toBe('Stay put. 10 min to go.')
    expect(pickMascotMessage(DEFAULT_MASCOT_MESSAGES, ctx({ engine: 'running', remainingSeconds: 150 }))?.text).toBe('Almost there. 3 min left.')
  })
})
