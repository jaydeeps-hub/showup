import { describe, expect, it } from 'vitest'
import { DEFAULT_GOAL_MASCOT_MESSAGES, DEFAULT_MASCOT_MESSAGES } from '../config/mascotDefaults'
import type { MascotMessage } from '../types'
import {
  GOAL_DAY_OPTIONS,
  GOAL_SITUATION_KEYS,
  goalMessagesFrom,
  pickGoalMascotMessage,
  pickMascotMessage,
  screenOf,
  SITUATION_KEYS,
  trueGoalSituations,
  trueSituations,
  type MascotContext,
} from './mascot'

/**
 * The goal screen's mascot (Phase 10c): goal_1 ... goal_7, the screen filter, old content with no `screen`,
 * and the fallback to the bundled goal rows. The Home behaviour is tested in mascot.test.ts, unchanged.
 */

const BUBBLE = 'Pick a number you can keep. Rest days are part of the plan.'

/** The expected result for each number, written out by hand from docs/backend/10a_onboarding_mascot.sql. */
const EXPECTED = [
  { days: 1, expression: 'smile', label: 'A gentle start' },
  { days: 2, expression: 'smile', label: 'Light and steady' },
  { days: 3, expression: 'smile', label: 'Steady' },
  { days: 4, expression: 'smile', label: 'Committed' },
  { days: 5, expression: 'lift', label: 'A strong week' },
  { days: 6, expression: 'lift', label: 'Nearly every day' },
  { days: 7, expression: 'sleep', label: 'Are you sure? Rest days are important too.' },
] as const

const goalRow = (n: number, overrides: Partial<MascotMessage> = {}): MascotMessage => ({
  id: 100 + n,
  key: `goal_${n}`,
  screen: 'goal',
  locale: 'en',
  priority: n,
  expression: 'smile',
  message: `bubble ${n}`,
  label: `label ${n}`,
  ...overrides,
})

const homeRow = (key: string, priority: number, message: string, screen?: MascotMessage['screen']): MascotMessage => ({
  id: priority,
  key,
  locale: 'en',
  priority,
  expression: 'smile',
  message,
  ...(screen ? { screen } : {}),
})

