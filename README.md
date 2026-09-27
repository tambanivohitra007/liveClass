# LiveClass — offline classroom games

A Blooket/Kahoot-style learning game platform that runs **without internet**. One teacher computer runs `LiveClass.exe`. Students join from any phone, tablet or laptop on the same Wi-Fi (or the teacher's hotspot) by scanning a QR code or typing a PIN.

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

## For schools: run it

1. Copy `LiveClass.exe` to the teacher computer (Windows 10/11; nothing to install).
2. Connect the computer to the classroom Wi-Fi, or turn on its mobile hotspot.
3. Double-click `LiveClass.exe`. When Windows asks, allow it on **Private networks**.
4. Create the administrator account, then host a game. Students open the address shown on screen.

Data is stored in `liveclass-data/` next to the exe. Copy that folder to back it up. See [`lan/README-teachers.txt`](lan/README-teachers.txt), which also ships next to the exe.

## For developers

Requires Node.js 22+.

```bash
npm install
npm run dev:server   # LAN server on :8080 (rebuilds the server bundle, restarts on change)
npm run dev          # Vite dev server; proxies /ws, /api, /uploads to :8080
```

| Command | Description |
|---------|-------------|
| `npm run build` | Typecheck client + server, build `dist/` and `build/server.cjs` |
| `npm run server` | Build and run the server, serving `dist/` |
| `npm run package:exe` | Full build, then `release/LiveClass.exe` (Node single executable with embedded web client) |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |

Environment variables: `PORT` (default 8080; the next free port is used if taken), `LIVECLASS_DATA` (data folder), `LIVECLASS_NO_BROWSER=1` (don't open a browser on start).

## Architecture

The app was built on Firebase. Instead of rewriting ~100k lines, the LAN server re-implements the parts of the Firebase APIs the app uses.

```
LiveClass.exe (Node SEA)
 ├─ HTTP: web client (embedded), /uploads, /api/config, /api/upload
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

## Project structure

```
lan/
  server/            LAN server (stores, auth, rules, WebSocket, functions host, arcade)
  build-server.mjs   esbuild bundle → build/server.cjs
  package-exe.mjs    Node SEA packaging → release/LiveClass.exe
src/
  lan/               Firebase-compatible client modules + shared protocol/values
  pages/arcade/      Arcade picker, host (projector) view, student play shell, modes/
  lib/questionFiles.ts   JSON/CSV/Blooket import & export
functions/src/       Original Cloud Functions (run by the LAN server)
```
