import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake of from('config').select().in().order().order(); every step is recorded.
const fake = vi.hoisted(() => ({
  steps: [] as Array<[string, unknown[]]>,
  response: { data: null as unknown, error: null as unknown },
  throws: false,
}))

vi.mock('./supabaseClient', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['select', 'in']) {
    chain[name] = (...args: unknown[]) => {
      fake.steps.push([name, args])
      return chain
    }
  }
  let orders = 0
  chain.order = (...args: unknown[]) => {
    fake.steps.push(['order', args])
    orders += 1
    // The second order() ends the chain, like the real client's awaitable builder.
    if (orders % 2 === 0) {
      if (fake.throws) throw new Error('boom')
      return Promise.resolve(fake.response)
    }
    return chain
  }
  return { supabase: { from: (table: string) => (fake.steps.push(['from', [table]]), chain) }, isSupabaseConfigured: true }
})

const {
  buildLandingContent,
  DEFAULT_AGREEMENT_TEXT,
  DEFAULT_BANNER_URL,
  DEFAULT_CAROUSEL_HEADING,
  DEFAULT_LANDING_CONTENT,
  fetchLandingContent,
  LANDING_KEYS,
  newestValues,
} = await import('./landingContent')

const stepArgs = (name: string) => fake.steps.filter(([step]) => step === name).map(([, args]) => args)

const row = (id: number, content_type: string, value: string | null, created_at: string | null = `2026-10-${String(id).padStart(2, '0')}T10:00:00Z`) => ({
  id,
  created_at,
  content_type,
  value,
})

beforeEach(() => {
  fake.steps.length = 0
  fake.response = { data: [], error: null }
  fake.throws = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the keys and defaults', () => {
  it('uses the key names the table has always used, not renamed', () => {
    expect(LANDING_KEYS).toEqual({ banner: 'lpage_banner', terms: 'tnc', carouselHeading: 'landing.carousel_heading' })
  })

  it('has the built-in defaults from the design', () => {
    expect(DEFAULT_CAROUSEL_HEADING).toBe('Why it works')
    expect(DEFAULT_AGREEMENT_TEXT).toBe('By continuing you agree to the Terms and Privacy Policy.')
    expect(DEFAULT_BANNER_URL).toBe('/images/landing-banner-default.jpg')
  })

  it('the defaults say there are no Terms of our own (there is no built-in Terms text)', () => {
    expect(DEFAULT_LANDING_CONTENT).toEqual({
      bannerUrl: DEFAULT_BANNER_URL,
      bannerFromConfig: false,
      terms: null,
      carouselHeading: 'Why it works',
    })
  })
})

