# Screens and the database calls they make

Derived from the code in `src/`. Each service file is the only place that talks to its part of the database; screens never contain database code. Error text is always written by the app: raw database messages are never shown (they go to the console). "Network" means the message matches `failed to fetch | network | load failed | timed out`.

## Navigation ([src/app/App.tsx](../../src/app/App.tsx))
No router. Order of checks for a signed-in user: profile loading → **Quick Start** (once, if not finished; see below) → onboarding (no first/last name) → gym and Showup data loading or error → **Set goal** (full screen) → **Gym setup** (no gym, or changing it) → the three tabs with the bottom bar: **Pause, Home, Profile** (starts on Home).

On launch (once per user per page load) `useSaveDeviceTimezone` calls `set_my_timezone`.

## Error mapping used by the RPC screens
| Where | Database condition | User sees |
|---|---|---|
| `describeServiceError` ([rpcErrors.ts](../../src/services/rpcErrors.ts)), used by calendar, home summary, goal read, pause read | Network | "We couldn't reach the server. Check your connection and try again." |
| same | Anything else | "Something went wrong while talking to the server. Please try again." |
| Any read whose JSON has an unexpected shape | — | Calendar: "The calendar came back in a form we couldn't read. Please try again." Home: "Your summary came back in a form we couldn't read. Please try again." (same wording pattern for goal and pause) |
| Any call with no Supabase configured | — | "Supabase is not configured." |

## Landing carousel (Phase 9d, landing page only)

**File:** [features/landing/LandingCarousel.tsx](../../src/features/landing/LandingCarousel.tsx), placed in [LandingScreen.tsx](../../src/features/landing/LandingScreen.tsx) between the description and the two Google buttons (the buttons are unchanged). Helpers `imageFor` and `fallbackExpression` are in [utils/cms.ts](../../src/utils/cms.ts).

- **Data:** the active rows of the `landing_carousel` category (`useLandingCarouselItems()`), one card per row, so any number of rows works. The heading is `landing.carousel_heading` from `config` (default "Why it works"). **If the category is missing or empty nothing is drawn: no heading, no carousel, no dots** (and the mascot content is not read).
- **Layout:** a horizontally scrolling row with scroll snapping (cards snap to the start; 84% wide with a 12px gap, so the next card peeks in), running to the screen edges. Each card has a 4:3 picture area, then the heading (`h3`) and subheading. An empty subheading is left out. The dots (one per card, the active one wider) follow the scroll position and are hidden from screen readers.
- **Pictures:** the card's own `image_url` (with `?v=` so a changed picture is fetched again) and `image_alt`. If a card has no `image_url`, or its picture fails to load, that card shows a mascot picture instead, chosen by the card's place in the row: wave, cheer, focus, sleep, then repeating. The mascot picture is decorative (empty alt). If the mascot has no picture either, the panel is left plain.
- **Accessibility:** the track is a focusable `region` with `aria-roledescription="carousel"` (arrow keys scroll it natively); each card is a `group` with `aria-roledescription="slide"` labelled by its `image_alt`, or by its heading when the alt is empty or blank; the dot animation is switched off for `prefers-reduced-motion`.
- **Not shown:** there is no "sources" or "backed by research" area in the app.

**Tested:** [LandingCarousel.test.tsx](../../src/features/landing/LandingCarousel.test.tsx) (22 tests: hidden when empty, one card and one dot per row, heading from `config`, picture and mascot fallback rules, labels, dots following the scroll, placement on the landing page). Checked by breaking the component six ways; every change made a test fail.

## Landing sign-in box (Phase 9f)

**Files:** [features/landing/SignInBox.tsx](../../src/features/landing/SignInBox.tsx) (the box), [hooks/useCtaMode.ts](../../src/hooks/useCtaMode.ts) (measures and decides), [utils/ctaMode.ts](../../src/utils/ctaMode.ts) (the pure rule `chooseCtaMode`), used by [LandingScreen.tsx](../../src/features/landing/LandingScreen.tsx). `index.html`'s viewport meta now ends with `viewport-fit=cover`.

- **Contents, top to bottom:** the heading "Get started today." (full mode only), "Sign up with Google", "I already have an account", then the Terms line, moved here unchanged (same text, same Terms link and Privacy Policy handling; no new links, sheets or config keys). The Terms line is no longer above the box, and there is no "See sources" button anywhere. The buttons still do exactly what they did.
- **Look:** background `rgba(14,21,34,.82)`, `backdrop-filter: blur(18px) saturate(1.2)` (and the `-webkit-` form), 1px border `rgba(255,255,255,.1)`, radius 24, shadow `0 10px 30px rgba(0,0,0,.35)`, padding 14. It becomes `rgba(14,21,34,.96)` where `backdrop-filter` is not supported and under `prefers-reduced-transparency: reduce`. The Terms text is 12px, `#B4B9C4`, centred, line-height 1.4; its links are `#8FA6FF`. Both buttons and the Terms link have a visible focus ring; the box does not trap focus.
- **Floating:** `position: sticky`, `bottom: calc(12px + env(safe-area-inset-bottom))`, `z-index: 5` (above the carousel), `margin-top: 24px`, after the carousel in the page. The page has no scrolling container of its own (nothing sets `overflow` on a parent), so sticky works and `position: fixed` was not needed.
- **Three modes**, chosen by `chooseCtaMode({ viewportH, boxFullH, boxCompactH, carouselBlockH, safeBottom, prevMode, isLandscape })`:
  - **full**: floating, with the heading. **compact**: floating, without the heading, padding 12, buttons 48 and 44 tall (the Terms text stays). **static**: an ordinary block at the end of the page, margin-top 24.
  - A mode floats only if `viewportH - boxH - 12 - safeBottom >= carouselBlockH + 12` AND `boxH <= 0.30 * viewportH`. Full is tried first, then compact, otherwise static. A landscape screen (wider than tall), or one under 420px tall, is always static.
  - **Hysteresis:** it drops to a lower mode at once when the rule fails, and goes back up only when the rule also holds with 24px of extra room.
  - With the design's numbers (box 206 full / 165 compact, carousel block 455, no safe area): 568, 600 and 640 are static; 667 is compact; 700 and taller are full. Full starts at 687 (the 30% rule is what limits it, not the room), compact at 644.
