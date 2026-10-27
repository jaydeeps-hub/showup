import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MASCOT_MESSAGES } from '../config/mascotDefaults'
import type { MascotContent } from '../types'
import type { MascotFetchResult } from './mascotService'
import {
  BUNDLED_MASCOT_CONTENT,
  MASCOT_REFRESH_AFTER_MS,
  MASCOT_STORAGE_KEY,
  MascotStore,
  type StorageLike,
} from './mascotStore'

function content(version: number, words = 'hello'): MascotContent {
  return {
    version,
    images: { smile: { kind: 'expression', url: 'https://x.test/smile.png', alt: null, width: 1, height: 1, v: version } },
    messages: [{ id: 1, key: 'in_progress', locale: 'en', priority: 150, expression: 'smile', message: words }],
  }
}

const ok = (c: MascotContent): MascotFetchResult => ({ status: 'ok', content: c })
const failed: MascotFetchResult = { status: 'error' }

/** A tiny in-memory stand-in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

function setup(options: { saved?: MascotContent | string | null; fetches?: MascotFetchResult[]; storage?: StorageLike | null } = {}) {
  const storage =
    options.storage !== undefined
      ? options.storage
      : memoryStorage(
          options.saved === undefined || options.saved === null
            ? {}
            : { [MASCOT_STORAGE_KEY]: typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved) },
        )
  const queue = [...(options.fetches ?? [])]
  const fetchContent = vi.fn(async () => queue.shift() ?? failed)
  let clock = 1_000_000
  const store = new MascotStore({ fetchContent, storage, now: () => clock })
  return { store, fetchContent, storage, advance: (ms: number) => (clock += ms), tell: vi.fn() }
}

describe('what the store shows at the start (no waiting)', () => {
  it('shows the saved copy instantly', () => {
    const { store } = setup({ saved: content(5, 'saved words') })
    expect(store.getSnapshot().version).toBe(5)
    expect(store.getSnapshot().messages[0].message).toBe('saved words')
  })

  it('shows the bundled words when nothing was saved', () => {
    const { store } = setup()
    expect(store.getSnapshot()).toBe(BUNDLED_MASCOT_CONTENT)
    expect(store.getSnapshot().messages).toEqual([...DEFAULT_MASCOT_MESSAGES])
  })

  it('the bundled content has 16 messages and no pictures', () => {
    expect(BUNDLED_MASCOT_CONTENT.messages).toHaveLength(16)
    expect(BUNDLED_MASCOT_CONTENT.images).toEqual({})
  })

  it.each([
    ['broken JSON', '{not json'],
    ['the wrong shape', JSON.stringify({ surprise: true })],
    ['a copy with no messages', JSON.stringify({ version: 3, images: {}, messages: [] })],
  ])('ignores a saved copy that is %s, and shows the bundled words', (_label, saved) => {
    expect(setup({ saved }).store.getSnapshot()).toBe(BUNDLED_MASCOT_CONTENT)
  })

  it('works when browser storage is unavailable', () => {
    const { store } = setup({ storage: null })
    expect(store.getSnapshot()).toBe(BUNDLED_MASCOT_CONTENT)
  })

  it('works when reading storage throws', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
    }
    expect(setup({ storage }).store.getSnapshot()).toBe(BUNDLED_MASCOT_CONTENT)
  })
})

describe('refreshing in the background', () => {
  it('always asks on launch', async () => {
    const { store, fetchContent } = setup({ saved: content(5), fetches: [ok(content(5))] })
    await store.startup()
    expect(fetchContent).toHaveBeenCalledTimes(1)
    expect(fetchContent).toHaveBeenCalledWith('en')
  })

  it('swaps in new content when the version changed, and saves it', async () => {
    const { store, storage } = setup({ saved: content(5, 'old'), fetches: [ok(content(6, 'new'))] })
    const heard = vi.fn()
    store.subscribe(heard)
    await store.startup()

    expect(store.getSnapshot().messages[0].message).toBe('new')
    expect(heard).toHaveBeenCalledTimes(1)
    expect(JSON.parse((storage as ReturnType<typeof memoryStorage>).data[MASCOT_STORAGE_KEY]).version).toBe(6)
  })

  it('does NOT swap (or tell anyone) when the version is the same', async () => {
    const { store } = setup({ saved: content(5, 'old'), fetches: [ok(content(5, 'edited but same version'))] })
    const before = store.getSnapshot()
    const heard = vi.fn()
    store.subscribe(heard)
    await store.startup()

    expect(store.getSnapshot()).toBe(before)
    expect(heard).not.toHaveBeenCalled()
  })

  it('replaces the bundled words with the first real content, whatever its version', async () => {
    const { store } = setup({ fetches: [ok(content(0, 'from the database'))] })
    await store.startup()
    expect(store.getSnapshot().messages[0].message).toBe('from the database')
  })

  it('keeps the saved copy when the ask fails', async () => {
    const { store } = setup({ saved: content(5, 'saved'), fetches: [failed] })
    await store.startup()
    expect(store.getSnapshot().messages[0].message).toBe('saved')
  })

  it('keeps the bundled words when there is nothing saved and the ask fails', async () => {
    const { store } = setup({ fetches: [failed] })
    await store.startup()
    expect(store.getSnapshot()).toBe(BUNDLED_MASCOT_CONTENT)
  })

  it('keeps what it has when the answer has no messages (an empty answer must not wipe good words)', async () => {
    const empty: MascotContent = { version: 99, images: {}, messages: [] }
    const { store } = setup({ saved: content(5, 'saved'), fetches: [ok(empty)] })
    await store.startup()
    expect(store.getSnapshot().version).toBe(5)
    expect(store.getSnapshot().messages[0].message).toBe('saved')
  })

  it('keeps the bundled words when the first answer has no messages', async () => {
    const empty: MascotContent = { version: 99, images: {}, messages: [] }
    const { store } = setup({ fetches: [ok(empty)] })
    await store.startup()
    expect(store.getSnapshot()).toBe(BUNDLED_MASCOT_CONTENT)
  })

  it('still works if saving to storage fails', async () => {
    const storage: StorageLike = { getItem: () => null, setItem: () => { throw new Error('full') } }
    const { store } = setup({ storage, fetches: [ok(content(7, 'fresh'))] })
    await store.startup()
    expect(store.getSnapshot().messages[0].message).toBe('fresh')
  })

  it('two asks at once share one request', async () => {
    const { store, fetchContent } = setup({ fetches: [ok(content(1))] })
    await Promise.all([store.refresh(), store.refresh(), store.startup()])
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('can ask again after the previous ask finished', async () => {
    const { store, fetchContent } = setup({ fetches: [ok(content(1)), ok(content(2))] })
    await store.refresh()
    await store.refresh()
    expect(fetchContent).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().version).toBe(2)
  })

  it('a stopped-listening subscriber is not told', async () => {
    const { store } = setup({ fetches: [ok(content(1))] })
    const heard = vi.fn()
    const stop = store.subscribe(heard)
    stop()
    await store.startup()
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('refreshing when the tab becomes visible', () => {
  it('asks if nothing has been asked yet', async () => {
    const { store, fetchContent } = setup({ fetches: [ok(content(1))] })
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('does not ask again within 5 minutes of the last ask', async () => {
    const { store, fetchContent, advance } = setup({ fetches: [ok(content(1)), ok(content(2))] })
    await store.startup()
    advance(MASCOT_REFRESH_AFTER_MS - 1_000)
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('asks again once the last ask is more than 5 minutes old', async () => {
    const { store, fetchContent, advance } = setup({ fetches: [ok(content(1)), ok(content(2))] })
    await store.startup()
    advance(MASCOT_REFRESH_AFTER_MS + 1_000)
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().version).toBe(2)
  })

  it('counts a failed ask as an ask, so a flaky network is not hammered', async () => {
    const { store, fetchContent, advance } = setup({ fetches: [failed, ok(content(2))] })
    await store.startup()
    advance(60_000)
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('the 5 minute rule is exactly 5 minutes', () => {
    expect(MASCOT_REFRESH_AFTER_MS).toBe(300_000)
  })
})
