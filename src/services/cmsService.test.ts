import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabaseClient', () => ({ supabase: { rpc: fake.rpc }, isSupabaseConfigured: true }))

const { fetchCmsContent, limitItems, MAX_ITEMS_PER_CATEGORY, parseCmsContent } = await import('./cmsService')

/** One item, in the exact shape get_cms_content returns (checked against the live database). */
const item = (id: number, position: number, overrides: Record<string, unknown> = {}) => ({
  id,
  slug: `slug-${id}`,
  position,
  heading: `Heading ${id}`,
  subheading: `Subheading ${id}`,
  image_url: `https://x.supabase.co/storage/v1/object/public/app-assets/landing_carousel/${id}.png`,
  image_alt: `Alt ${id}`,
  v: 1793260588787 + id,
  ...overrides,
})

/** The real answer: text version, both categories. */
const answer = {
  version: '1793260675788-8',
  categories: {
    landing_carousel: [item(1, 10), item(2, 20), item(3, 30), item(4, 40)],
    quick_start: [item(5, 10), item(6, 20), item(7, 30), item(8, 40)],
  },
}

beforeEach(() => {
  fake.rpc.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseCmsContent', () => {
  it('reads a complete answer', () => {
    const parsed = parseCmsContent(answer)
    expect(parsed?.version).toBe('1793260675788-8')
    expect(parsed?.categories.landing_carousel).toHaveLength(4)
    expect(parsed?.categories.quick_start).toHaveLength(4)
  })

  it('keeps the version as text, exactly', () => {
    expect(typeof parseCmsContent(answer)?.version).toBe('string')
  })

  it('reads every field of an item', () => {
    expect(parseCmsContent(answer)?.categories.landing_carousel?.[0]).toEqual({
      id: 1,
      slug: 'slug-1',
      position: 10,
      heading: 'Heading 1',
      subheading: 'Subheading 1',
      image_url: 'https://x.supabase.co/storage/v1/object/public/app-assets/landing_carousel/1.png',
      image_alt: 'Alt 1',
      v: 1793260588788,
    })
  })

  it('a category the database left out is MISSING, not an empty list and not filled in', () => {
    const parsed = parseCmsContent({ version: '5-4', categories: { landing_carousel: [item(1, 10)] } })
    expect('quick_start' in (parsed?.categories ?? {})).toBe(false)
    expect(parsed?.categories.quick_start).toBeUndefined()
  })

  it('an answer with no categories at all is valid: everything is switched off', () => {
    expect(parseCmsContent({ version: '0-0', categories: {} })).toEqual({ version: '0-0', categories: {} })
  })

  it('an empty list counts as switched off, the same as a missing category', () => {
    const parsed = parseCmsContent({ version: '5-4', categories: { landing_carousel: [], quick_start: [item(1, 10)] } })
    expect(parsed?.categories.landing_carousel).toBeUndefined()
    expect(parsed?.categories.quick_start).toHaveLength(1)
  })

  it('ignores a category the app does not know', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { a_future_category: [item(1, 10)], quick_start: [item(2, 10)] } })
    expect(Object.keys(parsed?.categories ?? {})).toEqual(['quick_start'])
  })

  it('treats a missing categories object as nothing switched on', () => {
    expect(parseCmsContent({ version: '1-1' })).toEqual({ version: '1-1', categories: {} })
  })

  it.each([
    ['null', null],
    ['text', 'hello'],
    ['an array', []],
    ['a missing version', { categories: {} }],
    ['an empty version', { version: '', categories: {} }],
    ['a numeric version (the contract says text)', { version: 123, categories: {} }],
  ])('rejects %s', (_label, raw) => {
    expect(parseCmsContent(raw)).toBeNull()
  })

  it('image_url may be empty, and stays empty', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { quick_start: [item(1, 10, { image_url: '' })] } })
    expect(parsed?.categories.quick_start?.[0].image_url).toBe('')
  })

  it('image_alt and slug may be null', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { quick_start: [item(1, 10, { image_alt: null, slug: null })] } })
    expect(parsed?.categories.quick_start?.[0]).toMatchObject({ image_alt: null, slug: null })
  })

  it('drops an unreadable item and keeps the rest', () => {
    const parsed = parseCmsContent({
      version: '1-1',
      categories: {
        quick_start: [
          item(1, 10),
          item('x' as unknown as number, 20),
          item(3, 'high' as unknown as number),
          item(4, 40, { heading: '   ' }),
          item(5, 50, { heading: undefined }),
          'nonsense',
          null,
          item(8, 80),
        ],
      },
    })
    expect(parsed?.categories.quick_start?.map((i) => i.id)).toEqual([1, 8])
  })

  it('a category whose items are ALL unreadable is switched off, not left as an empty list', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { quick_start: ['nonsense', null] } })
    expect(parsed?.categories.quick_start).toBeUndefined()
  })

  it('puts the items in order by position even if the database did not', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { quick_start: [item(3, 30), item(1, 10), item(2, 20)] } })
    expect(parsed?.categories.quick_start?.map((i) => i.position)).toEqual([10, 20, 30])
  })

  it('breaks a position tie by id', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { quick_start: [item(9, 10), item(2, 10)] } })
    expect(parsed?.categories.quick_start?.map((i) => i.id)).toEqual([2, 9])
  })

  it('defaults an unreadable v to 0 and a missing subheading to empty', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { quick_start: [item(1, 10, { v: 'later', subheading: undefined })] } })
    expect(parsed?.categories.quick_start?.[0]).toMatchObject({ v: 0, subheading: '' })
  })
})