- **Measuring** (`useCtaMode`): the viewport is `window.visualViewport?.height ?? window.innerHeight` (the visible height, not the screen's). `boxFullH` and `boxCompactH` are measured from the REAL rendered box by switching its `data-mode` for a moment and back before the browser paints, so a longer Terms text or an error message in the box is counted. `carouselBlockH` is the height of the whole carousel block (heading to dots), 0 when there is no carousel. The mode is set in a layout effect (before first paint, so no flash) and decided again on `resize`, `orientationchange`, `visualViewport` resize, when the fonts finish loading, and from a `ResizeObserver` on the box and the carousel block.
- **Bounded cards:** a carousel card's heading shows at most 2 lines and its subheading at most 3 (line-clamp), with the 4:3 picture unchanged, so the carousel's height is predictable.

**Tested:** [ctaMode.test.ts](../../src/utils/ctaMode.test.ts) (24 tests, including the screen heights above, landscape, the 30% rule, the safe area and hysteresis) and [SignInBox.test.tsx](../../src/features/landing/SignInBox.test.tsx) (30 tests on the real landing page with faked measurements: contents and order, the Terms line unchanged, the look, the three modes, every trigger for deciding again, accessibility, the line clamps). Checked by breaking the code in 22 places; every change but one made a test fail. The survivor removes the explicit `-webkit-` prefix, which the styling library adds by itself.

## Quick Start (Phase 9e)

**Files:** [features/quickstart/QuickStartScreen.tsx](../../src/features/quickstart/QuickStartScreen.tsx) (the screen), [App.tsx](../../src/app/App.tsx) (when it appears), [ManageProfileScreen.tsx](../../src/features/profile/ManageProfileScreen.tsx) (the Profile button). Shared with the landing carousel: [components/CardPicture.tsx](../../src/components/CardPicture.tsx) (4:3 picture with the mascot fallback), [components/CarouselDots.tsx](../../src/components/CarouselDots.tsx), `BrandLogo` in [landing/BrandMark.tsx](../../src/features/landing/BrandMark.tsx); `quickStartFallbackExpression` and `quickStartEndingLabel` are in [utils/cms.ts](../../src/utils/cms.ts).

- **The screen:** a full screen with **no tab bar**. Top row: the brand logo and a **Skip** link. Then a swipeable carousel, dots, and one primary button. **One slide per `quick_start` item**: the number of slides, dots and the "last slide" logic all come from the item count (one item means no "Next", only the last button). A swipe of **more than 45px** turns one slide (exactly 45 does not); the arrow keys also turn it when the carousel is focused. Slides move with a `transform` over 0.3s, with no transition under `prefers-reduced-motion`. Slides that are not showing are `aria-hidden`; each slide is labelled "n of total".
- **A slide:** a 4:3 picture (radius 22, 1px border, surface background, `object-fit: cover`), the heading (28px Lexend 700) and the subheading (16px, `#B4B9C4`). With no `image_url`, or if the picture fails to load, the same panel shows a mascot picture, chosen by the slide's place: **smile, lift, focus, cheer**, then repeating. The prototype's drawn SVG illustrations are not used.
- **The button:** "Next" on every slide but the last. On the last: **"Set up my profile"** if the person has no first name yet, otherwise **"Done"** (when it is opened from Profile it is always "Done"). **Skip does the same as the last button.** It reports finishing once only, however many times it is pressed.
- **When it appears:** whenever the app opens with a signed-in person and `needsQuickStart(profile, items, finishPending)` is true: they have not finished it (`profiles.quickstart_completed_at` is empty), no finish is waiting to be retried, and there is at least one `quick_start` item. This includes existing users and the "I already have an account" path. It is shown **before** the screen the app would show next (onboarding for a new person, otherwise Home), and that screen follows when it ends. **It is decided once**, when the profile has loaded, from the content at that moment: if the content only arrives or changes later in the visit, it does not pop up; and if its cards are switched off while it is open, it steps aside instead of showing an empty screen.
- **What finishing does:** pressing the last button or Skip closes the screen straight away and calls `markQuickStartDone()` (`complete_quickstart()`) in the background. If the database cannot be told, a per-person reminder is kept in the browser and retried on the next launch, and the screen is not shown again for that person in the meantime. With **no `quick_start` items it is not shown and nothing is recorded.**
- **Profile button:** "Quick start guide" (a "?" in a circle, 14px, `#8FA6FF`, min height 48, 12px above) directly under the details list, **hidden while editing** and hidden when `quick_start` has no items. Shown to every signed-in person. It opens the same screen ending in **"Done"** and returns to Profile; **opening it from Profile never records anything or changes the stored time.**
- **If the content fetch fails:** the screen uses the bundled starting content (the four slides in [config/cmsDefaults.ts](../../src/config/cmsDefaults.ts)), per the rules in the section above.

**Tested:** [QuickStartScreen.test.tsx](../../src/features/quickstart/QuickStartScreen.test.tsx) (24 tests: slides, dots and button from the item count, picture and mascot fallback, swipe threshold and ends, keyboard, reduced motion, accessibility) and [App.quickStart.test.tsx](../../src/app/App.quickStart.test.tsx) (19 tests through the real App: when it appears, before onboarding, not for finished or pending people, no items, late content, recording on finish and Skip, a failed record, bundled content, the Profile button). Checked by breaking the code in eleven places; all but one change (one that cannot differ, because Profile only opens for a person with a name) made a test fail.

## Landing (signed out)
- Google sign-in via Supabase Auth (not an RPC). Reads the landing content from the `config` table (now config, renamed from `cms` in Phase 9), before sign-in, with ONE plain `select` for three keys (`lpage_banner`, `tnc`, `landing.carousel_heading`), newest row per key winning, in [services/landingContent.ts](../../src/services/landingContent.ts) via [useLandingContent](../../src/hooks/useLandingContent.ts) (one shared request for the whole page). Every key has a built-in default: no banner row, an empty one, one that is not a web address, or a failed lookup shows the design's mascot banner (`public/images/landing-banner-default.jpg`); a banner address that fails to load falls back to the built-in picture once, then to a quiet frame; the carousel heading defaults to "Why it works" and is shown above the carousel (see "Landing carousel" below). The line "By continuing you agree to the Terms and Privacy Policy." is written in the app (unchanged text and behaviour: the Terms link opens the popup; the Privacy Policy is a link only when `PRIVACY_POLICY_URL` is set, otherwise plain text). It now sits inside the sign-in box at the end of the page (see "Landing sign-in box" below). Terms popup: if there is no `tnc` row it says the Terms are not available; if the lookup failed it shows "We couldn't load the Terms and Conditions. Check your connection and try again." with a retry. Sign-in errors: not set up / redirect unavailable / generic "We could not start Google sign-in…".

## Onboarding and Profile (table updates, plus RPCs)
- **Reads** `profiles` (select own row). **Writes** `profiles` (update `first_name`, `last_name`, `date_of_birth` only).
- Save error mapping ([profileService.ts](../../src/services/profileService.ts)): SQLSTATE `23514` → "Those details weren't accepted. Check your names and birthday and try again."; network → "We couldn't reach the server…"; other → "We couldn't save your changes. Please try again."; zero rows updated → "We couldn't find your profile to update. Try signing out and back in."
- Validation (client): "Enter your first name." / "Enter your last name." / "Birthday must be at least 15 years ago." / "Enter a valid date." (`validateProfileForm`, shared with the Profile edit form; it still decides what is saved.)

### Onboarding step 1: "What should we call you?" (Phase 10d, UI only)
Files: [OnboardingScreen.tsx](../../src/features/profile/OnboardingScreen.tsx), [ProfileForm.tsx](../../src/features/profile/ProfileForm.tsx) (now used by onboarding only), the shared [OnboardingStepHeader.tsx](../../src/components/OnboardingStepHeader.tsx) and [utils/onboardingProgress.ts](../../src/utils/onboardingProgress.ts). The save logic (`profiles.first_name`, `last_name`, `date_of_birth`) and the step routing (`App.tsx`: this screen shows while either name is missing) are unchanged.
- **Top row:** a back arrow, a progress bar (4px, accent fill on a line-colour track, **33%** for 1 of 3, hidden from screen readers) and "1 of 3". There is no tab bar. The same header is meant for the gym and goal steps (2 of 3 is 66%, 3 of 3 is 100%).
- **Back** on this first step calls the existing **sign-out**. The design's Back goes to the landing page, and for a person who is already signed in the only way back to it is to sign out (the auth listener then shows the landing page). This is a decision to confirm.
- **Words:** the title "What should we call you?" (30px) and the muted note "Just the basics. It takes a few seconds." (the old "Let's get to know you." and its subtitle are gone).
- **Fields** (plain inputs in the design's style: 54px, surface fill, 1.5px line border, blue halo on focus, red border when flagged): First name (`autocomplete=given-name`, `autocapitalize=words`, `enterkeyhint=next`, placeholder "Jay"), Last name (`family-name`, same, placeholder "Mehta"), Date of birth with an "Optional" tag in its label and the help text "You can add this later.". The latest date you can pick is **15 years before today**, the app's existing rule, not the design's 13.
- **Checks, as in the design:** when an empty name field loses focus it gets a red border and an inline message, "Enter your first name" / "Enter your last name" (no full stop; `role="alert"`, and the element only has that role while it has a message, so an idle page has no alerts); typing in the field clears both. A name of only spaces counts as empty. **Enter** in First name moves to Last name, and in Last name moves to Date of birth (it does not submit; ignored while an input method is composing text).
- **Continue** is 54px tall, pushed to the bottom of the screen (`margin-top: auto`), and **off until both names have text**. Because it is off, pressing it with empty names no longer produces the old on-submit messages; a form submitted some other way with empty names does nothing. Saving, "Saving…", "Try again" after a failed save with everything typed kept, and the double-press guard are as before, and the birthday still goes through the shared validator (so the 15-year rule and the date checks apply).

**Tested:** [App.onboardingDetails.test.tsx](../../src/app/App.onboardingDetails.test.tsx) (30 tests through the real App, including the header and `progressPercent`). Checked by breaking the code in 23 places; every change made a test fail except one, which led to the "submitted some other way" test. Existing tests changed only where this design changes the wording or the empty-submit behaviour (`App.profile.test.tsx`, `App.quickStart.test.tsx`).
- **Profile tab** also calls `get_goal_state` (read) and `set_weekly_goal` (only when the number changed; see below) and, for admins only, `set_place_search_mode` (SQLSTATE `42501` → "Only administrators can search any place."; network → "We couldn't reach the server…"; other → "We couldn't change this setting. Please try again.").
- Toast on save: "Changes saved", plus the goal message when the goal changed.
- **Quick start guide** button under the details list (hidden while editing, and when there are no Quick Start cards); see "Quick Start" above.

## Gym setup ("Add gym", Phase 10f) and "Gyms near me" (Phase 10g)
Files: [GymSetupScreen.tsx](../../src/features/gym/GymSetupScreen.tsx), [GymSearch.tsx](../../src/features/gym/GymSearch.tsx), [GymScreenBack.tsx](../../src/features/gym/GymScreenBack.tsx), [components/NearMeToggle.tsx](../../src/components/NearMeToggle.tsx), [hooks/useNearMe.ts](../../src/hooks/useNearMe.ts), [hooks/useNearMeSearch.ts](../../src/hooks/useNearMeSearch.ts), [services/mapsService.ts](../../src/services/mapsService.ts), [utils/distance.ts](../../src/utils/distance.ts), [utils/nearMeCache.ts](../../src/utils/nearMeCache.ts). **No mascot** on this screen.

**The database and Google calls are as before:** Google Maps Places (New), then `gyms`: update `is_active=false` on the old row and insert the new one (restores the old one if the insert fails). Errors use the generic network / "Something went wrong…" pair. A place that is not a gym: "Not a gym. "<name>" isn't listed on Google Maps as a gym, fitness centre or sports facility. Please select another place." (admins in `any_place` mode skip this check). The app never writes `profiles.place_search_mode`.

**One screen, two uses**
- **Step 2 of 3 of onboarding** (no gym yet): the shared top row with a **66%** progress bar and "2 of 3". There is **no back arrow** here (the space is kept): the details are already saved and there is no earlier screen to return to. *Decision to confirm.*
- **"Change gym" from Profile:** just a back arrow, **no progress bar**, and it returns to Profile. The arrow is switched off while a save is on its way or has just finished.
- No tab bar in either. Title "Where do you work out?" (30px).

**The search** (the Google logic is unchanged; only what is drawn changed, from a dropdown to the design's inline list)
- A search box: a search icon, `type="search"`, `enterkeyhint="search"`, `autocomplete="off"`, placeholder "Search by gym name or area", and a clear ✕ that appears only when there is text (it is off while a place's details load).
- **Results** are a `radiogroup` of rows (name and address, a check mark on the chosen one, accent border and soft-blue fill when chosen, at least 64px tall) under a small heading, "Results". The heading, messages and Retry button sit outside the radio group.
- Typing needs **3 characters** and waits **300 ms** (350 ms with "Gyms near me" on). Typing again drops the earlier choice, so a stale gym cannot be saved; the same happens when the toggle is used.
- **States** (as in the prototype): loading, "Finding gyms…" with the shared loader and three placeholder rows, shown the moment the third character is typed; error, "Couldn’t load gyms" / "Check your connection and try again." with a **Retry** button (for the typed search and for the nearby list); no results, "No gyms found for “<what was typed>”" / "Check the spelling, or try the gym’s area instead.". Before 3 characters it says "Type at least 3 characters to search". The page is exactly one screen tall and only the list scrolls, so **Save gym** stays within reach.
- **Save gym** (primary, 54px) is off until a row is chosen and its place has been accepted. On success the app shows the toast "<gym name> saved" and, after about **700 ms**, moves on: back to Profile if it was opened from there, otherwise to the next screen (Home; the goal screen is still only opened from Home). The toast belongs to the app, so it outlasts the gym screen. A failed save shows the error, keeps the choice and offers "Try again". Pressing it twice saves once. If the screen is replaced during the 700 ms pause, the app lets go of the hold itself about 1.5 s later, so no one is left on a stale gym screen.

**"Gyms near me" (the toggle row between the search box and the results)**
- A row at least 54px tall: "Gyms near me" with "Show the closest gyms first" under it, and a switch (`role="switch"`, `aria-label="Gyms near me"`). While the position is being found the line under the label reads "Finding where you are…" and the switch is off.
- **Location is asked for only when the person turns the switch on** (`getNearMePosition`: `enableHighAccuracy: false`, timeout 10 s, `maximumAge` 60 s). Never on page load. If it is refused, unavailable or times out, the switch goes back off and a note appears under the row (13px, muted, `role="status"`): "Location is off. Allow it in your browser settings to sort by distance." Searching by name or area keeps working.
- **With it on and an empty search box:** a nearby search (`Place.searchNearby`, **Places API (New)**, the same key and loader as the typed search) around the device, `includedTypes` from the same gym and fitness types the app accepts, ranked by distance, within `gym_search_radius_meters` (default **5000** m, at most 50,000) and at most `gym_search_max_results` (default **20**, 1 to 20) results. It asks only for `id`, `displayName`, `formattedAddress`, `location` and `types`. The nearby list is **gyms only for everyone**, including people in `any_place` mode, who still find and add any place by typing.
- **With it on and text typed:** the usual text search, biased toward the device (`locationBias` and `origin`; a nudge, not a filter), results sorted nearest first.
- **Distance** is worked out in the app (haversine) from the device position and each result's coordinates; there is no extra request. Rows show it on the right, "640 m" under a kilometre (to the nearest 10 m) and "1.2 km" above, and the group heading reads "Near you, closest first".
- **Cost and privacy:** the last result for each search text and each device position rounded to about 100 m is kept in memory for **5 minutes** (a failed search is not kept; the typed results are forgotten after a place is picked, because they belong to a Google billing session that ends then). A nearby pick has its details already, so there is no second request and the search session is kept. The device coordinates are held **in memory only**: never stored, never sent to Supabase, never logged; only the chosen gym is saved, as before.
- **Remembering the choice:** only a plain on/off flag in this browser (`localStorage` key `showup:gyms-near-me`). When the screen opens with the flag on, it is applied **only if the browser already allows location** (`navigator.permissions`); otherwise the switch stays off and nothing is asked. The brief suggested `profiles.place_search_mode` for this, but it only allows `fitness_only` and `any_place`, is a permission switch written only by an administrator, and has a database constraint, so it is **not used and not changed**.
- The two settings are read through `get_app_config()` (`config.gym_search_radius_meters`, `config.gym_search_max_results`, seeded by the Phase 10a SQL) with the defaults above.

**Tested:** [App.gymScreen.test.tsx](../../src/app/App.gymScreen.test.tsx) (27), [App.gymScreen.regressions.test.tsx](../../src/app/App.gymScreen.regressions.test.tsx) (18), [GymSearch.nearMe.test.tsx](../../src/features/gym/GymSearch.nearMe.test.tsx) (39), [useNearMe.test.tsx](../../src/hooks/useNearMe.test.tsx) (24), [mapsService.nearMe.test.ts](../../src/services/mapsService.nearMe.test.ts) (20), plus tests for distance, the cache and the two settings. The existing gym journeys in `App.placeSearch.test.tsx` and `App.database.test.tsx` were updated to the new screen (the search box is a `searchbox`, results are `radio`s, the button reads "Save gym", and Back replaces Cancel) and keep every behavioural assertion. After the build, three independent reviews and a mutation run found 15 problems (a stranded screen after pressing Back during a save, a loader that could stick on a cache hit, a hidden gym that could be saved, a missing Retry on the nearby list, the toast being cut short, and others); each now has a regression test that was checked to fail when its fix is removed.

## Home tab
| Call | Purpose |
|---|---|
| `get_home_summary` | Total showups, weeks in a row, this week's progress, passes left |
| `get_pause_state` | Only `active_pauses`, to know whether this week is paused (Home needs both calls; if either fails it shows an error with Retry) |
| `get_calendar` (via the Calendar) | The month grid, showup days, week markers |
| `get_app_config` | Loaded once by `useShowup` with the gym (cached ~1 hour, defaults if it fails). Nothing in the app reads its values any more; the server applies the config |
| Show Up button | Uses the timed Show Up engine, below. Home itself makes no Show Up call |

Home reloads the summary and the calendar when the screen appears, when the app becomes visible again, and each time the engine's `completions` counter goes up (a visit finished, or turned out to be already counted). Home reads that counter alone, through `useShowupSelector`, so it does not re-render on every tick of the timer. The Home layout, top to bottom: greeting, gym card, summary cards, **mascot**, (loading line, paused banner, week progress), the Show up button, the calendar, the pass card.

**The Show up button** ([ShowUpButton.tsx](../../src/components/ShowUpButton.tsx)) is a 208px ring (the prototype's `.su`, circumference about 590.6, filling clockwise from 12 o'clock) around a round button. It only displays the engine's state:
| State | Button | Small text | Ring |
|---|---|---|---|
| `idle` | "Show up" (accent blue), enabled | "Tap when you're at your gym" | dim track |
| `checking` | disabled, the shared Loader | "Checking your location" | dim track |
| `running` | disabled, `surface2`, big text is the time left as `M:SS` (just seconds under a minute) | "Checked {done} of {total} times" | accent, filled by `progress` |
| `done` (also on load when today already has a Showup) | disabled, green fill `#143A2D` with a check | "You showed up" | full green |
While running, a muted line "Keep this screen open until the timer ends." and a small **Stop** link appear under the button.

**What the user is told** is one function, `showupMessage(event, totalShowups)` in [config/messages.ts](../../src/config/messages.ts), shown by [ShowupFeedback](../../src/components/ShowupFeedback.tsx) in the shared toast, on whichever tab the user is on (a visit can finish minutes after they left Home). For `completed` it first reads `total_showups` from `get_home_summary`.
| Event | Toast |
|---|---|
| `completed` | success: "You showed up. Showup #N" (N = `total_showups` after the visit); if the server said `recorded: false`: "Already counted today" |
| `already_done` | success: "You already showed up today." |
| `left_early` | error: "You left before the timer finished. It's been reset." |
| `missed_checks` | error: "We couldn't confirm you stayed. Keep Showup open with the screen on until the timer ends." |
| `expired` | error: "That timer expired. Tap Show up to start again." |
| `cancelled` | success: "Timer stopped. Tap Show up to start again." |
| `too_far` | error: "You're not at your saved gym. Please go to Gym 1 and try again." |
| `poor_accuracy` | error: "Your location signal is weak. Try near a window or outside." |
| `location_denied` | error: "Location is off for Showup. Allow it in your browser settings, then try again." |
| `location_unavailable` | error: "Couldn't get your location. Try again." |
| `error` | error: "Something went wrong. Try again." |
The old dialogs ("Not at your gym", "Location not precise enough", "Your Showup wasn't saved", "Location unavailable") and `FeedbackMessage` no longer exist.

## Timed Show Up engine (Phase 6b and 6c: in use on Home)

Files: [types](../../src/types/index.ts) (`ShowupSession` and friends, snake_case on purpose to match the JSON), [devicePosition.ts](../../src/services/devicePosition.ts), [showupSessionService.ts](../../src/services/showupSessionService.ts), [showupEngine.ts](../../src/services/showupEngine.ts), [wakeLock.ts](../../src/services/wakeLock.ts), [utils/showupSession.ts](../../src/utils/showupSession.ts), [showupSessionContext.ts](../../src/hooks/showupSessionContext.ts), [useShowupSession.tsx](../../src/hooks/useShowupSession.tsx), [ShowupFeedback.tsx](../../src/components/ShowupFeedback.tsx) and [ShowUpButton.tsx](../../src/components/ShowUpButton.tsx).

`ShowupProvider` wraps **everything a signed-in user sees** in `App.tsx` (loading screens, Set goal, Change gym, and the tabs), so the timer and its checks keep running on every screen. It receives the active gym id (or null before one exists). Screens read it with `useShowupSession()` (named that because `useShowup` is the gym hook), or, when they need only one value and must not re-render on every tick, with `useShowupSelector` / `useShowupActions` (see the mascot section).

**Value exposed:** `state` (`idle | checking | running | done`), `remainingSeconds`, `progress` (0 to 1), `checksDone`, `checksTotal`, `showedUpToday`, `completions`, `start()`, `stop()`, and a one-shot `event` (with `recorded` on `completed`) and `clearEvent()`.

**Tab lock.** Pause and Profile are locked only while the state is `checking` (the few seconds the location is being read to start). While `running` the tabs are free.

**RPCs it calls** (only through `showupSessionService.ts`, which returns `{ ok: true, value }` or `{ ok: false, error: <code> }` and never throws):
| Call | When |
|---|---|
| `get_showup_state` | On app load; whenever the page becomes visible again; after a cancel that found nothing to cancel |
| `start_showup(p_gym, p_lat, p_lng, p_accuracy)` | When the user taps Show up (after reading the position) |
| `check_showup(p_session, p_lat, p_lng, p_accuracy)` | At each due checkpoint; without a position when the checkpoint does not need one |
| `cancel_showup(p_session)` | When the user taps Stop |

**Timing rules (all in `showupEngine.ts` and `utils/showupSession.ts`):** the server is the clock (offset = `server_now` minus device time, re-measured on every answer); no duration or interval is hard-coded (the session says); a tick every 500 ms; a check is attempted for the **latest due** checkpoint that is not done, never while another is in flight and never within 10 s of a failed attempt; a `not_due` answer waits `next_check_in_seconds`; `poor_accuracy` retries after 10 s forever; a failed position read or failed network call sends nothing (or retries) after 10 s; any end status stops the clock, releases the screen and emits the matching event. A Wake Lock is requested while running, re-requested when the page becomes visible, and released at the end (failures ignored).

**Position:** `getPosition()` uses high accuracy, a 15 s timeout and no cached position, rounds accuracy to whole metres, and throws one of `location_denied`, `location_unavailable`, `location_timeout`. There is **no client-side distance or accuracy check**: the server decides.

**Error and event mapping** (the engine emits an event; `showupMessage` turns it into text, see the Home tab section):
| Source | Engine event |
|---|---|
| `start_showup` error `too_far` | `too_far` |
| `start_showup` error starting `poor_accuracy` | `poor_accuracy` |
| position `location_denied` | `location_denied` |
| position `location_unavailable` or `location_timeout` | `location_unavailable` |
| `start_showup` returns `already_done` | `already_done` |
| any other error code (`network`, `gym_not_found`, `invalid_position`, `unexpected`) | `error` |
| end status from `check_showup` or a resync | `completed`, `left_early`, `missed_checks`, `expired`, `cancelled` |
| repeated `poor_accuracy` or location problems during a running session | announced once, until a check succeeds |

**Removed in 6c:** the one-tap path. The app no longer calls `record_showup` or reads the `showups` table, and `attendanceService`, `geolocationService`, `showupService`, `utils/distance` and `FeedbackMessage` are deleted. `record_showup` and the direct `INSERT` on `showups` still exist in the database (phase 8).

## The mascot (Phase 7c logic, Phase 7d on Home)

The mascot is on **Home** (a picture and a speech bubble between the summary cards and the paused banner / week progress) and on the **goal screen** (Phase 10e, see "Set goal screen" below). It is not on the Profile avatar or the landing page yet. Both screens draw it with the shared [MascotRow](../../src/components/MascotRow.tsx) (picture on the left, bubble on the right); Home's `MascotBubble` decides what to say from Home's numbers and the Show Up timer and passes it in, with the picture 104px tall.

**On screen** ([MascotBubble.tsx](../../src/components/MascotBubble.tsx), placed by Home through `HomeSummaryTop`'s `afterCards` slot, inside a [MascotBoundary](../../src/components/MascotBoundary.tsx)):
- A flex row, gap 12px, centred, margin-top 14px, always at least **104px tall** so nothing jumps while content loads.
- **Picture** on the left: an `<img>` from `imageFor()` (the PNG is about 180x250), **104px high, width auto**, `object-fit: contain`, not shrinking, with the row's `width`/`height` attributes so the browser reserves the shape. It is decorative: `alt=""` and `aria-hidden`. If it fails to load, it tries the `smile` picture **once**; if that fails too (or the failing one was `smile`), the picture is dropped and only the bubble stays. After content loads, **every other picture is preloaded** so changing faces does not flicker. No animation.
- **Bubble** on the right (the design's `.bub`): surface fill, 1px line border, 16px radius, 10px 14px padding, 14px text in `#D5D8E0`, inside `aria-live="polite"`. If nothing qualifies the bubble is hidden but the row keeps its space.
- **Until Home's numbers have loaded** the bubble says nothing (with no numbers the total would read as 0 and a returning user would be welcomed as new). While no mascot content has loaded, the bundled words are used, with no picture.
- **Isolation:** the mascot is wrapped in an error boundary. If anything in it throws, only the mascot disappears (the error is logged) and Home carries on.

**Greeting:** the line above the first name reads **"Welcome"** when `total_showups` is 0, otherwise **"Welcome back"** (also "Welcome back" while the numbers are loading).

**What changes the words:** Home's summary and pause state, the Show Up engine's phase, the minutes left, and `lastOutcome`. `lastOutcome` is set by the engine when a timer ends `left_early` or `missed_checks`, is cleared when the next session starts (the engine becomes `checking`) and on a full reload, and survives leaving Home and returning (it lives in the engine, not the screen). Stopping a timer yourself does not set it.

**Render cost.** The Show Up engine ticks every 500 ms, and `useShowupSession()` re-renders everything that uses it on each tick. So the mascot and Home read the timer through narrow subscriptions instead:
- `useShowupSelector(select)` re-renders a component only when the one value it selects changes; `useShowupActions()` gives `start` and `stop` with no subscription at all (both in [showupSessionContext.ts](../../src/hooks/showupSessionContext.ts)).
- Home reads only `completions` (which changes when a visit finishes), so it **does not re-render as the seconds tick**. The countdown and ring are drawn by `ConnectedShowUpButton`, which does tick.
- The bubble reads a *stepped* version of the seconds left (`coarseRemainingSeconds`), which gives exactly the same answers to the only two questions the words ask ("how many minutes" and "within the almost window") but changes about 16 times over a 15 minute timer instead of 901. Measured over a 5 minute timer: Home itself re-renders at most 5 times, the bubble about 6.
- `AppTabBar` and `ShowupFeedback` still use `useShowupSession()` and so still re-render each tick (pre-existing, small).

**The goal screen's mascot logic (Phase 10c, logic only: no visual change, nothing on the goal screen yet).** The mascot content now carries `screen` (`home` or `goal`) and `label` on every message (see [backend/overview.md](../backend/overview.md)).
- **Types:** `MascotMessage` has optional `screen` and `label`. A message with no `screen` (old saved content, the old bundled words) counts as `home` (`screenOf()` in [utils/mascot.ts](../../src/utils/mascot.ts)). The parser ([mascotService.ts](../../src/services/mascotService.ts)) fills it in and leaves out a message for a screen this release does not know, so it can never show on Home by mistake.
- **Home is unchanged.** `pickMascotMessage(messages, context, knownExpressions = null, screen = 'home')` now only considers rows of `screen`. `screen` is the **fourth** parameter (not the third, as the step asked) because the third is already `knownExpressions` and every existing Home call and test passes it there. The existing mascot tests were not edited and all pass. A Home pick now also carries the row's `label` (null if none); Home does not show it.
- **Goal situations:** `goal_1` ... `goal_7`, each true exactly when the selected number equals N (`trueGoalSituations(selectedDays)`). They are **not** in `SITUATION_KEYS` or `trueSituations`, which are still the 16 Home situations.
- **`pickGoalMascotMessage(messages, selectedDays, knownExpressions = null)`** returns `{ expression, text, label }`: the face, the bubble and the caption under the big number. It uses the same rules as Home (lowest priority, then id, and a row whose expression has no picture is skipped when the known pictures are given). It returns null only for a number outside 1 to 7.
- **Bundled fallback:** the seven goal rows from the SQL file are in `DEFAULT_GOAL_MASCOT_MESSAGES` ([config/mascotDefaults.ts](../../src/config/mascotDefaults.ts)), kept apart from the 16 Home defaults. If the content has **no goal rows at all** (an old saved copy, or a database without Phase 10a), the bundled ones are used (`goalMessagesFrom()`). If it has any goal rows, only those are used, even if some numbers are missing: the database wins once it has the goal screen.
- **Used by:** the goal screen (Phase 10e) through `useGoalMascot`. The Add gym screen has no mascot.

**Config:** the "almost" threshold is read from `config.mascot_almost_seconds` through `loadAppConfig()` (default 180 until it loads).

The 7c logic, unchanged:

**Files:** [mascotService.ts](../../src/services/mascotService.ts) (fetch and strict parse), [mascotStore.ts](../../src/services/mascotStore.ts) (the cache), [utils/mascot.ts](../../src/utils/mascot.ts) (situations, picking, placeholders, pictures), [config/mascotDefaults.ts](../../src/config/mascotDefaults.ts) (bundled words), [hooks/useMascot.ts](../../src/hooks/useMascot.ts) (`useMascotContent()` and `useMascot(context)`).

**Call:** `get_mascot_content(p_locale)`, only through `fetchMascotContent(locale = 'en')`. It never throws: any failure is `{ status: 'error' }`. A picture whose address is not a plain `http(s)` address is dropped (`toSafeImageUrl`), and an unreadable message is dropped without failing the rest.

**Stale while revalidate** (`MascotStore`):
1. It starts instantly from the copy saved in `localStorage` (key `showup:mascot-content`), or the bundled words if none (or the saved one is broken or has no messages).
2. The first component to use `useMascotContent()` starts a background fetch on every app launch; after that, when the tab becomes visible, it fetches again only if the last fetch was **more than 5 minutes** ago.
3. New content replaces the old only when its `version` changed (the bundled words are replaced by any real content).
4. A failed fetch, or an answer with **no messages**, keeps what is there. A failed fetch still counts as a fetch for the 5-minute rule.
Two requests at once share one. Storage being unavailable or full is ignored.

**Bundled defaults:** the 16 starting messages from the SQL file, copied exactly (ids are negative so they never clash with real rows). **No default pictures**: a missing picture means the words are shown without one.

**What the mascot knows** (`MascotContext`): `goal` (`get_home_summary.goal_days`, may be null), `done` (`showup_days_this_week`), `wk` (`weeks_in_a_row`), `total` (`total_showups`), `paused` (this week's Monday is in `get_pause_state.active_pauses`), the Show Up engine's `state` (`idle | checking | running | done`) and `remainingSeconds`, `lastOutcome` (`left_early`, `missed_checks` or none) and `almostSeconds` (`config.mascot_almost_seconds` via `get_app_config`, default 180).
Derived: `next = done + 1`, `remaining = max(0, goal - done)`, `left = ceil(remainingSeconds / 60)`.

**`lastOutcome`** is held by the Show Up engine, not by a screen, so it survives tab switches. It is set when a timer ends as `left_early` or `missed_checks`, and cleared when the user starts again (even if that start then fails), by any other ending, or when the engine is torn down. It is **not** remembered across a page reload.

**Situations.** The code decides which are true; the table decides which true one wins (lowest `priority`, then `id`). Each is an independent yes/no; with no goal, every one that needs the goal is false:
| Key | True when |
|---|---|
| `checking` | engine is checking |
| `running_almost` | engine is running and `remainingSeconds <= almostSeconds` |
| `running` | engine is running |
| `done_extra` / `done_goal_hit` / `done_progress` | engine is done and `done` is above / equal to / below the goal |
| `paused` | this week is paused |
| `left_early` / `missed_checks` | `lastOutcome` is that value |
| `new_user` | `total = 0` |
| `goal_met` | `done >= goal` |
| `back_after_miss` | `wk = 0` and `total > 0` |
| `one_to_go` | `done = goal - 1` |
| `high_goal` | `goal >= 5` and `goal - done > 1` |
| `week_start` | `done = 0` |
| `in_progress` | always |

**Picking** (`pickMascotMessage`): keep rows whose key is a true situation, sort by priority then id, take the first. Rows with an **unknown key** are ignored. When real pictures have been loaded, a row whose **expression has no picture row** is ignored too; with no pictures loaded at all (the bundled words, or a database with no addresses yet) that check is off, so the words still show without a picture.

**Pictures** (`imageFor`): the picture for the expression, else `smile`, else none. The address gets `?v=<v>` (or `&v=<v>` if it already has a query).

**Placeholders** (`fillPlaceholders`): `{goal} {done} {next} {left} {remaining} {wk} {total}`. An unknown placeholder becomes an empty string (a console warning in development).

**Tested:** one test per situation, the cache rules, and a parity test that compares the new logic with the prototype's `skey()` (kept in the test as an oracle, with `missed_checks` added after `left_early`) on all 9,408 reachable combinations of the grid in the task.

## Carousel and Quick Start content (Phase 9c data layer; drawn by the landing carousel and the Quick Start screen)

The landing page draws the carousel and the Quick Start screen draws `quick_start` (sections below). The data is read, cached and tested so a screen only has to draw it.

**Files:** [cmsService.ts](../../src/services/cmsService.ts) (fetch and strict parse), [cmsStore.ts](../../src/services/cmsStore.ts) (the cache), [config/cmsDefaults.ts](../../src/config/cmsDefaults.ts) (bundled starting content), [utils/cms.ts](../../src/utils/cms.ts) (`imageFor`, `itemsOf`, `needsQuickStart`), [hooks/useCmsContent.ts](../../src/hooks/useCmsContent.ts) (`useCmsContent`, `useLandingCarouselItems`, `useQuickStartItems`), [quickStartService.ts](../../src/services/quickStartService.ts) and [hooks/useQuickStart.ts](../../src/hooks/useQuickStart.ts). (`cmsService.ts` reads the NEW `cms` table; the old table of that name is `config`, see the landing section.)

**Call:** `get_cms_content()`, only through `fetchCmsContent()`. It never throws: any failure is `{ status: 'error' }`. An item that cannot be read is dropped without failing the rest. Items are ordered by position then id, and **at most 12 are kept per category** (a safety limit in the app).

**Stale while revalidate** (`CmsStore`, the same pattern as the mascot):
1. It starts instantly from the copy saved in `localStorage` (key `showup:cms-content`), or the bundled starting content if there is none (or the saved one is broken).
2. The first component to use `useCmsContent()` starts a background fetch on every app launch (it works before sign-in); after that, when the tab becomes visible, it fetches again only if the last fetch was **more than 5 minutes** ago. A failed fetch counts as a fetch for that rule.
3. New content replaces the old whenever its `version` **differs** from what is showing (the version is text, not "newer").
4. A failed fetch keeps what is there.

**When the bundled content is used.** Only when a fetch fails AND nothing has ever been saved or fetched. After any successful fetch, or with a saved copy, a failure keeps the last good content, never the bundled one. **A category that a SUCCESSFUL answer leaves out is switched off and is not filled in from the bundled content**, and an answer with no categories at all switches everything off. The bundled content is the 8 starting rows from the SQL file, copied exactly, with no picture addresses.

**Pictures:** `imageFor(item)` is `null` when `image_url` is empty (the screen then shows a mascot picture) and otherwise the address with `?v=<v>` (or `&v=<v>` if it already has a query).

**The Quick Start.**
- `profiles.quickstart_completed_at` is read with the rest of the profile, in the same request (no new call). A blank or missing value counts as not finished.
- `needsQuickStart(profile, items, finishPending = false)` is true when `quickstart_completed_at` is null AND the Quick Start has at least one card (and no finish is pending). With no cards the feature is off, so nobody is sent to an empty screen.
- `markQuickStartDone(userId)` calls `complete_quickstart()`. **It never throws and never blocks the person.** If the call fails, or the database answers `false` (no profile row updated), a reminder is kept in the browser (key `showup:quickstart-done-pending:<user id>`, per person) and `retryPendingQuickStart` tries again on the next launch (`useQuickStart` does this on mount). While a finish is pending, `needsQuickStart` stays false so the person is not sent back through it.

## Pause tab
| Call | Purpose |
|---|---|
| `get_pause_state` | Passes, active pauses, how many weeks ahead, next refill |
| `use_pause(p_week_start, p_reason)` | Spend a pass |
| `end_pause(p_week_start)` | End a pause early (pass not refunded) |

Pause error mapping ([utils/pause.ts](../../src/utils/pause.ts); only the code before the colon is read, the server text is never shown):
| Code | User sees (toast) |
|---|---|
| `no_passes_left` | You have no passes left this month. |
| `already_paused` | That week is already paused. |
| `already_achieved` | You already hit your goal that week, so you don't need a pause. |
| `week_in_past` | You can't pause a week that has already started. |
| `week_too_far_ahead` | You can only pause this week or next week. *(wording is fixed; it does not follow `pause_max_weeks_ahead`)* |
| `invalid_week` | Pick a week to pause. |
| anything else (including `no_active_pause`, `not_signed_in`, network) | Something went wrong. Try again. |
Success toasts: "Paused. Your weeks in a row are safe." and "Pause ended". With no passes left the button is disabled with "No passes left. They refill on <date>."

## Set goal screen (Phase 10e: the onboarding design; still opened from Home)
Files: [GoalScreen.tsx](../../src/features/goal/GoalScreen.tsx), [GoalPicker.tsx](../../src/features/goal/GoalPicker.tsx), [hooks/useGoalMascot.ts](../../src/hooks/useGoalMascot.ts), the shared [MascotRow.tsx](../../src/components/MascotRow.tsx) and [OnboardingStepHeader.tsx](../../src/components/OnboardingStepHeader.tsx). **UI only: saving (`set_weekly_goal`) and the routing are unchanged.** The screen is still reached the way it was (`App.tsx`: `isSettingGoal`, set from Home's "Set your weekly goal" button, with `onBack`). It is not yet a step in a forced onboarding sequence, and there is **no Skip button or encouragement pop-up yet** (the design has them; later step).
- **Top row:** back arrow, a **100%** progress bar and "3 of 3" (the same header as the details screen). No tab bar. Back calls `onBack`.
- **Title:** "How often will you show up?" (30px).
- **Mascot row** (under the title, 12px gap): the mascot picture on the left, **80px tall**, and the speech bubble on the right, both from the `goal_N` row for the selected number (`useGoalMascot` -> `pickGoalMascotMessage`, see "The mascot" above). Faces: smile for 1 to 4, lift for 5 and 6, sleep for 7. If the mascot content has not loaded, or has no goal rows, the bundled goal rows are used (no pictures, so only the words show). The pictures are fetched ahead so changing the number does not flicker.
- **Big number and caption:** the selected value in 96px Lexend, and under it the row's `label` as the caption (for example "Steady" for 3). The words are in the database, not the code: the old hard-coded captions (`goalLabel`) were removed. A row with no label leaves the caption empty (its space is kept).
- **Day 7 is a nudge, not a limit.** Its caption is "Are you sure? Rest days are important too." (a database row), and 7 can still be selected and saved.
- **Seven buttons**, 1 to 7, a `radiogroup` labelled "Days per week" (`aria-checked`, accent fill when selected, 56px tall, so well over the 48px tap size). They start on the **pending goal**, else the **current goal**, else **3**, and are switched off while a save is in progress.
- **Help text:** "Days per week. You can change this later in Profile." and, when a change is waiting, the "changes on" note.
- **Set goal:** the primary button, **60px tall, pushed to the bottom** of the screen. Saving shows the toast as before ("Goal set. It starts this week." / "Goal updated. It starts Monday <date>." / the error).
- **Not touched:** the details screen, the gym screen, and the Profile goal stepper (`GoalStepper`).

**Tested:** [GoalScreen.test.tsx](../../src/features/goal/GoalScreen.test.tsx) (37 tests: the header, title, start value, the seven buttons, the face, bubble and caption for each number, edited and missing database rows, the bundled fallback, 7 selectable and savable, saving, errors and sizes). Checked by breaking the code in 19 places; all but one made a test fail (the survivor is a defensive double-press check that the disabled button already makes unreachable). Home's mascot tests (43) pass unchanged on the shared row.

| Call | Purpose |
|---|---|
| `get_goal_state` | Starting number and the pending-goal note |
| `set_weekly_goal(p_days)` | Save (the app then re-reads `get_goal_state`) |

Goal error mapping ([goalService.ts](../../src/services/goalService.ts)): `invalid_goal` → "Choose between 1 and 7 days a week."; `not_signed_in` → "Please sign in again to change your goal."; otherwise the network / "Something went wrong…" pair. Success messages: first goal "Goal set. It starts this week."; later "Goal updated. It starts Monday <date>." (the date comes from the server's `pending_from`; the app never works out start dates).

## Not called from the app
`close_weeks`, `week_summary`, `local_today`, `week_start_of`, `calendar_distance_meters`, `cfg_int`, `cfg`, `passes_used_in_month`, `goal_for_week` (internal). `effective_place_search_mode` is in the database but the app does not call it (no reference in `src/`).
