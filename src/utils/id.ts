/**
 * Creates a random unique ID.
 *
 * crypto.randomUUID only exists on secure pages (https:// or localhost), so a
 * simpler fallback keeps the app working if it is opened another way.
 */
export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
