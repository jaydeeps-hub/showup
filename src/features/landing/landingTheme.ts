/**
 * Colours and sizes for the landing page only, taken from the onboarding reference. The rest of
 * the app keeps using src/design-system/tokens.ts; the landing page is a deeper navy so it matches
 * the reference. Keeping these in one place means the page has no scattered one-off values.
 */
export const landing = {
  color: {
    page: '#050A14',
    container: '#030B1B',
    containerBorder: '#142653',
    primary: '#1554FF',
    primaryHover: '#2865FF',
    onPrimary: '#FFFFFF',
    heading: '#F7F8FC',
    supporting: '#9BAFE8',
    bannerBackground: '#06112B',
    skeleton: '#0B1A3F',
    focusRing: '#7C97FF',
  },
  radius: { container: 44, banner: 36, button: 999 },
  font: {
    display: '"Bricolage Grotesque", "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    body: '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  },
} as const
