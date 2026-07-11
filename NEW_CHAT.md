NEW CHAT - Start Here

This file is the canonical instructions for starting a clean new conversation and where to make new changes.

Background
- The repository's main branch contains the most recent merged work (local-launch, mobile UI, install helpers, changelog, and release tag v2026.07.11).
- A separate branch work/clean-start exists as a clean starting point if you prefer; both branches are available on origin.

When creating a new chat
1. Open a new conversation window in the Copilot UI (start a fresh chat rather than continuing the old one).
2. At the top of the new chat paste this exact line to orient the assistant:
   "Repository branch: work/clean-start — use NEW_CHAT.md in repo root as the clean starting manifest."
3. If you want the assistant to modify main instead, say: "Work on main branch" and the assistant will operate on main.

What to reference in the new chat
- Branch to use: work/clean-start (clean) or main (merged final work)
- Useful files:
  - README.md — project instructions and local-launch steps
  - CHANGELOG.md and RELEASE_NOTES_v2026.07.11.md — release history
  - install-shortcut.ps1 / install-shortcut.bat — Desktop shortcut helper
  - run-local.ps1 / run-local.bat — one-click local server launcher
  - Budget App.lnk — shortcut file in repo root (copy to Desktop to launch)

How to run the app locally (short)
- npm ci  # first time
- npm run start  # starts Vite and opens browser (binds to 0.0.0.0)
- Or double-click Budget App.lnk (after installing it on Desktop) for one-click start

Notes for the new assistant instance
- Do not try to delete or modify this chat thread from within the repo — close it in the UI and start a new one.
- If you (the user) ask for the Desktop shortcut to be created remotely, the assistant will provide an install-shortcut.bat to run locally (it cannot directly write to the user's Desktop from this environment).

Created by the automation assistant to make future work clean and reproducible.
