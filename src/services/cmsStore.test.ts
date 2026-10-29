import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CMS_CONTENT } from '../config/cmsDefaults'
import type { CmsContent, CmsItem } from '../types'
import type { CmsFetchResult } from './cmsService'
import { CMS_REFRESH_AFTER_MS, CMS_STORAGE_KEY, CmsStore, type StorageLike } from './cmsStore'

const item = (id: number, position: number, heading = `Heading ${id}`): CmsItem => ({
  id,
  slug: `s${id}`,
  position,
  heading,
  subheading: '',
  image_url: `https://x.test/${id}.png`,
  image_alt: null,
  v: id,
})

/** Content with both categories on. */
const both = (version: string, heading = 'H'): CmsContent => ({
  version,
  categories: { landing_carousel: [item(1, 10, heading)], quick_start: [item(2, 10, heading)] },
})

const ok = (content: CmsContent): CmsFetchResult => ({ status: 'ok', content })
const failed: CmsFetchResult = { status: 'error' }

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

function setup(options: { saved?: CmsContent | string | null; fetches?: CmsFetchResult[]; storage?: StorageLike | null } = {}) {
  const storage =
    options.storage !== undefined
      ? options.storage
      : memoryStorage(
          options.saved === undefined || options.saved === null
            ? {}
            : { [CMS_STORAGE_KEY]: typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved) },
        )
  const queue = [...(options.fetches ?? [])]
  const fetchContent = vi.fn(async () => queue.shift() ?? failed)
  let clock = 1_000_000
  const store = new CmsStore({ fetchContent, storage, now: () => clock })
  return { store, fetchContent, storage, advance: (ms: number) => (clock += ms) }
}

describe('the bundled starting content', () => {
  it('has 4 landing carousel cards and 4 Quick Start slides, in order, with no pictures', () => {
    const { landing_carousel, quick_start } = DEFAULT_CMS_CONTENT.categories
    expect(landing_carousel).toHaveLength(4)
    expect(quick_start).toHaveLength(4)
    expect(landing_carousel?.map((i) => i.position)).toEqual([10, 20, 30, 40])
    expect(quick_start?.map((i) => i.position)).toEqual([10, 20, 30, 40])
    for (const i of [...(landing_carousel ?? []), ...(quick_start ?? [])]) expect(i.image_url).toBe('')
  })

  it('has the headings from the SQL file', () => {
    expect(DEFAULT_CMS_CONTENT.categories.landing_carousel?.map((i) => i.heading)).toEqual([
      'Getting to the gym is the biggest step.',
      'Keep the promise you made to yourself.',
      'Fifteen minutes is enough to count.',
      'Rest days are part of the plan.',
    ])
    expect(DEFAULT_CMS_CONTENT.categories.quick_start?.map((i) => i.heading)).toEqual([
      'Add your gym',
      'Set your weekly goal',
      'Tap Show up, then stay 15 minutes',
      'Watch your week fill in',
    ])
  })

  it('keeps the curly apostrophe in the show-up slide', () => {
    expect(DEFAULT_CMS_CONTENT.categories.quick_start?.[2].subheading).toContain('Your phone’s location confirms you’re really')
  })

  it('uses ids that cannot clash with real rows', () => {
    const ids = [...(DEFAULT_CMS_CONTENT.categories.landing_carousel ?? []), ...(DEFAULT_CMS_CONTENT.categories.quick_start ?? [])].map((i) => i.id)
    expect(ids.every((id) => id < 0)).toBe(true)
    expect(new Set(ids).size).toBe(8)
  })
})

