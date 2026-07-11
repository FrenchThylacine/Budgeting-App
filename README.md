# Premium Budget App

A Vite + React budget dashboard focused on fast local use, recurring budget approval, dual-currency analytics, and mobile-friendly access.

## What’s included

- Monthly budget suggestion based on active recurring costs (excludes Piloting)
- Piloting expenses visible separately and excluded from category-share calculations
- Historical period indicator for past months/weeks with a subtle UI treatment
- Dashboard cards for current budget, remaining budget, monthly spending, recurring costs, and progress
- Compact header controls for month/week/year navigation
- Mobile-responsive layout and charts for phones/tablets
- Local data persistence via IndexedDB
- Easy local launch scripts for Windows

## Local development

1. Install dependencies:

```bash
npm ci
```

2. Run the app locally (development server):

```bash
npm run dev
```

or use the included `start` script which runs Vite and is suitable for local launches:

```bash
npm run start
```

3. Build for production:

```bash
npm run build
```

4. Preview the production build locally:

```bash
npm run preview
```

5. Run tests:

```bash
npm test
```

### One-click launch

Use the included shortcut scripts to start the app and open it in your default browser automatically:

- `run-local.ps1` — PowerShell startup script
- `run-local.bat` — Windows shortcut-friendly batch wrapper
- `Budget App.lnk` — shortcut file in the repository root that launches the app

To use the desktop shortcut:

1. Keep the app folder intact. Do not move `run-local.bat` or `run-local.ps1` out of the project directory.
2. Copy `Budget App.lnk` from the project root to your Desktop (or another convenient folder).
3. Double-click `Budget App.lnk` to start the app and open it in your browser.

If you prefer, create a new shortcut directly from `run-local.bat` by right-clicking it and choosing `Send to > Desktop (create shortcut)`.

## Phone access

The development server binds to `0.0.0.0`, so your phone can access the app from the same local network.

1. Run `npm run start` (or `npm run dev`)
2. Find your computer IP address on the local network
3. Open `http://<your-pc-ip>:5173` in your phone browser

If you need remote access outside your network, use a secure tunnel tool such as `ngrok` or `localtunnel`.

## Deployment

Static deployment options included in this repository:

- GitHub Pages: `.github/workflows/deploy-pages.yml` is present for Pages-based static hosting.
- Netlify: `.github/workflows/deploy-netlify.yml` can be used to deploy `dist/` to Netlify (requires `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets).

The app is primarily intended for private local use. Use a private Netlify site or a secure tunnel if you need remote access while keeping the repository private.

## Notes

- `vite.config.ts` allows local network binding for mobile access.
- `package.json` includes `npm run start` for local launches.
- `run-local.ps1` and `run-local.bat` provide one-click startup support.
- `Budget App.lnk` is available in the repository root; copy it to your Desktop to launch the app with one click.
- The UI improves responsiveness for smaller screens and mobile devices.
- Existing budget calculation and persistence behavior has been preserved and verified.
