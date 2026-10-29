/**
 * A picture address that came from the database must be a normal web address (https, or http for local
 * testing). The value comes from a table that is edited by hand and ends up in an <img>, so anything else
 * (for example `javascript:` or `data:`, or a path with no site) is refused. Returns the cleaned address,
 * or null when it is not acceptable.
 */
export function toSafeImageUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
