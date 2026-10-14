# Showup

**Version 0.1.1** · a location-verified gym attendance tracker.

Save your gym once. When you arrive, press **SHOW UP**. Showup checks the location your device reports against your saved gym. If you're within 100 metres, it records one Showup. If not, nothing is recorded.

This is an MVP (minimum viable product). It exists to test the core interaction, not to be a finished fitness platform.

---

## Features in v0.1.0

- **Temporary demo profile.** You enter a username and a password. This is **not real authentication**: the password is never saved or checked, and everything stays in your browser.
- **Gym search with Google Maps.** Uses Places API (New) autocomplete to find a real gym, then saves its name, address and coordinates as **Gym 1**.
- **Gym-only check.** A selected place is only accepted if Google Maps lists it as a gym, fitness centre or similar sports facility. Homes, shops and other random locations are rejected with a "Not a gym" message.
- **SHOW UP button.** Gets your current location (high accuracy), measures the distance to your gym with the Haversine formula, and accepts the visit if you're inside the geofence.
- **Accuracy safeguard.** A location reading that's too imprecise is rejected with a "try again" message instead of being guessed.
- **Clear error messages** when location permission is denied, location is unavailable, the request times out, or the browser doesn't support geolocation.
- **Persistent counter and history** in `localStorage`, so they survive reloads and browser restarts.
- **Safe recovery** when saved data is damaged or storage is blocked.
- **Dark, mobile-first Material UI design** with no animations.

## Technologies

| What | Used for |
|---|---|
| [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org) | UI and type safety |
| [Vite](https://vite.dev) | Dev server and production build |
| [Material UI (MUI)](https://mui.com/material-ui/) | Components and dark theme |
| [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript), Places API (New) | Gym search |
| `@googlemaps/js-api-loader` | Official loader for the Maps script |
| Browser Geolocation API | The user's current position |
| Browser `localStorage` | Saving data on this device |
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
   cp .env.example .env        # macOS / Linux / Git Bash
   copy .env.example .env      # Windows Command Prompt / PowerShell
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Open the address it prints, normally <http://localhost:5173>. Edit any file in `src/` and the page reloads automatically.

Stop the server with <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal.

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

### 5. Add the key to `.env`

```bash
VITE_GOOGLE_MAPS_API_KEY=your-key-here
```

Restart `npm run dev`; Vite only reads `.env` at startup. `.env` is listed in `.gitignore`, so it will not be committed. Never paste a real key into `.env.example` or any source file.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Google Maps is not set up yet" | `.env` missing, variable name misspelled, or dev server not restarted |
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
# 1. Check that no secrets are about to be committed. .env must NOT appear.
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

- **Not real authentication.** Anyone using the same browser sees the same data. The password is ignored.
- **Data lives in one browser.** Clearing site data, switching browsers or switching devices loses it. There is no sync or backup.
- **Location can be spoofed.** Showup checks the location the device *reports*. Developer tools, emulators and GPS-spoofing apps can fake it. It confirms reported proximity, not that anyone exercised.
- **Gym coordinates are a single point.** Google stores one point per place. In a very large building or campus you might be inside but more than 100 m from that point.
- **Indoor accuracy varies.** Inside buildings, accuracy can exceed the 100 m threshold; the app will ask you to retry.
- **No limit on Showups per day.** Pressing SHOW UP repeatedly at the gym records each press.
- **Geolocation needs HTTPS** (or `localhost`).
- **Bundle size.** The production bundle is about 535 kB (170 kB gzipped), mostly MUI. Vite shows a size warning; it is harmless at this scale.

## Intentionally excluded from v0.1.0

Real accounts · backend/database · multiple gyms · streaks, goals, rest days · reports and charts · friends and social features · QR check-in · notifications · offline/PWA support · light theme · animations.

See [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md) for future ideas.

## Documentation

- [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md): what Showup is and what's in scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the app is put together
- [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md): a beginner's guide to changing the code
- [docs/versions/v0.1.0.md](docs/versions/v0.1.0.md): release notes and manual test checklist
- [CHANGELOG.md](CHANGELOG.md): history of changes
