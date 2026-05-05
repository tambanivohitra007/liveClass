# Anti-Cheat Roadmap

Future enhancements for the LiveClass Game anti-cheat system.

## Already Implemented

- **Tab-switch detection** — Visibility API + window blur + paste detection via `useAntiCheat` hook
- **Violation logging** — `reportViolation` Cloud Function writes to `sessions/{id}/violations/{playerId}`
- **Host visibility** — ShieldAlert badges on player cards, "Flagged Activity" in reveal view
- **Session tokens** — `activeToken` per player, validated in `scoreAnswer`
- **Duplicate prevention** — Composite answer IDs (`questionId_playerId`)
- **Server-authoritative scoring** — All point calculations in Cloud Functions

## 2. Server-Side Time Window Validation

Reject answers submitted after the question timer expires.

**Where:** `scoreAnswer` in `functions/src/index.ts`

**Logic:**
- Read `questionStartedAt` and question's `timeLimitSec` from session/question docs
- Compute deadline: `questionStartedAt + (timeLimitSec * 1000) + GRACE_MS`
- If `Date.now() > deadline`, reject the answer
- Suggested grace period: 2000ms (accounts for network latency)

## 3. Minimum Response Time Threshold

Flag or reject answers submitted suspiciously fast (likely bot or shared answers).

**Where:** `scoreAnswer` in `functions/src/index.ts`

**Logic:**
- If `elapsedTimeMs < MIN_THRESHOLD_MS`, flag as suspicious
- Suggested threshold: 800–1000ms (no human can read + answer that fast)
- Options: reject outright, award zero points, or log a `fast_answer` violation type

## 4. Option Order Randomization

Shuffle answer options per player so screenshots/screen-sharing is less useful.

**Where:** `startQuestion` Cloud Function + `PlayGame.tsx`

**Logic:**
- When question goes live, generate a per-player shuffle seed (or shuffle on the client using `playerId` as seed)
- Display options in shuffled order on the student's device
- Map selected option back to original index before submitting
- Teacher/host always sees canonical order

## 5. Answer Pattern Detection

Detect groups of players with suspiciously correlated answers.

**Where:** New Cloud Function or `endQuestion` post-processing

**Signals to check:**
- Multiple players answering within <200ms of each other consistently
- Identical wrong-answer sequences across all questions
- Perfect score + fastest time (statistically improbable)
- Cluster analysis: group players by (answer, timing) vectors

**Action:** Flag in analytics/session results for teacher review.

## 6. Single-Device Enforcement

Prevent one person from playing on multiple tabs/devices.

**Where:** `joinSession` Cloud Function + client-side heartbeat

**Logic:**
- On join, store a `deviceToken` (random ID generated client-side, stored in sessionStorage)
- Client sends periodic heartbeat (every 10–15s) updating `lastSeen` on the player doc
- If a second device joins with the same nickname, compare tokens — reject the new one or invalidate the old one
- Alternative: use Firebase Auth UID for authenticated sessions

## 7. IP-Based Limits

Flag multiple players joining from the same IP address.

**Where:** `joinSession` Cloud Function

**Logic:**
- Extract IP from `request.rawRequest.ip`
- Store IP hash on player doc
- If >N players share the same IP hash, flag them for teacher review
- Don't auto-block (classrooms share IPs)

## 8. Rejoin Prevention

Limit or block players who disconnect mid-game from rejoining.

**Where:** `joinSession` Cloud Function

**Logic:**
- Track `disconnectedAt` on player doc (via presence system or client `beforeunload`)
- If player tries to rejoin after disconnecting, apply cooldown or block entirely
- Teacher override: allow host to manually re-admit players

## 9. Question Pool / Rotation

Draw questions from a larger pool so not everyone gets identical questions.

**Where:** `startQuestion` Cloud Function + QuizEditor

**Logic:**
- Teacher creates more questions than will be shown (e.g., 20 questions, show 10)
- `rotatingSetSize` field already exists on Session model
- Randomly select subset per session, or rotate per player in student-paced mode
- Reduces value of sharing answers between sessions

## Priority Matrix

| Enhancement | Impact | Effort | Priority |
|---|---|---|---|
| Server-side time window | High | Low | P0 |
| Minimum response time | High | Low | P0 |
| Option randomization | Medium | Medium | P1 |
| Answer pattern detection | Medium | High | P2 |
| Single-device enforcement | Medium | Medium | P1 |
| IP-based limits | Low | Low | P2 |
| Rejoin prevention | Low | Medium | P3 |
| Question pool/rotation | Medium | High | P2 |