describe('what is shown at the start (no waiting)', () => {
  it('shows the saved copy instantly', () => {
    expect(setup({ saved: both('5-2', 'saved words') }).store.getSnapshot().version).toBe('5-2')
  })

  it('shows the bundled content when nothing was ever saved or fetched', () => {
    expect(setup().store.getSnapshot()).toBe(DEFAULT_CMS_CONTENT)
  })

  it.each([
    ['broken JSON', '{not json'],
    ['the wrong shape', JSON.stringify({ surprise: true })],
    ['a copy with no version', JSON.stringify({ categories: {} })],
  ])('ignores a saved copy that is %s, and shows the bundled content', (_label, saved) => {
    expect(setup({ saved }).store.getSnapshot()).toBe(DEFAULT_CMS_CONTENT)
  })

  it('works when browser storage is unavailable', () => {
    expect(setup({ storage: null }).store.getSnapshot()).toBe(DEFAULT_CMS_CONTENT)
  })

  it('works when reading storage throws', () => {
    const storage: StorageLike = { getItem: () => { throw new Error('blocked') }, setItem: () => {} }
    expect(setup({ storage }).store.getSnapshot()).toBe(DEFAULT_CMS_CONTENT)
  })

  it('a saved copy with everything switched off is a real state, not "nothing saved"', () => {
    const allOff: CmsContent = { version: '9-0', categories: {} }
    expect(setup({ saved: allOff }).store.getSnapshot()).toEqual(allOff)
  })
})

describe('the bundled content is used ONLY when there is nothing else', () => {
  it('is used when the first ask fails and nothing is saved', async () => {
    const { store } = setup({ fetches: [failed] })
    await store.startup()
    expect(store.getSnapshot()).toBe(DEFAULT_CMS_CONTENT)
  })

  it('is NOT used when the ask fails but a saved copy exists: the saved copy stays', async () => {
    const { store } = setup({ saved: both('5-2', 'saved words'), fetches: [failed] })
    await store.startup()
    expect(store.getSnapshot().categories.quick_start?.[0].heading).toBe('saved words')
  })

  it('is NOT used after one success even if a later ask fails', async () => {
    const { store, advance } = setup({ fetches: [ok(both('1-2', 'first')), failed] })
    await store.startup()
    advance(CMS_REFRESH_AFTER_MS + 1000)
    await store.onBecameVisible()
    expect(store.getSnapshot().categories.quick_start?.[0].heading).toBe('first')
  })

  it('is replaced by the first real answer, whatever its version', async () => {
    const { store } = setup({ fetches: [ok(both('0-0', 'real'))] })
    await store.startup()
    expect(store.getSnapshot().categories.quick_start?.[0].heading).toBe('real')
  })
})

describe('a category the database LEFT OUT is switched off, and is not filled in with the defaults', () => {
  it('a successful answer without quick_start leaves quick_start off, even though defaults exist', async () => {
    const { store } = setup({ fetches: [ok({ version: '2-1', categories: { landing_carousel: [item(1, 10)] } })] })
    await store.startup()
    expect(store.getSnapshot().categories.landing_carousel).toHaveLength(1)
    expect(store.getSnapshot().categories.quick_start).toBeUndefined()
    // The bundled Quick Start has 4 slides; none of them leaked in.
    expect(JSON.stringify(store.getSnapshot())).not.toContain('Add your gym')
  })

  it('a successful answer without landing_carousel leaves it off', async () => {
    const { store } = setup({ fetches: [ok({ version: '2-1', categories: { quick_start: [item(1, 10)] } })] })
    await store.startup()
    expect(store.getSnapshot().categories.landing_carousel).toBeUndefined()
    expect(JSON.stringify(store.getSnapshot())).not.toContain('biggest step')
  })

  it('a successful answer with NO categories turns everything off and replaces what was showing', async () => {
    const { store } = setup({ saved: both('5-2'), fetches: [ok({ version: '6-0', categories: {} })] })
    await store.startup()
    expect(store.getSnapshot().categories).toEqual({})
  })

  it('an off category stays off after it is saved and loaded again', async () => {
    const first = setup({ fetches: [ok({ version: '2-1', categories: { landing_carousel: [item(1, 10)] } })] })
    await first.store.startup()
    const saved = (first.storage as ReturnType<typeof memoryStorage>).data[CMS_STORAGE_KEY]
    const second = setup({ saved })
    expect(second.store.getSnapshot().categories.quick_start).toBeUndefined()
  })

  it('a category that was on and is later switched off disappears', async () => {
    const { store, advance } = setup({ fetches: [ok(both('1-2')), ok({ version: '2-1', categories: { landing_carousel: [item(1, 10)] } })] })
    await store.startup()
    expect(store.getSnapshot().categories.quick_start).toHaveLength(1)
    advance(CMS_REFRESH_AFTER_MS + 1000)
    await store.onBecameVisible()
    expect(store.getSnapshot().categories.quick_start).toBeUndefined()
  })
})