function homeContext(overrides: Partial<MascotContext> = {}): MascotContext {
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

describe('goal situations: goal_N is true exactly when the selected number is N', () => {
  for (const n of GOAL_DAY_OPTIONS) {
    it(`goal_${n}: true only for ${n}`, () => {
      for (const selected of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(trueGoalSituations(selected)[`goal_${n}`]).toBe(selected === n)
      }
    })
  }

  it('has exactly the keys goal_1 ... goal_7, and at most one is true', () => {
    expect(GOAL_SITUATION_KEYS).toEqual(['goal_1', 'goal_2', 'goal_3', 'goal_4', 'goal_5', 'goal_6', 'goal_7'])
    for (const selected of [1, 2, 3, 4, 5, 6, 7]) {
      expect(Object.entries(trueGoalSituations(selected)).filter(([, isTrue]) => isTrue)).toEqual([[`goal_${selected}`, true]])
    }
    expect(Object.values(trueGoalSituations(0)).some(Boolean)).toBe(false)
    expect(Object.values(trueGoalSituations(8)).some(Boolean)).toBe(false)
    expect(Object.values(trueGoalSituations(2.5)).some(Boolean)).toBe(false)
  })

  it('are not Home situations, so the Home list and its checks do not change', () => {
    for (const key of GOAL_SITUATION_KEYS) expect(SITUATION_KEYS as readonly string[]).not.toContain(key)
    expect(Object.keys(trueSituations(homeContext())).sort()).toEqual([...SITUATION_KEYS].sort())
  })
})

describe('pickGoalMascotMessage: one test per goal key, with the bundled words', () => {
  for (const { days, expression, label } of EXPECTED) {
    it(`goal_${days}: ${expression}, the bubble, and "${label}"`, () => {
      const pick = pickGoalMascotMessage(DEFAULT_GOAL_MASCOT_MESSAGES, days)
      expect(pick).toEqual({ expression, text: BUBBLE, label })
    })
  }

  it('returns nothing for a number outside 1 to 7', () => {
    expect(pickGoalMascotMessage(DEFAULT_GOAL_MASCOT_MESSAGES, 0)).toBeNull()
    expect(pickGoalMascotMessage(DEFAULT_GOAL_MASCOT_MESSAGES, 8)).toBeNull()
  })

  it('uses the content it is given, row by row', () => {
    const messages = [1, 2, 3, 4, 5, 6, 7].map((n) => goalRow(n))
    for (const n of GOAL_DAY_OPTIONS) {
      expect(pickGoalMascotMessage(messages, n)).toEqual({ expression: 'smile', text: `bubble ${n}`, label: `label ${n}` })
    }
  })

  it('takes the lowest priority, then the lowest id, when two rows share a key', () => {
    const messages = [goalRow(3, { id: 9, priority: 5, message: 'later' }), goalRow(3, { id: 8, priority: 2, message: 'first' }), goalRow(3, { id: 7, priority: 2, message: 'tie, lower id' })]
    expect(pickGoalMascotMessage(messages, 3)?.text).toBe('tie, lower id')
  })

  it('skips a row whose expression has no picture, only when the known pictures are given', () => {
    const messages = [goalRow(5, { id: 1, priority: 1, expression: 'lift', message: 'lift line' }), goalRow(5, { id: 2, priority: 2, expression: 'smile', message: 'smile line' })]
    expect(pickGoalMascotMessage(messages, 5, new Set(['smile']))?.text).toBe('smile line')
    expect(pickGoalMascotMessage(messages, 5, new Set(['smile', 'lift']))?.text).toBe('lift line')
    expect(pickGoalMascotMessage(messages, 5, null)?.text).toBe('lift line')
  })

  it('gives no caption when the row has none', () => {
    expect(pickGoalMascotMessage([goalRow(2, { label: null })], 2)?.label).toBeNull()
    const { label: _unused, ...withoutLabel } = goalRow(2)
    expect(pickGoalMascotMessage([withoutLabel], 2)?.label).toBeNull()
  })

  it('ignores Home rows that happen to be in the same list', () => {
    const messages = [goalRow(3), homeRow('in_progress', 150, 'a home line', 'home'), homeRow('goal_3', 1, 'wrongly marked home', 'home')]
    expect(pickGoalMascotMessage(messages, 3)?.text).toBe('bubble 3')
  })
})

describe('the fallback to the bundled goal rows', () => {
  it('uses them when the content has no goal rows at all (old saved copy, or Phase 10a not applied)', () => {
    const homeOnly = [homeRow('in_progress', 150, 'show up', 'home'), homeRow('checking', 10, 'wait')]
    expect(goalMessagesFrom(homeOnly)).toBe(DEFAULT_GOAL_MASCOT_MESSAGES)
    expect(goalMessagesFrom([])).toBe(DEFAULT_GOAL_MASCOT_MESSAGES)
    expect(pickGoalMascotMessage(homeOnly, 4)).toEqual({ expression: 'smile', text: BUBBLE, label: 'Committed' })
  })

  it('does not mix: when the database has goal rows, only they are used, even if some numbers are missing', () => {
    const partial = [goalRow(1), goalRow(2)]
    expect(goalMessagesFrom(partial)).toEqual(partial)
    expect(pickGoalMascotMessage(partial, 1)?.text).toBe('bubble 1')
    expect(pickGoalMascotMessage(partial, 6)).toBeNull()
  })

  it('is the 7 bundled rows, with the exact words, in order, with negative ids', () => {
    expect(DEFAULT_GOAL_MASCOT_MESSAGES).toHaveLength(7)
    expect(DEFAULT_GOAL_MASCOT_MESSAGES.map((row) => row.key)).toEqual(GOAL_SITUATION_KEYS)
    expect(DEFAULT_GOAL_MASCOT_MESSAGES.map((row) => row.priority)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(DEFAULT_GOAL_MASCOT_MESSAGES.every((row) => row.screen === 'goal' && row.locale === 'en' && row.message === BUBBLE)).toBe(true)
    expect(DEFAULT_GOAL_MASCOT_MESSAGES.every((row) => row.id < 0)).toBe(true)
    expect(DEFAULT_GOAL_MASCOT_MESSAGES.map((row) => [row.expression, row.label])).toEqual(EXPECTED.map((e) => [e.expression, e.label]))
  })

  it('keeps ids apart from the Home defaults', () => {
    const ids = [...DEFAULT_MASCOT_MESSAGES, ...DEFAULT_GOAL_MASCOT_MESSAGES].map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Home is not affected by the screen field', () => {
  it('Home still has its 16 defaults, none of them a goal row', () => {
    expect(DEFAULT_MASCOT_MESSAGES).toHaveLength(16)
    expect(DEFAULT_MASCOT_MESSAGES.some((row) => screenOf(row) !== 'home')).toBe(false)
  })

  it('treats a row with no screen field as a Home row (old cached content, old bundled defaults)', () => {
    expect(screenOf({})).toBe('home')
    expect(screenOf({ screen: 'home' })).toBe('home')
    expect(screenOf({ screen: 'goal' })).toBe('goal')
    const oldContent = [homeRow('week_start', 140, 'fresh'), homeRow('in_progress', 150, 'default')]
    expect(pickMascotMessage(oldContent, homeContext({ done: 0 }))?.text).toBe('fresh')
    expect(pickMascotMessage(oldContent, homeContext({ done: 1 }))?.text).toBe('default')
  })

  it('a Home pick carries the caption of its row when it has one, and null when it has none', () => {
    const withCaption = { ...homeRow('in_progress', 150, 'default', 'home'), label: 'a caption' }
    expect(pickMascotMessage([withCaption], homeContext())?.label).toBe('a caption')
    expect(pickMascotMessage([homeRow('in_progress', 150, 'default', 'home')], homeContext())?.label).toBeNull()
  })

  it('Home ignores goal rows, even ones whose key would be a true Home situation', () => {
    const messages = [homeRow('week_start', 1, 'sneaky goal-screen line', 'goal'), homeRow('in_progress', 150, 'home default', 'home')]
    expect(pickMascotMessage(messages, homeContext({ done: 0 }))?.text).toBe('home default')
  })

  it('Home and goal rows can sit in one list and each screen sees only its own', () => {
    const mixed = [...DEFAULT_MASCOT_MESSAGES, ...DEFAULT_GOAL_MASCOT_MESSAGES]
    expect(pickMascotMessage(mixed, homeContext({ goal: 3, done: 1 }))?.text).toBe('Show up today and you’re at 2 of 3.')
    expect(pickGoalMascotMessage(mixed, 5)?.label).toBe('A strong week')
  })

  it('asking for the goal screen through pickMascotMessage finds no Home situations in goal rows', () => {
    expect(pickMascotMessage(DEFAULT_GOAL_MASCOT_MESSAGES, homeContext(), null, 'goal')).toBeNull()
    expect(pickMascotMessage(DEFAULT_GOAL_MASCOT_MESSAGES, homeContext())).toBeNull()
  })

  it('the existing third parameter is still the set of known expressions', () => {
    const messages = [homeRow('paused', 70, 'zzz'), homeRow('in_progress', 150, 'ok')].map((row, i) => ({ ...row, expression: i === 0 ? 'sleep' : 'smile' }))
    expect(pickMascotMessage(messages, homeContext({ paused: true }), new Set(['smile']))?.text).toBe('ok')
    expect(pickMascotMessage(messages, homeContext({ paused: true }), new Set(['smile', 'sleep']))?.text).toBe('zzz')
  })
})
