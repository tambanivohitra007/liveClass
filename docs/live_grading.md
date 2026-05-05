# Live Grading Feature — Integrated Architecture

## Overview

The Live Grading system is integrated into the LiveClass platform as a teacher feature module. It supports two modes:

- **Mode A (Session)**: Grade students who participated in a LiveClass live session
- **Mode B (Roster)**: Grade standalone student rosters for oral presentations, project demos, etc.

All infrastructure is shared with the main LiveClass app — Firebase Auth, Firestore, idb (IndexedDB), Zustand, Tailwind CSS v4, exceljs, and the NZK-inspired dark design system.

---

## Tech Stack (Shared with LiveClass)

- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- **Backend**: Firebase (Auth, Firestore, Storage, Hosting)
- **State**: Zustand (gradingStore)
- **Offline**: idb (IndexedDB) — `pending-evaluations` store
- **Export**: exceljs (dynamic import, client-side)
- **Icons**: lucide-react
- **Region**: asia-southeast1

---

## Firestore Collections

```
rubrics/{rubricId}                              — Rubric doc (ownerId, name, description, isTemplate, totalMaxScore, criteriaCount)
rubrics/{rubricId}/criteria/{criterionId}        — Criterion subcollection (name, type, maxScore, weight, order, levels?)

rosters/{rosterId}                              — Roster doc (ownerId, name, studentCount, classroomId?)
rosters/{rosterId}/students/{studentId}          — RosterStudent subcollection (name, studentNumber?, email?, order)

grading_sessions/{gsId}                         — GradingSession doc (ownerId, name, rubricId, sourceType, sourceId, status, studentCount, gradedCount, avgScore?, avgPercentage?)
grading_sessions/{gsId}/evaluations/{evalId}     — Evaluation doc (studentName, studentNumber?, totalScore, maxPossibleScore, percentage, comment, scores: Record<criterionId, {score, levelLabel?}>, gradedAt, syncedAt?)
```

### Security Rules

- `rubrics`: read by any authed user; CRUD by owner + admin
- `rubrics/criteria`: read by authed; write by rubric owner
- `rosters`: read/CRUD by owner + admin
- `rosters/students`: read by authed; write by roster owner
- `grading_sessions`: read/CRUD by owner + admin
- `grading_sessions/evaluations`: read by authed; write by grading session owner

---

## Feature Modules

### 1. Rubric Builder
- **Routes**: `/rubrics`, `/rubric/new`, `/rubric/:rubricId`
- **Files**: `RubricList.tsx`, `RubricEditor.tsx`
- **Features**: Create/edit rubrics with drag-drop criteria ordering, 3 criterion types (numeric, level, checkbox), level editor, template toggle, clone, Ctrl+S save, validation

### 2. Roster Management
- **Routes**: `/rosters`, `/roster/new`, `/roster/:rosterId`
- **Files**: `RosterList.tsx`, `RosterEditor.tsx`
- **Features**: Manual student entry, CSV import, Classroom import, drag-drop reorder, inline editing

### 3. Grading Session Creation
- **Route**: `/grading/new`
- **File**: `GradingSessionCreate.tsx`
- **Features**: 4-step wizard (Name & Source → Pick Source → Pick Rubric → Confirm & Create)

### 4. Live Grading Interface
- **Route**: `/grading/:gradingSessionId` (navbar hidden)
- **Files**: `GradingInterface.tsx`, `CriterionInput.tsx`, `StudentNavigator.tsx`, `useGradingSession.ts`
- **Features**: Full-screen grading, desktop sidebar + mobile strip, per-criterion scoring widgets, auto-save with 500ms debounce, keyboard shortcuts (arrows/Enter/Esc), offline support, save status indicator

### 5. Results & Export
- **Route**: `/grading/:gradingSessionId/results`
- **Files**: `GradingResults.tsx`, `gradingExcelExport.ts`
- **Features**: Overview stats, score distribution chart, sortable student table with expandable detail, per-criteria analysis, Excel export (3 sheets: Summary, Student Scores, Criteria Breakdown)

### 6. Offline Support
- **File**: `gradingOfflineQueue.ts`
- **Strategy**: Write to IndexedDB first → attempt Firestore → on failure queue for sync → sync on reconnect (`window.addEventListener('online')`)
- **Store**: `pending-evaluations` in `liveclass-offline` DB (version 2)

---

## Scoring (Client-Side)

```
totalScore = sum(scores[criterionId].score * criterion.weight)
maxPossibleScore = sum(criterion.maxScore * criterion.weight)
percentage = (totalScore / maxPossibleScore) * 100
```

No Cloud Function needed — grading is not competitive.

---

## Files Summary

### New files (13)
- `src/pages/teacher/RubricList.tsx`
- `src/pages/teacher/RubricEditor.tsx`
- `src/pages/teacher/RosterList.tsx`
- `src/pages/teacher/RosterEditor.tsx`
- `src/pages/teacher/GradingSessionCreate.tsx`
- `src/pages/teacher/GradingInterface.tsx`
- `src/pages/teacher/GradingResults.tsx`
- `src/stores/gradingStore.ts`
- `src/hooks/useGradingSession.ts`
- `src/components/CriterionInput.tsx`
- `src/components/StudentNavigator.tsx`
- `src/lib/gradingOfflineQueue.ts`
- `src/lib/gradingExcelExport.ts`

### Modified files
- `src/types/models.ts` — grading types
- `src/App.tsx` — routes + hideNavbar logic
- `src/pages/teacher/Dashboard.tsx` — Grade quick action button
- `src/components/Navbar.tsx` — Grading link for teachers
- `src/components/BottomTabBar.tsx` — Grading tab for mobile
- `firestore.rules` — grading collection rules

### No new dependencies
Everything uses existing: React, Zustand, Firebase SDK, idb, exceljs, lucide-react, Tailwind CSS v4
