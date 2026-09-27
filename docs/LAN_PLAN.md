# LiveClass LAN — offline, Blooket-style classroom games

Goal: the whole app runs from **one Windows `.exe`** on a teacher laptop. Students on the same
Wi‑Fi/LAN open `http://<laptop-ip>:8080` (or scan the QR code). No internet, no Firebase.

## Architecture

```
LiveClass.exe  (Node SEA: bundled server + embedded web client)
 ├─ HTTP   : serves the React app, /uploads, /api/*
 ├─ WS /ws : realtime protocol (docs, queries, rtdb paths, callables, auth)
 ├─ DocStore  (Firestore-compatible: collections, queries, listeners)  ─┐
 ├─ TreeStore (Realtime-Database-compatible JSON tree + listeners)      ├─ SQLite (node:sqlite) → ./liveclass-data/
 ├─ Auth      (local email/password accounts, scrypt, bearer tokens)    ┘
 └─ Functions host: the existing functions/src/index.ts, run unchanged against
    local shims of `firebase-admin` / `firebase-functions`.
```

**Compatibility layer, not a rewrite.** The client keeps importing `firebase/firestore`,
`firebase/auth`, `firebase/database`, `firebase/functions`, `firebase/storage`; Vite aliases
those to `src/lan/*`, which implement the subset of the API the app uses over one WebSocket.
The server bundles `functions/src` with `firebase-admin` / `firebase-functions` aliased to
`lan/server/shims/*`. Security rules are ported to a TypeScript authorization hook.

Offline-incompatible features are disabled gracefully: Google sign-in, push notifications,
email, Gemini/AI generation (hand-written generators still work).

## Phases (all done)

1. **Core server** — DocStore, TreeStore, auth, uploads, WS protocol, persistence.
2. **Client shims** + Vite aliases; app boots and works against the local server.
3. **Functions** — run `functions/src` on the server via admin/functions shims; triggers + scheduler.
4. **Authorization** — port `firestore.rules` / `database.rules.json` to server checks.
5. **Blooket modes** — Gold Quest, Racing (host-projected track), Tower Defense, Café
   (solo-paced, question-gated), alongside existing Classic.
6. **Content** — question-set JSON/CSV import & export (USB sharing) in the quiz editor.
7. **Packaging** — esbuild + Node SEA → `LiveClass.exe`; shows LAN URL + QR on start,
   first launch creates the admin/teacher account.
