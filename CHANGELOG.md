# Changelog

## 2026-07-11

- Added local startup support and one-click launch helper for Windows.
- Included `Budget App.lnk` shortcut file in the repository root for easy deployment to Desktop.
- Improved the mobile and tablet UI with responsive layout changes and compact period navigation.
- Added clearer README instructions for running the app locally and accessing it from a phone.
- Verified all existing tests pass and confirmed the production build succeeds.
- Preserved budget calculations, recurring expense logic, and data persistence.

### 2026-07-11 — Launcher & installer (follow-up)
- Added installer script: `scripts/install-launcher.ps1` — copies GUI and batch to Desktop and creates a Desktop shortcut that runs the GUI via PowerShell.
- Enhanced repo launcher with tray icon, port polling timer, LAN auto-open, and balloon notifications: `scripts/launch-gui.ps1`.
- Improved repo batch launcher to auto-open browser and support LAN preview: `scripts/launch-desktop.bat`.
- Local Desktop GUI updated at `C:\Users\iyadf\Desktop\Budget-Launcher-GUI.ps1` (not tracked by default). Use the installer to sync.

Files changed in this step:
- scripts/install-launcher.ps1 (new)
- scripts/launch-gui.ps1 (updated)
- scripts/launch-desktop.bat (updated)

Run installer from repo root to install to Desktop:
  powershell -ExecutionPolicy Bypass -File .\scripts\install-launcher.ps1

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>

### 2026-07-11 — Desktop GUI tracked & local build
- Added repo-tracked copy of Desktop GUI launcher: `scripts/desktop-launcher-gui.ps1`.
- Performed local production build (tsc + vite build); `dist/` produced successfully.

Files changed in this step:
- scripts/desktop-launcher-gui.ps1 (new)

The GitHub Actions deploy workflow exists but shows no recent runs via the API; check the Actions tab in GitHub or trigger a manual run if you want the site published immediately.

