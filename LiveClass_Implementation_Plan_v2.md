# LiveClass Game --- Implementation Plan (React + Firebase)

**Target Scale:** 100 Concurrent Users\
**Architecture:** React PWA + Firebase (Firestore + Cloud Functions)\
**Version:** 2.0 Production-Ready Plan

------------------------------------------------------------------------

# 1. Project Overview

This implementation plan defines the technical roadmap to build a
real-time gamified quiz platform similar to Kahoot/Quizizz, optimized
for 100 concurrent users using React PWA and Firebase.

Key Principles: - Server-authoritative game engine - Minimal real-time
listeners - Cloud Functions for scoring and validation - Firestore for
state distribution - PWA with offline-ready assignment mode

------------------------------------------------------------------------

# 2. Architecture Summary

React PWA\
→ Firebase Hosting\
→ Cloud Functions (Authoritative Game Engine)\
→ Firestore (State + Persistence)

------------------------------------------------------------------------

# 3. Phase 1 --- Project Setup (Week 1)

## 3.1 Frontend Setup

-   Initialize Vite + React + TypeScript
-   Install:
    -   firebase v10
    -   zustand
    -   react-router-dom
    -   idb (IndexedDB helper)
-   Configure environment variables
-   Setup Firebase config module

## 3.2 Firebase Setup

-   Create Firebase project
-   Enable:
    -   Firestore
    -   Authentication (Email + Google)
    -   Cloud Functions (Node 18)
    -   Hosting
-   Set region to asia-southeast1
-   Configure Firestore indexes

------------------------------------------------------------------------

# 4. Phase 2 --- Core Data Model (Week 1--2)

## 4.1 Firestore Structure

    users/{userId}
    quizzes/{quizId}
    sessions/{sessionId}
      meta
      players/{playerId}
      answers/{questionId}_{playerId}
      leaderboard_shards/{0-9}
      analytics/{questionId}
    assignments/{assignmentId}

## 4.2 Index Planning

-   sessionId + questionId composite index
-   sessionId + playerId composite index

------------------------------------------------------------------------

# 5. Phase 3 --- Quiz Authoring (Week 2)

## Features

-   Create / Edit / Delete quiz
-   Question types:
    -   MCQ
    -   True/False
    -   Short Answer
-   Image upload via Firebase Storage
-   Validation before publish

Deliverable: - Teacher dashboard functional

------------------------------------------------------------------------

# 6. Phase 4 --- Live Session Engine (Week 3--4)

## 6.1 Session Creation

Cloud Function: - Generate unique PIN - Create session document - Set
status = lobby

## 6.2 Join Flow

-   Student enters PIN
-   Create player document
-   Generate session token
-   Store activeToken in player doc

## 6.3 Question Lifecycle

Cloud Functions: - startQuestion() - submitAnswer() - endQuestion()

All scoring occurs server-side.

------------------------------------------------------------------------

# 7. Phase 5 --- Scoring & Leaderboard (Week 4)

## Scoring Algorithm

If correct: points = round(basePoints \* timeFactor) Else: points = 0

## Leaderboard Strategy

-   10 shards
-   Hash playerId % 10
-   Aggregate after question ends
-   Store top10Snapshot in session meta

Students subscribe only to: - session meta - own player document

------------------------------------------------------------------------

# 8. Phase 6 --- Assignment Mode + Offline (Week 5)

## Offline Strategy

-   Store answers in IndexedDB
-   Sync when connection restored
-   Server deduplicates by playerId + questionId

## Background Sync

-   Retry failed submissions automatically

------------------------------------------------------------------------

# 9. Phase 7 --- Security Rules (Week 5)

## Rules

-   Students cannot write leaderboard
-   Students cannot modify session meta
-   Answers only allowed during live_question
-   Duplicate answers rejected

Write unit tests for security rules.

------------------------------------------------------------------------

# 10. Phase 8 --- PWA Configuration (Week 6)

## Manifest

-   display: standalone
-   start_url: "/"
-   icons 192px + 512px

## Service Worker

-   Precache app shell
-   Cache quiz metadata
-   Stale-while-revalidate strategy

Target Lighthouse PWA Score ≥ 90

------------------------------------------------------------------------

# 11. Phase 9 --- Load Testing (Week 6)

Simulate: - 120 concurrent submissions in 2 seconds

Measure: - p95 latency - Error rate - Function CPU usage

Target: - Answer validation \< 400ms median

------------------------------------------------------------------------

# 12. Production Configuration

Cloud Functions: - memory: 512MB - minInstances: 1 - maxInstances: 20 -
region: asia-southeast1

Firestore: - Enable TTL cleanup for old sessions - Monitor write spikes

------------------------------------------------------------------------

# 13. Monitoring & Observability

Enable: - Firebase Performance Monitoring - Cloud Logging - Error
Reporting

Track: - Answer rejection rate - Function execution time - Session
concurrency

------------------------------------------------------------------------

# 14. Final Deliverables

-   React PWA (teacher + student flows)
-   Firebase backend (Functions + Firestore rules)
-   Deployment guide
-   Architecture diagram
-   Load testing report
-   Security rules documentation

------------------------------------------------------------------------

# 15. Estimated Timeline

Week 1: Setup + Data model\
Week 2: Quiz authoring\
Week 3--4: Live session engine\
Week 5: Assignment + Security\
Week 6: PWA polish + Load testing

Total: 6 Weeks

------------------------------------------------------------------------

# 16. Success Criteria

-   100 concurrent users stable
-   Leaderboard update \< 300ms
-   No duplicate scoring
-   Offline assignment sync reliable
-   Lighthouse PWA score ≥ 90
