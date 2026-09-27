# LiveClass — offline classroom games

A Blooket/Kahoot-style learning game platform that runs **without internet**. The teacher's Windows computer runs LiveClass. Students join from any phone, tablet or laptop on the same Wi-Fi (or the teacher's hotspot) by scanning a QR code or typing a PIN.

LiveClass comes in two forms. Both contain the same app and store data in the same format:

- **Desktop app (recommended):** a normal Windows program with an installer, its own window, a tray icon and a Start menu shortcut.
- **Portable `LiveClass.exe`:** a single file that needs no installation. It opens a console window and runs the app in the default browser.

## Features

- **Arcade (Blooket-style), students play at their own pace**
  - **Gold Quest:** answer to open chests: gain, double, triple, lose, steal or swap gold.
  - **Racing:** each correct answer moves you along the track; streaks give boosts.
  - **Tower Defense:** earn coins with correct answers and build towers against waves of enemies.
  - **Café:** answer to restock food, then serve customers for cash and buy upgrades.
- **Classic live quiz (Kahoot-style):** teacher-paced questions, speed scoring, streaks, teams, anti-cheat, podium.
- **Also included:** mini games (binary, subnetting, mental math, …), live grading, assignments, classes, rubrics, rosters and analytics.
- **Offline content:**
  - build question sets in the editor;
  - import and export `.json` / `.csv` files to share sets between teachers on a USB stick;
  - import Blooket CSV spreadsheets.
- **Local accounts:** the first account is the administrator, who approves new teachers. Students can play as guests with a nickname.

## For schools: the desktop app

### Install

1. Copy `LiveClass Setup <version>.exe` to the teacher computer (Windows 10/11, 64-bit) and run it.
2. The installer isn't code-signed yet, so Windows SmartScreen may say *"Windows protected your PC"*. Click **More info → Run anyway**.
3. Approve the administrator prompt. The installer:
   - adds LiveClass to the Start menu and the desktop;
   - allows LiveClass through Windows Firewall on **private** networks, so students can connect without a firewall prompt.
4. LiveClass opens when the installer finishes.

### First start

1. Connect the computer to the classroom Wi-Fi, or turn on its mobile hotspot.
2. Create the **administrator** account; LiveClass opens straight on this form the first time. All accounts made in the desktop app are teacher accounts. Other teachers can sign up later, and the administrator approves them under **Admin → Users**.
3. The pill at the top of the window shows the address students open, for example **Students join at 192.168.1.20:8080**. Click it to copy the address.

### Running a class

- **Host a game** from **Arcade** or **Quizzes** and put the window on the projector. **F11** switches to full screen.
- **Students** open the address from the pill (or scan the QR code in the **⋯** menu) and type the game PIN. They don't need an account.
- **Closing the window** asks whether to quit or keep running:
  - **Keep running** hides the window while games continue. Reopen it from the LiveClass icon in the taskbar tray.
  - **Quit** saves everything and disconnects the students.

### The ⋯ menu

The **⋯** button at the top right opens:

- **Students join at:** the student address, with **Copy address** and a **QR code** for students to scan;
- **View:** full screen, zoom and reload;
- **Help:** help & guides (F1), the data folder, the server log, developer tools and version info;
- **Quit LiveClass.**

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| F1 | Help & guides |
| F11 | Full screen (for the projector) |
| Ctrl+B | Show or hide the navigation labels |
| Alt+← / Alt+→ | Back / forward |
| Ctrl+R or F5 | Reload the page |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom in / out / reset |
| Ctrl+Shift+I | Developer tools (for troubleshooting) |

### Your data

Everything (accounts, quizzes, results and pictures) is stored in `%APPDATA%\LiveClass\liveclass-data`. Open it from **⋯ → Open data folder**.

- **Back up or move to another computer:** quit LiveClass, then copy that folder.
- **Uninstalling** (Windows Settings → Apps) removes the program and the firewall rule but keeps your data.
- **Problems:** **⋯ → Server log** opens the log file (`%APPDATA%\LiveClass\logs\server.log`).

### Students can't connect?

- Check that they're on the same Wi-Fi as the teacher computer.
- If Windows marked the Wi-Fi as a **Public network**, change it to **Private**: Settings → Network & internet → Wi-Fi → *network name*.
- Some school networks block devices from talking to each other ("client isolation"). Use the computer's mobile hotspot instead.

More teacher instructions are in [`lan/README-teachers.txt`](lan/README-teachers.txt). The installer and the portable exe both ship a copy.

## For schools: the portable exe

1. Copy `LiveClass.exe` to the teacher computer (nothing to install).
2. Connect to the classroom Wi-Fi, or turn on the hotspot.
3. Double-click `LiveClass.exe`. When Windows asks, allow it on **Private networks**. A console window opens, then your browser; keep the console window open during class.
4. Create the administrator account, then host a game. Students open the address shown in the console window.

Data is stored in `liveclass-data/` next to the exe.

## For developers

Requires Node.js 22+ on Windows (the desktop installer is Windows-only).

```bash
npm install
npm run dev:server   # LAN server on :8080 (rebuilds the server bundle, restarts on change)
npm run dev          # Vite dev server; proxies /ws, /api, /uploads to :8080
```

