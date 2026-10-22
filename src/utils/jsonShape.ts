/**
 * Small checks used when reading JSON that came back from a database function. The data is
 * validated rather than trusted, so an unexpected shape becomes a clear error instead of a crash
 * (or worse, a wrong number on screen).
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A whole number of zero or more, from a number or numeric text. Anything else is null. */
export function toCount(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}
