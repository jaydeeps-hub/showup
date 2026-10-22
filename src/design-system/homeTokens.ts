/**
 * Colours and fonts for the Home screen and the calendar, taken from the design prototype
 * (docs/design/showup-prototype.html). The rest of the app keeps using tokens.ts; keeping these
 * together means the new screens have no scattered one-off values.
 */
export const home = {
  color: {
    bg: '#050A14',
    surface: '#0E1522',
    surface2: '#172033',
    line: '#232D42',
    text: '#F2F3F5',
    muted: '#8D93A0',
    accent: '#2B50D9',
    accentSoft: '#17234F',
    accentBorder: '#2A3C7A',
    accentText: '#8FA6FF',
    ok: '#3DBE8B',
    okSoft: '#143A2D',
    /** Day numbers. */
    day: '#B4B9C4',
    /** Day numbers that are still in the future. */
    dayFuture: '#5C626E',
    /** The label under the big Total showups number. */
    kpiLabel: '#C3CCE8',
  },
  font: {
    heading: '"Lexend", "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    body: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  },
} as const
