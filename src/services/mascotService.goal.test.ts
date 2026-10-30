import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MascotContent } from '../types'

vi.mock('./supabaseClient', () => ({ supabase: null, isSupabaseConfigured: true }))

const { parseMascotContent } = await import('./mascotService')
const { MascotStore, MASCOT_STORAGE_KEY } = await import('./mascotStore')
const { pickGoalMascotMessage, pickMascotMessage } = await import('../utils/mascot')

/**
 * Phase 10c: the service reads `screen` and `label` from get_mascot_content, and the store keeps working with
 * old saved copies that have neither.
 */

const goalJson = { id: 17, key: 'goal_1', screen: 'goal', locale: 'en', priority: 1, expression: 'smile', message: 'bubble', label: 'A gentle start' }
const homeJson = { id: 2, key: 'in_progress', screen: 'home', locale: 'en', priority: 150, expression: 'smile', message: 'Show up today and you’re at {next} of {goal}.', label: null }
const oldJson = { id: 3, key: 'week_start', locale: 'en', priority: 140, expression: 'smile', message: 'fresh start' }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseMascotContent: screen and label', () => {
  it('reads screen and label from every message', () => {
    const parsed = parseMascotContent({ version: 1, images: {}, messages: [goalJson, homeJson] })
    expect(parsed?.messages).toEqual([
      { id: 17, key: 'goal_1', screen: 'goal', locale: 'en', priority: 1, expression: 'smile', message: 'bubble', label: 'A gentle start' },
      { id: 2, key: 'in_progress', screen: 'home', locale: 'en', priority: 150, expression: 'smile', message: 'Show up today and you’re at {next} of {goal}.', label: null },
    ])
  })

  it('treats a message with no screen field as a Home message', () => {
    const parsed = parseMascotContent({ version: 1, images: {}, messages: [oldJson] })
    expect(parsed?.messages[0].screen).toBe('home')
    expect(parsed?.messages[0].label).toBeNull()
  })

  it('treats a null screen as Home too', () => {
    expect(parseMascotContent({ version: 1, images: {}, messages: [{ ...oldJson, screen: null }] })?.messages[0].screen).toBe('home')
  })

  it('leaves out a message for a screen this release does not know, so it can never show on Home by mistake', () => {
    const parsed = parseMascotContent({ version: 1, images: {}, messages: [{ ...homeJson, id: 5, screen: 'gym' }, goalJson] })
    expect(parsed?.messages.map((m) => m.id)).toEqual([17])
  })

  it('reads an empty, blank or non-text label as no label', () => {
    const labels = ['', '   ', 5, null, undefined].map((label, i) => parseMascotContent({ version: 1, images: {}, messages: [{ ...goalJson, id: i + 1, label }] })?.messages[0].label)
    expect(labels).toEqual([null, null, null, null, null])
  })
})

describe('old saved content keeps working', () => {
  function storeWith(saved: unknown) {
    const items = new Map<string, string>()
    if (saved !== undefined) items.set(MASCOT_STORAGE_KEY, JSON.stringify(saved))
    return new MascotStore({
      fetchContent: async () => ({ status: 'error' }),
      storage: { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) },
      now: () => 0,
    })
  }

  it('a saved copy from before Phase 10 (no screen, no label) is Home content and the goal screen falls back to the bundled rows', () => {
    const saved: MascotContent = {
      version: 7,
      images: {},
      messages: [{ id: 3, key: 'week_start', locale: 'en', priority: 140, expression: 'smile', message: 'fresh start' }, { id: 4, key: 'in_progress', locale: 'en', priority: 150, expression: 'smile', message: 'default' }],
    }
    const content = storeWith(saved).getSnapshot()
    expect(content.version).toBe(7)
    expect(pickMascotMessage(content.messages, { goal: 3, done: 0, wk: 0, total: 5, paused: false, engine: 'idle', remainingSeconds: 0, lastOutcome: null, almostSeconds: 180 })?.text).toBe('fresh start')
    expect(pickGoalMascotMessage(content.messages, 7)).toEqual({
      expression: 'sleep',
      text: 'Pick a number you can keep. Rest days are part of the plan.',
      label: 'Are you sure? Rest days are important too.',
    })
  })

  it('a saved copy that has goal rows keeps them across a restart', () => {
    const saved = { version: 9, images: {}, messages: [homeJson, { ...goalJson, label: 'edited in the table' }] }
    const content = storeWith(saved).getSnapshot()
    expect(pickGoalMascotMessage(content.messages, 1)?.label).toBe('edited in the table')
  })

  it('fresh content from the database replaces the saved copy and carries the goal rows', async () => {
    const fresh: MascotContent = { version: 20, images: {}, messages: parseMascotContent({ version: 20, images: {}, messages: [homeJson, goalJson] })!.messages }
    const items = new Map<string, string>([[MASCOT_STORAGE_KEY, JSON.stringify({ version: 7, images: {}, messages: [oldJson] })]])
    const store = new MascotStore({
      fetchContent: async () => ({ status: 'ok', content: fresh }),
      storage: { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) },
      now: () => 0,
    })
    await store.startup()
    expect(store.getSnapshot().version).toBe(20)
    expect(pickGoalMascotMessage(store.getSnapshot().messages, 1)?.label).toBe('A gentle start')
    expect(JSON.parse(items.get(MASCOT_STORAGE_KEY)!).messages.find((m: { key: string }) => m.key === 'goal_1').label).toBe('A gentle start')
  })
})
