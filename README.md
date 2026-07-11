# Premium Budget App

A modern budgeting dashboard built for fast local use, recurring budget approval, mobile-friendly access, and clean analytics.

## What’s included

- Monthly budget suggestion based on active recurring costs
- Piloting expenses visible separately and excluded from category-share calculations
- Historical period indicator for old months/weeks with a subtle UI treatment
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
2. Start the app locally:
   ```bash
   npm run start
   ```
3. Preview production output:
   ```bash
   npm run preview
   ```

### One-click launch

Use the included shortcut scripts to start the app and open it in your default browser automatically:

- `run-local.ps1` — PowerShell startup script
- `run-local.bat` — Windows shortcut-friendly batch wrapper

You can create a Windows desktop shortcut that points to `run-local.bat` for a single-click app launch.

## Phone access

The development server now binds to `0.0.0.0`, so your phone can access the app from the same local network.

1. Run `npm run start`
2. Find your computer IP address on the local network
3. Open `http://<your-pc-ip>:5173` in your phone browser

If you need remote access outside your network, use a secure tunnel tool such as `ngrok` or `localtunnel`.

## Deployment

This repository still includes GitHub Pages deployment via `.github/workflows/deploy-pages.yml`.

The app is primarily intended for local use, but GitHub Pages is available if you want a remote static preview.

## Notes

- `vite.config.ts` now allows local network binding for mobile access.
- `package.json` includes `npm run start` for local launches.
- `run-local.ps1` and `run-local.bat` provide one-click startup support.
- The UI now improves responsiveness for smaller screens and mobile devices.
- Existing budget calculation and persistence behavior has been preserved and verified.
