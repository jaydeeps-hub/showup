import type { LatLng } from './distance'

/** How long a search result is reused, in milliseconds. */
export const NEAR_ME_CACHE_MS = 5 * 60 * 1000

/**
 * How coarsely the device position is rounded to make a cache key: 0.001 degrees of latitude is about 111 m, so
 * a device that has moved less than about 100 m reuses the same answer instead of asking Google again.
 */
const POSITION_ROUNDING = 1000

/** The key for one search: the text (any case, extra spaces ignored) and the position rounded to about 100 m. */
export function nearMeCacheKey(text: string, position: LatLng): string {
  const lat = Math.round(position.lat * POSITION_ROUNDING) / POSITION_ROUNDING
  const lng = Math.round(position.lng * POSITION_ROUNDING) / POSITION_ROUNDING
  return `${text.trim().toLowerCase().replace(/\s+/g, ' ')}|${lat.toFixed(3)},${lng.toFixed(3)}`
}

/**
 * The last result for each search, kept in memory for five minutes. It is never saved anywhere: the key holds a
 * rounded position, so it lives only as long as the page.
 */
export class NearMeCache<T> {
  private entries = new Map<string, { at: number; value: T }>()

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly lifetimeMs: number = NEAR_ME_CACHE_MS,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.now() - entry.at >= this.lifetimeMs) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.entries.set(key, { at: this.now(), value })
  }

  clear(): void {
    this.entries.clear()
  }
}