describe('the safety limit of 12 cards per category', () => {
  const many = (count: number) => Array.from({ length: count }, (_, k) => item(k + 1, (k + 1) * 10))

  it('is 12', () => {
    expect(MAX_ITEMS_PER_CATEGORY).toBe(12)
  })

  it('keeps all of 12', () => {
    expect(parseCmsContent({ version: '1-1', categories: { landing_carousel: many(12) } })?.categories.landing_carousel).toHaveLength(12)
  })

  it('cuts 13 down to 12', () => {
    expect(parseCmsContent({ version: '1-1', categories: { landing_carousel: many(13) } })?.categories.landing_carousel).toHaveLength(12)
  })

  it('cuts 50 down to 12', () => {
    expect(parseCmsContent({ version: '1-1', categories: { quick_start: many(50) } })?.categories.quick_start).toHaveLength(12)
  })

  it('keeps the FIRST 12 in order, not an arbitrary 12', () => {
    const kept = parseCmsContent({ version: '1-1', categories: { quick_start: [...many(20)].reverse() } })?.categories.quick_start
    expect(kept?.map((i) => i.position)).toEqual(Array.from({ length: 12 }, (_, k) => (k + 1) * 10))
  })

  it('applies to each category on its own', () => {
    const parsed = parseCmsContent({ version: '1-1', categories: { landing_carousel: many(15), quick_start: many(3) } })
    expect(parsed?.categories.landing_carousel).toHaveLength(12)
    expect(parsed?.categories.quick_start).toHaveLength(3)
  })

  it('limitItems does not change the list it is given', () => {
    const list = parseCmsContent({ version: '1-1', categories: { quick_start: many(3) } })!.categories.quick_start!
    const copy = JSON.stringify(list)
    limitItems(list)
    expect(JSON.stringify(list)).toBe(copy)
  })

  it('drops unreadable items BEFORE counting, so a bad row does not use up a place', () => {
    const list = [...many(12), 'nonsense'] // 12 good + 1 bad
    const parsed = parseCmsContent({ version: '1-1', categories: { quick_start: list } })
    expect(parsed?.categories.quick_start).toHaveLength(12)
  })
})

describe('fetchCmsContent', () => {
  it('calls get_cms_content with no arguments', async () => {
    fake.rpc.mockResolvedValue({ data: answer, error: null })
    await fetchCmsContent()
    expect(fake.rpc).toHaveBeenCalledWith('get_cms_content')
  })

  it('returns the parsed content', async () => {
    fake.rpc.mockResolvedValue({ data: answer, error: null })
    const result = await fetchCmsContent()
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.content.version).toBe('1793260675788-8')
  })

  it('returns an error (never throws) for a database error', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await fetchCmsContent()).toEqual({ status: 'error' })
  })

  it('returns an error for an answer of the wrong shape', async () => {
    fake.rpc.mockResolvedValue({ data: { surprise: true }, error: null })
    expect(await fetchCmsContent()).toEqual({ status: 'error' })
  })

  it('returns an error (never throws) when the call itself fails', async () => {
    fake.rpc.mockRejectedValue(new Error('Failed to fetch'))
    expect(await fetchCmsContent()).toEqual({ status: 'error' })
  })

  it('a successful answer with a category left out is OK, not an error', async () => {
    fake.rpc.mockResolvedValue({ data: { version: '2-4', categories: { quick_start: [item(1, 10)] } }, error: null })
    const result = await fetchCmsContent()
    expect(result.status).toBe('ok')
  })
})
