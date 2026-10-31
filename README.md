# Showup

**Version 0.2.0** · a location-verified gym attendance tracker.

Save your gym once. When you arrive, press **SHOW UP**. Showup checks the location your device reports against your saved gym. If you're within 100 metres, it records one Showup. If not, nothing is recorded.

This is an MVP (minimum viable product). It exists to test the core interaction, not to be a finished fitness platform.

---

## Features in v0.1.0

- **Gym search is restricted to fitness places.** Regular users can only save a gym, fitness centre or similar sports facility. Administrators get a setting in Manage Profile to switch between **Fitness places only** and **Any place**; it is stored in Supabase and enforced by the database.
- **Profile onboarding.** On first sign-in, people who don't yet have a first and last name are asked "Let's get to know you." (first name, last name, optional birthday). It appears once; after the profile is saved it is skipped, including after a refresh.
- **Manage Profile.** Tap your name at the top of the home screen to open it. It shows your first name, last name and birthday as plain text; press **Edit** to change them. It also shows your Google email, your gym with a **Change gym** button, and **Sign out**.
- **Sign in with Google** through Supabase. The session is restored when you reload, and you can sign out from your Profile page. Your gym and every Showup are stored in Supabase (the `gyms` and `showups` tables), so they follow you to any device.
- **Gym search with Google Maps.** Uses Places API (New) autocomplete to find a real gym, then saves its name, address and coordinates as **Gym 1**.
- **Gym-only check.** A selected place is only accepted if Google Maps lists it as a gym, fitness centre or similar sports facility. Homes, shops and other random locations are rejected with a "Not a gym" message.
- **SHOW UP button.** Gets your current location (high accuracy), measures the distance to your gym with the Haversine formula, and accepts the visit if you're inside the geofence.
- **Accuracy safeguard.** A location reading that's too imprecise is rejected with a "try again" message instead of being guessed.
- **Clear error messages** when location permission is denied, location is unavailable, the request times out, or the browser doesn't support geolocation.
- **Counter and history in Supabase.** Each successful Showup is saved as a row in the `showups` table, and the counter is the number of your rows. If a Showup cannot be saved you are told, and it is not counted.
- **Safe recovery** when saved data is damaged or storage is blocked.
- **Dark, mobile-first Material UI design**: near-black surfaces, one deep-blue accent for interaction and selection, green for success and red for errors, Lexend headings with DM Sans body text, and subtle borders instead of shadows. All values come from `src/design-system/tokens.ts`.

## Technologies