describe('refreshing in the background', () => {
  it('always asks on launch', async () => {
    const { store, fetchContent } = setup({ saved: both('5-2'), fetches: [ok(both('5-2'))] })
    await store.startup()
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('swaps in the answer when the version DIFFERS, and saves it', async () => {
    const { store, storage } = setup({ saved: both('5-2', 'old'), fetches: [ok(both('6-2', 'new'))] })
    const heard = vi.fn()
    store.subscribe(heard)
    await store.startup()
    expect(store.getSnapshot().categories.quick_start?.[0].heading).toBe('new')
    expect(heard).toHaveBeenCalledTimes(1)
    expect(JSON.parse((storage as ReturnType<typeof memoryStorage>).data[CMS_STORAGE_KEY]).version).toBe('6-2')
  })

  it('swaps when the version differs in ANY way, even to an older-looking one (it is text, not a number)', async () => {
    const { store } = setup({ saved: both('9-2', 'newer looking'), fetches: [ok(both('1-2', 'older looking'))] })
    await store.startup()
    expect(store.getSnapshot().version).toBe('1-2')
  })

  it('notices a change in the NUMBER of rows even when the first part of the version is the same', async () => {
    const { store } = setup({ saved: both('5-2', 'old'), fetches: [ok(both('5-3', 'one more row'))] })
    await store.startup()
    expect(store.getSnapshot().categories.quick_start?.[0].heading).toBe('one more row')
  })

  it('does NOT swap (or tell anyone) when the version is the same', async () => {
    const { store } = setup({ saved: both('5-2', 'old'), fetches: [ok(both('5-2', 'edited but same version'))] })
    const before = store.getSnapshot()
    const heard = vi.fn()
    store.subscribe(heard)
    await store.startup()
    expect(store.getSnapshot()).toBe(before)
    expect(heard).not.toHaveBeenCalled()
  })

  it('still works if saving to storage fails', async () => {
    const storage: StorageLike = { getItem: () => null, setItem: () => { throw new Error('full') } }
    const { store } = setup({ storage, fetches: [ok(both('7-2', 'fresh'))] })
    await store.startup()
    expect(store.getSnapshot().categories.quick_start?.[0].heading).toBe('fresh')
  })

  it('two asks at once share one request', async () => {
    const { store, fetchContent } = setup({ fetches: [ok(both('1-2'))] })
    await Promise.all([store.refresh(), store.refresh(), store.startup()])
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('a stopped-listening subscriber is not told', async () => {
    const { store } = setup({ fetches: [ok(both('1-2'))] })
    const heard = vi.fn()
    store.subscribe(heard)()
    await store.startup()
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('refreshing when the tab becomes visible', () => {
  it('asks if nothing has been asked yet', async () => {
    const { store, fetchContent } = setup({ fetches: [ok(both('1-2'))] })
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('does not ask again within 5 minutes of the last ask', async () => {
    const { store, fetchContent, advance } = setup({ fetches: [ok(both('1-2')), ok(both('2-2'))] })
    await store.startup()
    advance(CMS_REFRESH_AFTER_MS - 1000)
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('asks again once the last ask is more than 5 minutes old, and swaps if the version changed', async () => {
    const { store, fetchContent, advance } = setup({ fetches: [ok(both('1-2')), ok(both('2-2'))] })
    await store.startup()
    advance(CMS_REFRESH_AFTER_MS + 1000)
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().version).toBe('2-2')
  })

  it('counts a failed ask as an ask, so a flaky network is not hammered', async () => {
    const { store, fetchContent, advance } = setup({ fetches: [failed, ok(both('2-2'))] })
    await store.startup()
    advance(60_000)
    await store.onBecameVisible()
    expect(fetchContent).toHaveBeenCalledTimes(1)
  })

  it('the rule is exactly 5 minutes', () => {
    expect(CMS_REFRESH_AFTER_MS).toBe(300_000)
  })
})
