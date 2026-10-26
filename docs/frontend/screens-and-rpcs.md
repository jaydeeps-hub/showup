# Screens and the database calls they make

Derived from the code in `src/`. Each service file is the only place that talks to its part of the database; screens never contain database code. Error text is always written by the app: raw database messages are never shown (they go to the console). "Network" means the message matches `failed to fetch | network | load failed | timed out`.

## Navigation ([src/app/App.tsx](../../src/app/App.tsx))
No router. Order of checks for a signed-in user: profile loading → onboarding (no first/last name) → gym and Showup data loading or error → **Set goal** (full screen) → **Gym setup** (no gym, or changing it) → the three tabs with the bottom bar: **Pause, Home, Profile** (starts on Home).

On launch (once per user per page load) `useSaveDeviceTimezone` calls `set_my_timezone`.

## Error mapping used by the RPC screens
| Where | Database condition | User sees |
|---|---|---|
| `describeServiceError` ([rpcErrors.ts](../../src/services/rpcErrors.ts)), used by calendar, home summary, goal read, pause read | Network | "We couldn't reach the server. Check your connection and try again." |
| same | Anything else | "Something went wrong while talking to the server. Please try again." |
| Any read whose JSON has an unexpected shape | — | Calendar: "The calendar came back in a form we couldn't read. Please try again." Home: "Your summary came back in a form we couldn't read. Please try again." (same wording pattern for goal and pause) |
| Any call with no Supabase configured | — | "Supabase is not configured." |

## Landing (signed out)
- Google sign-in via Supabase Auth (not an RPC). Reads `cms` rows id 1 (`lpage_banner`) and id 2 (`tnc`) with a plain `select`. Errors: banner shows a quiet empty frame; Terms popup shows "We couldn't load the Terms and Conditions. Check your connection and try again." with a retry. Sign-in errors: not set up / redirect unavailable / generic "We could not start Google sign-in…".

## Onboarding and Profile (table updates, plus RPCs)
- **Reads** `profiles` (select own row). **Writes** `profiles` (update `first_name`, `last_name`, `date_of_birth` only).
- Save error mapping ([profileService.ts](../../src/services/profileService.ts)): SQLSTATE `23514` → "Those details weren't accepted. Check your names and birthday and try again."; network → "We couldn't reach the server…"; other → "We couldn't save your changes. Please try again."; zero rows updated → "We couldn't find your profile to update. Try signing out and back in."
- Validation (client): "Enter your first name." / "Enter your last name." / "Birthday must be at least 15 years ago." / "Enter a valid date."
- **Profile tab** also calls `get_goal_state` (read) and `set_weekly_goal` (only when the number changed; see below) and, for admins only, `set_place_search_mode` (SQLSTATE `42501` → "Only administrators can search any place."; network → "We couldn't reach the server…"; other → "We couldn't change this setting. Please try again.").
- Toast on save: "Changes saved", plus the goal message when the goal changed.

## Gym setup
- Google Maps Places (autocomplete and details), then `gyms`: update `is_active=false` on the old row and insert the new one (restores the old one if the insert fails). Errors use the generic network / "Something went wrong…" pair. A place that is not a gym: "Not a gym. "<name>" isn't listed on Google Maps as a gym, fitness centre or sports facility. Please select another place." (admins in `any_place` mode skip this check).

## Home tab
| Call | Purpose |
|---|---|
| `get_home_summary` | Total showups, weeks in a row, this week's progress, passes left |
| `get_pause_state` | Only `active_pauses`, to know whether this week is paused (Home needs both calls; if either fails it shows an error with Retry) |
| `get_calendar` (via the Calendar) | The month grid, showup days, week markers |
| `get_app_config` | Loaded once by `useShowup` with the gym (cached ~1 hour, defaults if it fails). Nothing in the app reads its values any more; the server applies the config |
| Show Up button | Uses the timed Show Up engine, below. Home itself makes no Show Up call |

Home reloads the summary and the calendar when the screen appears, when the app becomes visible again, and each time the engine's `completions` counter goes up (a visit finished, or turned out to be already counted).

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

`ShowupProvider` wraps **everything a signed-in user sees** in `App.tsx` (loading screens, Set goal, Change gym, and the tabs), so the timer and its checks keep running on every screen. It receives the active gym id (or null before one exists). Screens read it with `useShowupSession()` (named that because `useShowup` is the gym hook).

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

## Set goal screen (opened from Home when there is no goal)
| Call | Purpose |
|---|---|
| `get_goal_state` | Starting number and the pending-goal note |
| `set_weekly_goal(p_days)` | Save (the app then re-reads `get_goal_state`) |

Goal error mapping ([goalService.ts](../../src/services/goalService.ts)): `invalid_goal` → "Choose between 1 and 7 days a week."; `not_signed_in` → "Please sign in again to change your goal."; otherwise the network / "Something went wrong…" pair. Success messages: first goal "Goal set. It starts this week."; later "Goal updated. It starts Monday <date>." (the date comes from the server's `pending_from`; the app never works out start dates).

## Not called from the app
`close_weeks`, `week_summary`, `local_today`, `week_start_of`, `calendar_distance_meters`, `cfg_int`, `cfg`, `passes_used_in_month`, `goal_for_week` (internal). `effective_place_search_mode` is in the database but the app does not call it (no reference in `src/`).