| What | Used for |
|---|---|
| [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org) | UI and type safety |
| [Vite](https://vite.dev) | Dev server and production build |
| [Material UI (MUI)](https://mui.com/material-ui/) | Components and dark theme |
| [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript), Places API (New) | Gym search |
| `@googlemaps/js-api-loader` | Official loader for the Maps script |
| Browser Geolocation API | The user's current position |
| Supabase Postgres | Profiles, gyms and Showups |
| [Vitest](https://vitest.dev) | Unit tests |
| [oxlint](https://oxc.rs) | Linting |

## Prerequisites

- [Node.js](https://nodejs.org) **20.19 or newer** (22 LTS recommended). Check with `node -v`.
- npm (comes with Node). Check with `npm -v`.
- [Visual Studio Code](https://code.visualstudio.com).
- [Git](https://git-scm.com) and a [GitHub](https://github.com) account (for uploading).
- A Google Cloud account with billing enabled (see below).
- A modern browser: Chrome, Edge, Safari or Firefox.

## Installation and running locally in VS Code

1. Open the `showup` folder in VS Code (**File → Open Folder…**).
2. Open the built-in terminal (**Terminal → New Terminal**, or <kbd>Ctrl</kbd>+<kbd>`</kbd>).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create your environment file and add your Google Maps key (next section):
   ```bash
   cp .env.example .env.local        # macOS / Linux / Git Bash
   copy .env.example .env.local      # Windows Command Prompt / PowerShell
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Open the address it prints, normally <http://localhost:5173>. Edit any file in `src/` and the page reloads automatically.

Stop the server with <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal.

## Configuring sign-in (Supabase + Google)

Showup uses [Supabase](https://supabase.com) for sign-in, with Google as the login provider. Without these settings the landing page shows a "Sign-in is not set up yet" message and the **Continue with Google** button is disabled.

### 1. Create `.env.local`

In the project folder, copy `.env.example` to `.env.local` (see Installation above) and fill in:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_GOOGLE_MAPS_API_KEY=...      # from the Google Maps section below
```

`.env.local` is ignored by Git. Restart `npm run dev` after editing it, because Vite only reads it at startup.

**Which keys go where.** Only the **Project URL** and the **publishable** key belong in the app. The publishable key is designed to be public. The **secret key** (`sb_secret_...`), any `service_role` key, and database passwords must **never** be put in a `VITE_` variable or in frontend code, because everything with a `VITE_` prefix is shipped to every visitor's browser.

### 2. Find the Project URL and publishable key

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and choose your project.
2. Open **Project Settings** (gear icon) → **API Keys** (older projects: **API**).
3. Copy the **Project URL** (also shown at the top of the project home page) and the **Publishable key** (`sb_publishable_...`). Older projects call this the `anon` key, which also works.

### 3. Create Google OAuth credentials (Google Cloud)

1. Open the [Google Cloud Console](https://console.cloud.google.com) and select your project.
2. Go to **Google Auth Platform** (or **APIs & Services → OAuth consent screen**) and set up the consent screen: app name "Showup", your support email, and **External** for the audience. While in *Testing* mode, add your own Google account under **Test users**.
3. Go to **Credentials → Create credentials → OAuth client ID**, with application type **Web application**.
4. Under **Authorized redirect URIs**, add the Supabase callback address:
   `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`
   (Supabase shows this exact address on the Google provider page in the next step.)
5. Create it and copy the **Client ID** and **Client secret**.

The Google client secret goes only into the Supabase dashboard (next step), never into this project.

### 4. Turn on Google in Supabase

1. In the Supabase dashboard go to **Authentication → Sign In / Providers** (older UI: **Providers**) → **Google**.
2. Switch it **on**, paste the Google **Client ID** and **Client secret**, and **Save**.

### 5. Configure redirect URLs (important: get this right or production login breaks)

After Google sign-in, Supabase sends the user back to your app. The app tells Supabase where to send them (its own address, so it is right for localhost, your Vercel domain and preview deployments). But Supabase **only obeys that if the address is on an allow-list**. If it is not on the list, Supabase **quietly ignores it and sends the user to the Site URL instead**. This is the cause of a live site redirecting to `localhost:5173`.

In Supabase go to **Authentication → URL Configuration**:

1. **Site URL** = your **production** address, e.g. `https://YOUR-APP.vercel.app`. This is the fallback, so it must be the live site, **not** localhost.
2. **Redirect URLs** = every address the app runs on. Add all of these (one per line):
   - `https://YOUR-APP.vercel.app`  (production)
   - `https://*-YOUR-TEAM.vercel.app/**`  (optional: Vercel preview deployments; see Vercel's docs for your exact pattern)
   - `http://localhost:5173`  (local development, `npm run dev`)
   - `http://localhost:4173`  (`npm run preview`)

Local development keeps working with a production Site URL, because the app passes `http://localhost:5173` itself and that address is on the list.

Use the exact address with no trailing slash and no path. `https://` and `http://` are different; `www.` and no `www.` are different.

**Google Cloud** needs only **one** redirect address, and it is never your app's address: under your OAuth client's **Authorized redirect URIs** put the Supabase callback `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`. Do **not** add `localhost` or your Vercel address there.

**Vercel:** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (and `VITE_GOOGLE_MAPS_API_KEY`) as environment variables for **Production** (and Preview if you use previews), then redeploy, because Vite bakes them in when it builds. No `VITE_SITE_URL` is needed; it is an optional override only.

If sign-in fails, the app now shows "Sign-in could not be completed", clears the broken address from the browser, and logs the technical detail to the browser console.

### 6. Test sign-in, reload and sign-out

1. Run `npm run dev` and open <http://localhost:5173>.
2. You should see the landing page ("Show up for yourself."). Click **Sign up with Google** (or **I already have an account**; both start the same Google sign-in), choose your Google account, and approve.
3. You should return to the app, signed in (gym setup the first time, then the home screen with your Google name at the top).
4. Reload the page (<kbd>F5</kbd>): you should stay signed in.
5. Click **Sign out**: you should return to the landing page. Reload to confirm you stay signed out.

| Symptom | Likely cause |
|---|---|
| "Sign-in is not set up yet" | `.env.local` missing or variable names misspelled, or dev server not restarted |
| Google says `redirect_uri_mismatch` | The Supabase callback address is missing from the Google client's Authorized redirect URIs |
| Live site redirects to `localhost:5173` after Google | **Site URL** in Supabase is still `http://localhost:5173`, or your live address is missing from **Redirect URLs**. Fix both (step 5) |
| Back on the landing page with "Sign-in could not be completed" | Your app address is missing from Supabase **Redirect URLs** |
| Google shows "Access blocked" | The consent screen is in Testing mode and your account is not in **Test users** |
| Error mentioning a provider that "is not enabled" | Google is not switched on under Supabase **Providers** |

## Profile onboarding and Manage Profile

After Google sign-in, the app loads your row from `public.profiles` (created automatically by the database; see [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md)):

| Your profile | What you see |
|---|---|
| Still loading | A loading screen (so you never see the app flash before onboarding) |
| Missing first or last name | **"Let's get to know you."**: first name, last name, optional date of birth |
| Has first and last name | The normal app (gym setup, then the home screen) |
| Could not be loaded / does not exist | The app still works, with a yellow notice explaining what to check |

Google usually supplies your first and last name, so most people will see those pre-filled, or skip onboarding altogether. Everyone can add a birthday later in **Manage Profile**.

**Your name on the home screen** is the first and last name saved in your profile (not the name on your Google account), and tapping it opens the Profile page. There is no separate Profile or Change gym link on the home screen any more.

**Manage Profile** (home screen → tap your name): your details are shown as text. Press **Edit** to make the first name, last name and date of birth editable, then **Save changes** (you return to the read-only view) or **Cancel** (changes are discarded). **Change gym** is on this page, and **Back** returns to the home screen. Your Google email is shown but can't be changed here, and **Sign out** is at the bottom. The form rules are the same everywhere: names are required (up to 25 characters, spaces included; a longer name saved earlier can still be shortened), and a birthday is optional but must be a real date **at least 15 years ago** (the date picker stops at exactly 15 years before today, and typing a later date is rejected too) and not before 1900.

If a save fails (for example your connection drops), the page shows an error and **keeps everything you typed**; press **Try again** to retry. There is no admin setting anywhere in the interface, and the app never sends `is_admin`; the database also refuses to let app users change it.

To try it: sign in with a Google account that is new to the app, or reset your profile names in the SQL Editor to see onboarding again:

```sql
update public.profiles set first_name = null, last_name = null where id = (select id from auth.users where email = 'you@example.com');
```

## Gym search: fitness places vs any place

| Who | Can search |
|---|---|
| Everyone (default) | Gyms and fitness-related places only. Picking anything else shows "Not a gym… Please select another place." |
| Administrators (`is_admin = true`) | Either **Fitness places only** (default) or **Any place**, chosen in the Profile page → *Gym search (administrator)* |

The choice is saved on the user's profile in Supabase (`place_search_mode`), so it survives a refresh and a new sign-in. It applies both when you first choose a gym and when you use **Change gym** (on the Profile page).

**Enforced by the database, not just the interface.** A regular user has no permission to write the setting, and the only way to change it is a database function that refuses `any_place` unless the caller's profile has `is_admin = true`. Hiding the control in the app is only a convenience. If someone's admin rights are removed, their "any place" setting stops applying immediately.

**How to make someone an administrator** (only possible in the Supabase SQL Editor, never from the app): see [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md#4-making-someone-an-administrator). This step needs a new migration; see the same file for how to apply it.

## The landing page

Signed-out visitors see a landing page: the Showup wordmark, a mascot banner, the headline "Show up for yourself.", a **Sign up with Google** button, **I already have an account**, and a line linking the Terms and Privacy Policy. Both buttons start the app's one existing Google sign-in (Google does not tell sign-up from sign-in apart), so there is no second login path.

**Content comes from Supabase, not from the code.** Rows of the `public.config` table (now config (renamed in Phase 9); it was `public.cms`) are read, in one request, before sign-in:

| Used for | `content_type` | `value` | If missing or empty |
|---|---|---|---|
| Mascot banner | `lpage_banner` | the image address (https) | the design's mascot picture, shipped with the app (`public/images/landing-banner-default.jpg`) |
| Terms and Conditions | `tnc` | the text, written in Markdown | the popup says the Terms are not available |
| Heading above the landing carousel | `landing.carousel_heading` | text | "Why it works" |

The newest row for each `content_type` wins (to change a value, add a new row). Rows are found by `content_type` only, not by `id`. The line under the buttons, "By continuing you agree to the Terms and Privacy Policy.", is written in the app.

Clicking **Terms** opens the Terms in a popup on the same page (read with the rest of the landing content, then kept). The Markdown is shown as formatted text and raw HTML in it is ignored, so editing the row cannot inject code into the page. If the banner row is missing or cannot be read, the built-in banner is shown. The only built-in content is that banner, the heading "Why it works" and the line under the buttons; there is no built-in Terms text.

**One-time database step:** signed-out visitors can only read `config` (renamed from `cms` in Phase 9) once a read policy exists. Run `supabase/migrations/20261022100000_cms_public_read.sql` in the Supabase SQL Editor. It allows read-only access to just those two content types. Until you do, the banner shows as unavailable and the Terms say they are not available.

**Privacy Policy link:** the project has no privacy policy page yet, so "Privacy Policy" is shown as plain text. When you have one, set `VITE_PRIVACY_POLICY_URL=https://...` in `.env.local` (and in Vercel) and it becomes a link.

**The banner address is a signed link** (it contains a token and expires after 365 days, around 21 October 2027). To avoid an expiring image, either update the `config` row (renamed from `cms` in Phase 9) before then, or make the storage bucket public and store its permanent public address.

## Configuring Google Maps

Gym search needs a Google Maps API key. Without one, the app still runs, but the gym setup screen shows a "Google Maps is not set up yet" message. There is deliberately no fake or hard-coded gym list.

### 1. Create a project and enable billing

1. Go to the [Google Cloud Console](https://console.cloud.google.com) and create a project (e.g. "Showup").
2. Link a **billing account**. Google Maps Platform requires billing to be enabled even if you stay within its free monthly usage. Check the [current pricing](https://mapsplatform.google.com/pricing/). You may want to set a [budget alert](https://cloud.google.com/billing/docs/how-to/budgets).

### 2. Enable the two APIs

In **APIs & Services → Library**, search for and enable:

- **Maps JavaScript API**
- **Places API (New)**. Make sure it is the "(New)" one; the legacy "Places API" is not what this app calls.

### 3. Create an API key

**APIs & Services → Credentials → Create credentials → API key.** Copy the key.

### 4. Restrict the key (important)

A browser API key **is visible to anyone** who opens your site. Putting it in `.env` keeps it out of Git, but it is still embedded in the built JavaScript. Restrictions are what stop others from abusing it.

Click the key and set:

- **Application restrictions → Websites**, and add each address that will use the app:
  - `http://localhost:5173/*` (development)
  - `http://localhost:4173/*` (`npm run preview`)
  - `https://your-deployed-domain.com/*` (if you deploy later)
- **API restrictions → Restrict key**, and select only **Maps JavaScript API** and **Places API (New)**.

Save. Changes can take a few minutes to apply.

### 5. Add the key to `.env.local`

```bash
VITE_GOOGLE_MAPS_API_KEY=your-key-here
```

Restart `npm run dev`; Vite only reads `.env` / `.env.local` at startup. Both are listed in `.gitignore`, so they will not be committed. Never paste a real key into `.env.example` or any source file.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Google Maps is not set up yet" | `.env.local` (or `.env`) missing, variable name misspelled, or dev server not restarted |
| "Google Maps could not be loaded" | Network problem, invalid key, or Maps JavaScript API not enabled |
| "Search failed" | Places API (New) not enabled, billing not enabled, or referrer restriction doesn't include your URL |

The browser console (<kbd>F12</kbd> → Console) shows Google's exact error message.

## Testing your location without going to the gym

Chrome and Edge can fake your location:

1. Open DevTools (<kbd>F12</kbd>) → **⋮ → More tools → Sensors**.
2. Under **Location**, choose **Other…** and enter your gym's latitude and longitude, or coordinates far away to test failure.
3. Press SHOW UP.

**On a phone:** browsers only allow geolocation on secure pages (`https://` or `localhost`). Opening `http://192.168.x.x:5173` from your phone will not be allowed to read your location. To test on a real phone, either deploy the built app to an HTTPS host, or use [Chrome remote debugging with port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server) so the phone can open `localhost:5173`. Add the deployed address to your key's website restrictions.

## Building for production

```bash
npm run build      # type-checks, then builds into dist/
npm run preview    # serves dist/ at http://localhost:4173
```

`dist/` is plain static files that can be hosted anywhere that serves HTTPS.

## Running tests and checks

```bash
npm test             # run all unit tests once
npm run test:watch   # re-run tests as you edit
npm run typecheck    # TypeScript errors only
npm run lint         # code-quality warnings
```

Tests use fake geolocation, fake storage and a fake Google Maps library, so they need no GPS, network or API key. The manual browser checklist is in [docs/versions/v0.1.0.md](docs/versions/v0.1.0.md#manual-testing-checklist).

## Uploading to GitHub

This folder is already a Git repository. To commit and push it:

```bash
# 1. Check that no secrets are about to be committed. .env and .env.local must NOT appear.
git status

# 2. Stage and commit
git add .
git commit -m "feat: create Showup MVP v0.1.0"

# 3. Create an empty repository on https://github.com/new
#    (no README, .gitignore or licence, since this project already has them).
#    Then connect it, replacing YOUR-USERNAME:
git remote add origin https://github.com/YOUR-USERNAME/showup.git
git branch -M main
git push -u origin main
```

If you have the [GitHub CLI](https://cli.github.com), step 3 can be replaced with:

```bash
gh repo create showup --private --source=. --push
```

Starting a brand-new folder instead? Run `git init` first, then follow the same steps.

## Known limitations

- **Gym check relies on Google's categories.** A real gym that Google has categorised wrongly (or not at all) will be rejected. The accepted categories are listed in `ALLOWED_GYM_PLACE_TYPES` in `src/config/constants.ts`. Someone could still pick a real gym they never visit, but they would have to physically go there to earn Showups.

- **Location data can be faked.** The database records WHO showed up and at WHICH of their own gyms, but the distance is measured by the browser, so a determined user can send false values. Real verification needs a server-side check (see `docs/DATABASE_SCHEMA.md`).
- **Needs a connection.** Gyms and Showups are saved to Supabase, so saving needs internet. If it fails you see a message and nothing is counted; there is no offline queue yet.
- **Older browser-only data is not imported.** Before this change, gyms and Showups were saved in the browser's localStorage. They are not copied over (the database sets each Showup's time itself, so old visits could not keep their dates); choose your gym again once. The old data is simply ignored.
- **Data lives in one browser.** Clearing site data, switching browsers or switching devices loses it. There is no sync or backup.
- **Location can be spoofed.** Showup checks the location the device *reports*. Developer tools, emulators and GPS-spoofing apps can fake it. It confirms reported proximity, not that anyone exercised.
- **Gym coordinates are a single point.** Google stores one point per place. In a very large building or campus you might be inside but more than 100 m from that point.
- **Indoor accuracy varies.** Inside buildings, accuracy can exceed the 100 m threshold; the app will ask you to retry.
- **No limit on Showups per day.** Pressing SHOW UP repeatedly at the gym records each press.
- **Geolocation needs HTTPS** (or `localhost`).
- **Bundle size.** The production bundle is about 535 kB (170 kB gzipped), mostly MUI. Vite shows a size warning; it is harmless at this scale.

## Intentionally excluded from v0.1.0

Real accounts · backend/database · multiple gyms · streaks, goals, rest days · reports and charts · friends and social features · QR check-in · notifications · offline/PWA support · light theme · decorative animation.

See [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md) for future ideas.

## Documentation

- [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md): what Showup is and what's in scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the app is put together
- [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md): a beginner's guide to changing the code
- [docs/versions/v0.1.0.md](docs/versions/v0.1.0.md): release notes and manual test checklist
- [CHANGELOG.md](CHANGELOG.md): history of changes