| Command | Description |
|---------|-------------|
| `npm run build` | Typecheck client + server, build `dist/` and `build/server.cjs` |
| `npm run server` | Build and run the server, serving `dist/` |
| `npm run desktop` | Full build, then run the desktop app from the repo |
| `npm run build:desktop` | Bundle only the desktop shell into `build/desktop/` |
| `npm run package:desktop` | Full build, then the installer in `release/desktop/` (electron-builder, NSIS) |
| `npm run package:exe` | Full build, then `release/LiveClass.exe` (Node single executable with embedded web client) |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |

Environment variables:

- `PORT`: default 8080; the next free port is used if it's taken.
- `LIVECLASS_DATA`: data folder.
- `LIVECLASS_NO_BROWSER=1`: the portable exe doesn't open a browser on start.

### Working on the desktop app

- **Running from VS Code's terminal:** VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node and fail with `Cannot read properties of undefined (reading 'getAppPath')`. Clear it first:
  - Git Bash: `env -u ELECTRON_RUN_AS_NODE npm run desktop`
  - PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE; npm run desktop`
- **Development data:** the repo's `liveclass-data/`, the same folder `npm run server` uses. Window state and logs go to `%APPDATA%\LiveClass-dev`, separate from an installed copy.
- **Faster rebuilds:** after changing only `lan/desktop/`, run `npm run build:desktop`, then `npx electron .`.
- **Debugging:** start with `npx electron . --remote-debugging-port=9333` and open `http://127.0.0.1:9333` in Chrome. The title bar, the ⋯ menu and the app each appear as separate pages.
- **Before shipping:** set `version` in `package.json`; the installer's file name and the About box use it.

## Architecture

The app was built on Firebase. Instead of rewriting ~100k lines, the LAN server re-implements the parts of the Firebase APIs the app uses.

```
LiveClass.exe (Node SEA)  or  build/server.cjs (in the desktop app)
 ├─ HTTP: web client, /uploads, /api/config, /api/upload
 ├─ WebSocket /ws: one connection per browser
 │    docs (Firestore-like) · tree (Realtime-DB-like) · auth · callables
 ├─ DocStore / TreeStore: in memory, persisted to SQLite (node:sqlite)
 ├─ rules.ts: port of firestore.rules and database.rules.json
 └─ functions/src/index.ts: the original Cloud Functions, running unchanged
      against local firebase-admin / firebase-functions shims
```

- **Client:** Vite aliases `firebase/*` to [`src/lan/`](src/lan/), drop-in modules that talk to the server over one auto-reconnecting WebSocket, so the pages themselves are unchanged.
- **Server:** [`lan/server/`](lan/server/). esbuild bundles it together with `functions/src`, redirecting `firebase-admin` and `firebase-functions` to [`lan/server/shims/`](lan/server/shims/).
- **Arcade modes:** [`lan/server/arcade/`](lan/server/arcade/) keeps them server-authoritative. Correct answers and chest outcomes never reach the student's device before they commit an answer, and the scores reported by the mini-games are capped by what the server granted.
- **Not available offline:** Google sign-in, push notifications, email, and AI question generation. YouTube videos inside questions also won't play.

### Desktop app

```
LiveClass (Electron)
 ├─ main process (lan/desktop/main.ts)
 │    starts build/server.cjs in a utility process; it reports its port and saves on quit
 ├─ window (native frame, custom title bar, Snap Layouts)
 │    ├─ titlebar.html: back/forward, page title, student-address pill, ⋯ button, splash screen
 │    ├─ app view: the web app from http://localhost:<port>, below the 40px title bar
 │    └─ menu.html: the ⋯ menu, a transparent overlay shown on demand
 └─ tray icon: open, copy the student address, data folder, quit
```

- **Web app in desktop mode:** the desktop app adds `LiveClassDesktop` to its user agent. The web app detects it (`isDesktopApp` in [`src/lib/platform.ts`](src/lib/platform.ts)) and switches to desktop behaviour. Students' browsers keep the web version.
- **Desktop behaviour:**
  - the Segoe UI font and antd-style buttons ([`src/desktop.css`](src/desktop.css));
  - a Windows-style navigation pane ([`DesktopSidebar.tsx`](src/components/DesktopSidebar.tsx));
  - no footer and no floating help button (F1 opens help instead);
  - teacher-only sign-up.
- **Installer:** the settings are in [`electron-builder.yml`](electron-builder.yml). [`lan/desktop/installer.nsh`](lan/desktop/installer.nsh) adds and removes the firewall rule.

## Project structure

```
lan/
  server/              LAN server (stores, auth, rules, WebSocket, functions host, arcade)
  desktop/             Electron shell: main process, title bar, ⋯ menu, preloads, installer script
  build-server.mjs     esbuild bundle → build/server.cjs
  build-desktop.mjs    esbuild bundle → build/desktop/
  package-exe.mjs      Node SEA packaging → release/LiveClass.exe
  README-teachers.txt  Teacher instructions shipped with both builds
src/
  lan/                 Firebase-compatible client modules + shared protocol/values
  desktop.css          Desktop-only styling (fonts, buttons, navigation pane)
  components/          Includes DesktopSidebar.tsx and sidebarNav.ts (shared navigation entries)
  pages/arcade/        Arcade picker, host (projector) view, student play shell, modes/
  lib/questionFiles.ts JSON/CSV/Blooket import & export
functions/src/         Original Cloud Functions (run by the LAN server)
electron-builder.yml   Desktop installer configuration
```
