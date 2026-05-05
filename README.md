# LiveClass Game

A real-time, gamified quiz and mission platform inspired by Kahoot. Built as a Progressive Web App with React and Firebase, designed for classrooms and interactive learning sessions supporting up to 100 concurrent players.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Routing | react-router-dom |
| Backend | Firebase (Auth, Firestore, Cloud Functions, Storage, Hosting) |
| PWA | vite-plugin-pwa + Workbox |
| Offline | idb (IndexedDB) for offline answer queue |
| 3D/Animation | Three.js, GSAP |
| Icons | lucide-react |

## Features

- **Live Quiz Hosting** — Teachers create quizzes, host live sessions with a unique 6-digit PIN
- **Real-time Leaderboard** — Speed-based scoring with streak bonuses, updated after each question
- **QR Code Join** — Students scan a QR code or enter a PIN to join instantly
- **Anti-Cheat** — Pattern verification captcha + session tokens to prevent duplicate joins
- **Random Nicknames** — Fun auto-generated nicknames (e.g. SwiftPanda, CosmicNinja)
- **Assignments** — Async quiz mode with offline support and background sync
- **CSV Export** — Export session results with player answers and scores
- **PWA** — Installable, works offline, auto-updating service worker

## Prerequisites

- **Node.js** 20+
- **Firebase CLI** (`npm install -g firebase-tools`)
- A Firebase project with Auth, Firestore, Cloud Functions, Storage, and Hosting enabled

## Getting Started

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd kahoot
   ```

2. **Install dependencies**

   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

3. **Configure Firebase**

   Create `src/lib/firebase.ts` with your Firebase config (or update the existing one with your project credentials). Ensure your Firebase project region is set to `asia-southeast1`.

4. **Start the dev server**

   ```bash
   npm run dev
   ```

5. **Start Cloud Functions emulator** (optional, for local function testing)

   ```bash
   cd functions && npm run serve
   ```

## Available Scripts

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build locally |

### Cloud Functions

| Command | Description |
|---------|-------------|
| `cd functions && npm run build` | Compile TypeScript |
| `cd functions && npm run serve` | Build + start Firebase emulators |

### Deployment

| Command | Description |
|---------|-------------|
| `firebase deploy --only hosting` | Deploy frontend |
| `firebase deploy --only functions` | Deploy Cloud Functions |
| `firebase deploy --only firestore:rules` | Deploy Firestore security rules |

### Type Checking

| Command | Description |
|---------|-------------|
| `npx tsc -b --noEmit` | Check frontend types |
| `cd functions && npx tsc --noEmit` | Check functions types |

## Project Structure

```
src/
├── pages/
│   ├── Home.tsx, Login.tsx, Signup.tsx
│   ├── teacher/
│   │   ├── Dashboard.tsx          # Teacher home with quiz management
│   │   ├── QuizEditor.tsx         # Create/edit quizzes and questions
│   │   ├── HostSession.tsx        # Live session control panel
│   │   ├── SessionResults.tsx     # Post-game results and analytics
│   │   └── AssignmentCreate.tsx   # Create async assignments
│   └── student/
│       ├── JoinGame.tsx           # PIN entry + captcha verification
│       ├── PlayGame.tsx           # Live game play interface
│       ├── PlayAssignment.tsx     # Async assignment player
│       └── StudentDashboard.tsx   # Student home
├── components/
│   ├── Navbar.tsx, Toast.tsx, Skeleton.tsx
│   ├── Leaderboard.tsx, ImageUpload.tsx
│   ├── ProtectedRoute.tsx, ValidatedInput.tsx
│   └── ui/                        # Reusable UI primitives
├── stores/
│   ├── authStore.ts               # Firebase auth + user state
│   ├── sessionStore.ts            # Live session state + players
│   └── toastStore.ts              # Toast notification queue
├── lib/
│   ├── firebase.ts                # Firebase SDK config
│   └── offlineQueue.ts            # IndexedDB offline answer queue
├── types/
│   └── models.ts                  # Shared TypeScript interfaces
└── App.tsx                        # Router + layout

functions/src/
└── index.ts                       # Cloud Functions
    ├── createSession              # Generate PIN, create session
    ├── joinSession                # Validate + create player
    ├── startQuestion              # Begin question timer
    ├── scoreAnswer                # Compute score + update leaderboard
    ├── endQuestion                # Finalize question, snapshot leaderboard
    ├── exportCsv                  # Export results as CSV
    └── cleanupExpiredSessions     # Scheduled cleanup
```

## Architecture

### Server-Authoritative Scoring

All scoring logic runs in Cloud Functions — clients never compute their own scores. Points are calculated as `base(1000) * timeRemaining%` with a +50 streak bonus for consecutive correct answers.

### Real-time Updates

- Teachers write session state to `sessions/{id}` (question index, state: lobby/live/reveal)
- Clients subscribe via Firestore `onSnapshot` for instant updates
- Answer documents use composite IDs (`{questionId}_{playerId}`) to prevent duplicates

### Leaderboard

Player scores are stored in individual shards at `sessions/{id}/leaderboard_shards/{playerId}`. Top 10 snapshots are stored in the session document after each question ends.

### Firestore Structure

```
users/{userId}
quizzes/{quizId}
questions/{questionId}
sessions/{sessionId}
  ├── players/{playerId}
  ├── answers/{questionId}_{playerId}
  ├── leaderboard_shards/{playerId}
  └── analytics/{questionId}
assignments/{assignmentId}
```

### Security Rules

- Answers, leaderboard shards, and analytics are write-protected (Cloud Functions only)
- Students can read sessions and create player documents
- Quiz CRUD is restricted to the quiz owner

## Performance Targets

- Answer round-trip: ≤ 400ms median
- Leaderboard update: ≤ 300ms at 100 players
- Lighthouse PWA score: ≥ 90
- Browser support: Chrome, Edge, Firefox, Safari (latest 2 versions)

## License

Private project.