describe('fetchLandingContent: what it asks the database', () => {
  it('reads the table called config, never cms', async () => {
    await fetchLandingContent()
    expect(stepArgs('from')).toEqual([['config']])
    expect(JSON.stringify(fake.steps)).not.toContain('"cms"')
  })

  it('asks for the four columns that matter', async () => {
    await fetchLandingContent()
    expect(stepArgs('select')).toEqual([['id, created_at, content_type, value']])
  })

  it('asks for exactly the three landing keys, in ONE request', async () => {
    await fetchLandingContent()
    expect(stepArgs('from')).toHaveLength(1)
    expect(stepArgs('in')).toEqual([['content_type', ['lpage_banner', 'tnc', 'landing.carousel_heading']]])
  })

  it('asks for the newest first (created_at, then id)', async () => {
    await fetchLandingContent()
    expect(stepArgs('order')).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('does not match on id any more, only on the key name', async () => {
    await fetchLandingContent()
    expect(stepArgs('eq')).toEqual([])
  })
})

describe('fetchLandingContent: what it returns', () => {
  it('returns the banner, Terms and heading from the table', async () => {
    fake.response = {
      data: [
        row(1, 'lpage_banner', 'https://cdn.example.com/banner.png'),
        row(2, 'tnc', '# Terms'),
        row(18, 'landing.carousel_heading', 'Why Showup works'),
      ],
      error: null,
    }
    expect(await fetchLandingContent()).toEqual({
      failed: false,
      content: { bannerUrl: 'https://cdn.example.com/banner.png', bannerFromConfig: true, terms: '# Terms', carouselHeading: 'Why Showup works' },
    })
  })

  it('uses the defaults for every key the table does not have', async () => {
    fake.response = { data: [], error: null }
    expect(await fetchLandingContent()).toEqual({ failed: false, content: DEFAULT_LANDING_CONTENT })
  })

  it('uses the defaults, and says it failed, when the lookup returns an error', async () => {
    fake.response = { data: null, error: { message: 'permission denied for table config' } }
    expect(await fetchLandingContent()).toEqual({ failed: true, content: DEFAULT_LANDING_CONTENT })
  })

  it('uses the defaults, and says it failed, when the call itself throws', async () => {
    fake.throws = true
    expect(await fetchLandingContent()).toEqual({ failed: true, content: DEFAULT_LANDING_CONTENT })
  })

  it('treats a missing data array as no rows', async () => {
    fake.response = { data: null, error: null }
    expect((await fetchLandingContent()).content).toEqual(DEFAULT_LANDING_CONTENT)
  })
})

describe('newestValues: the newest row for a key wins', () => {
  it('prefers the later created_at', () => {
    const values = newestValues([row(1, 'tnc', 'old', '2026-01-01T00:00:00Z'), row(2, 'tnc', 'new', '2026-06-01T00:00:00Z')])
    expect(values.get('tnc')).toBe('new')
  })

  it('does not depend on the order the rows arrive in', () => {
    const rows = [row(1, 'tnc', 'old', '2026-01-01T00:00:00Z'), row(2, 'tnc', 'new', '2026-06-01T00:00:00Z')]
    expect(newestValues([...rows].reverse()).get('tnc')).toBe('new')
  })

  it('breaks a tie on created_at by the higher id', () => {
    const same = '2026-06-01T00:00:00Z'
    expect(newestValues([row(5, 'tnc', 'five', same), row(9, 'tnc', 'nine', same)]).get('tnc')).toBe('nine')
  })

  it('falls back to the id when created_at is missing or unreadable', () => {
    expect(newestValues([row(3, 'tnc', 'three', null), row(4, 'tnc', 'four', 'not a date')]).get('tnc')).toBe('four')
  })

  it('an empty newest row hides the key (so the default shows), it does not fall back to an older value', () => {
    // To blank a value on purpose, add a new empty row. The older text must not come back.
    const values = newestValues([row(1, 'tnc', 'old text', '2026-01-01T00:00:00Z'), row(2, 'tnc', '   ', '2026-06-01T00:00:00Z')])
    expect(values.has('tnc')).toBe(false)
  })

  it('keeps each key separate', () => {
    const values = newestValues([row(1, 'tnc', 'terms'), row(2, 'lpage_banner', 'https://x.test/b.png')])
    expect([...values.keys()].sort()).toEqual(['lpage_banner', 'tnc'])
  })

  it('trims values', () => {
    expect(newestValues([row(1, 'tnc', '\n  # Terms\n')]).get('tnc')).toBe('# Terms')
  })
})

describe('buildLandingContent', () => {
  it('uses the built-in banner when the table has no banner row', () => {
    expect(buildLandingContent([row(2, 'tnc', 'x')])).toMatchObject({ bannerUrl: DEFAULT_BANNER_URL, bannerFromConfig: false })
  })

  it('uses the built-in banner when the banner value is empty', () => {
    expect(buildLandingContent([row(1, 'lpage_banner', '   ')])).toMatchObject({ bannerUrl: DEFAULT_BANNER_URL, bannerFromConfig: false })
    expect(buildLandingContent([row(1, 'lpage_banner', null)])).toMatchObject({ bannerUrl: DEFAULT_BANNER_URL })
  })

  it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA', 'not a url', '/just/a/path'])(
    'uses the built-in banner when the banner value is not a web address (%s)',
    (value) => {
      expect(buildLandingContent([row(1, 'lpage_banner', value)])).toMatchObject({ bannerUrl: DEFAULT_BANNER_URL, bannerFromConfig: false })
    },
  )

  it('uses the configured banner when it is a good address', () => {
    expect(buildLandingContent([row(1, 'lpage_banner', 'https://cdn.example.com/b.png')])).toMatchObject({
      bannerUrl: 'https://cdn.example.com/b.png',
      bannerFromConfig: true,
    })
  })

  it('has no Terms when the table has none or an empty one', () => {
    expect(buildLandingContent([]).terms).toBeNull()
    expect(buildLandingContent([row(2, 'tnc', '  ')]).terms).toBeNull()
  })

  it('uses "Why it works" when the heading is missing or empty', () => {
    expect(buildLandingContent([]).carouselHeading).toBe('Why it works')
    expect(buildLandingContent([row(3, 'landing.carousel_heading', '')]).carouselHeading).toBe('Why it works')
  })

  it('uses the configured heading when there is one', () => {
    expect(buildLandingContent([row(3, 'landing.carousel_heading', 'The proof')]).carouselHeading).toBe('The proof')
  })

  it('ignores rows for other keys', () => {
    const content = buildLandingContent([row(3, 'config.max_gym_distance_meters', '100'), row(4, 'something_else', 'x')])
    expect(content).toEqual(DEFAULT_LANDING_CONTENT)
  })
})
