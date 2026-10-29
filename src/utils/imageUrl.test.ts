import { describe, expect, it } from 'vitest'
import { toSafeImageUrl } from './imageUrl'

describe('toSafeImageUrl', () => {
  it('accepts normal web addresses, with or without a query', () => {
    expect(toSafeImageUrl('https://example.com/a.png?x=1')).toBe('https://example.com/a.png?x=1')
    expect(toSafeImageUrl('http://localhost:3000/a.png')).toBe('http://localhost:3000/a.png')
  })

  it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://example.com/a.png', '/images/a.png', 'not a url', ''])(
    'refuses %j',
    (value) => {
      expect(toSafeImageUrl(value)).toBeNull()
    },
  )
})
