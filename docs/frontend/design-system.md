# Design system

Derived from the code. Single source: [src/design-system/tokens.ts](../../src/design-system/tokens.ts). The MUI theme ([src/app/theme.ts](../../src/app/theme.ts)), the Home/Profile tokens ([homeTokens.ts](../../src/design-system/homeTokens.ts)) and the landing tokens ([landingTheme.ts](../../src/features/landing/landingTheme.ts)) all read from it. Reference prototype: [../design/showup-prototype.html](../design/showup-prototype.html).

## Colours
| Token | Value | Use |
|---|---|---|
| `background` | `#050A14` | Screen background, `theme-color` meta, favicon |
| `surface1` | `#0E1522` | Cards, inputs, tab bar |
| `surface2` | `#172033` | Secondary buttons, hover, disabled fill |
| `border` | `#232D42` | Lines and borders |
| `textPrimary` / `textSecondary` / `textBody` | `#F2F3F5` / `#8D93A0` / `#B4B9C4` | Text |
| `textSubtle` / `textDisabled` | `#626875` / `#6A707C` | Placeholders / disabled |
| `accentPrimary` / `accentHover` | `#2B50D9` / `#3258E6` | Primary buttons, selection |
| `accentTint` | `#17234F` | Selected rows, soft accent fill |
| `accentText` | `#8FA6FF` | Active tab, links, pencil icon, Loader default |
| `success` / `onSuccess` | `#3DBE8B` / `#06231A` | Success toast and "ok" segments |
| `error` / `onError` | `#F0707A` / `#2A0A0D` | Errors, error toast |
| Warning | `#241B10` fill, `#4A3516` border, `#E8C48A` text | Warning alerts |
| Home-only (`homeTokens.ts`) | `#2A3C7A` accent border, `#5C626E` future day, `#C3CCE8` KPI label, `#143A2D` ok-soft | Home, calendar, profile avatar border |

## Fonts
**Lexend 700** for headings and big numbers (`tokens.font.display`); **DM Sans 400/500/600** for body text. Both load from Google Fonts in `index.html`. Bricolage Grotesque was removed.

## Shape and size
Radius: 14 controls, inputs, buttons and rows; 12 small controls; 18 large cards; 24 dialogs and sheets; pill 999. Heights: 54px primary button and input (`size.control`), 48px secondary button, 44px minimum touch target. Border 1px (1.5px emphasis). Spacing is a 4px grid (MUI `spacing: 4`).

## Shared components
- **Loader** ([src/components/Loader.tsx](../../src/components/Loader.tsx)): the landing page's ring-and-wedge "o" (shapes shared with `BrandMark.tsx`), spinning, static under `prefers-reduced-motion`. It is the only loader: used for connecting Google, gym search (Maps loading, "Searching…", place details), the location check, every "Saving…" button, the Terms popup and every page/data loading state. `color="currentColor"` inside buttons.
- **Toast** ([src/components/Toast.tsx](../../src/components/Toast.tsx)): the only toast. Success is green with dark text; error is red with dark text; icon plus colour; centered; auto-hides after 2600 ms; sits above the tab bar when `aboveTabBar`. Every Show Up message (success and problems) is shown in it by `ShowupFeedback`; there are no Show Up dialogs any more.
- **Bottom tab bar** ([src/components/BottomNav.tsx](../../src/components/BottomNav.tsx)): three tabs in this order, **Pause, Home, Profile**. 78px plus the bottom safe area, surface background with a top border; active tab `#8FA6FF`, others muted. Shown on Home, Pause and Profile only. Pause and Profile are disabled while a location check runs; Profile is disabled if the profile did not load. `ScreenLayout hasTabBar` adds bottom padding.
- **Screen layout** ([ScreenLayout.tsx](../../src/components/ScreenLayout.tsx)): narrow centred column; optional brand header (`showBrand`); `hasTabBar` and `bottomSpace` padding.
- **Profile pieces:** `ProfileAvatar` (initials now; a mascot head later), `ProfileEditForm`, and `ProfileActionBar` (Cancel + Save changes, pinned above the tab bar while editing).

## Where the app intentionally differs from the prototype
- **Loader:** the app uses its own landing-page loader (ring and wedge), not the prototype's spinning "o" in the logo.
- **Google email row** stays on Profile (disabled field with a help line); the prototype has none.
- **Tab order** is Pause, Home, Profile (prototype: Home, Pause, Profile; the prototype file was updated to match).
- **Sign out** is on the Profile tab; Home has no sign-out button or location disclaimer.
- **Profile read view** shows the Google email and the gym card with "Change gym" below the rows; the prototype lists the gym as a row.
- **Profile avatar** shows initials; the prototype shows a mascot head.
- **Validation text** keeps a full stop ("Enter your first name.") because onboarding shares it; the prototype has none.
- **Inputs** use the theme's 1px border (prototype 1.5px).
- **Landing page buttons** use 14px radius and 54/48px heights (the earlier pill style was dropped).
- **Home greeting** always reads "Welcome back" (the prototype shows "Welcome" before the first showup).
- **Calendar** uses arrow buttons only; the prototype also supports swiping.
- **Not built yet (prototype only):** the mascot and speech bubble, the 15-minute Show Up ring and timer, the "Demo: leave the gym early" link (never to be built), and the "Gyms near me" toggle.
