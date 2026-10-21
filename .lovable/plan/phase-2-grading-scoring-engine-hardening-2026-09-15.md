# Phase 2 — Grading & Scoring Engine Hardening

Same treatment Phase 1 gave the exam engine, now applied to grading: one authoritative engine, idempotent saves, safe recovery, correct totals, and reliable score publishing. No user-facing feature is removed.

## Problems confirmed in the current system

- Term scores have no uniqueness rule in the database, so the same student can end up with duplicate term rows for one subject — the sheet then shows or saves against the wrong row.
- Auto-save writes straight from a debounce timer with no queue: two fast edits to the same cell can be applied out of order, and a slow response can overwrite a newer value.
- A newly created score row is written into the grid twice in a row, which can drop the freshly returned row id and cause a second insert on the next edit.
- The "flush on reconnect" handler only clears timers — pending edits made while offline are never actually sent.
- Deleting an activity still uses the raw browser confirm box instead of the app's themed confirmation.
- Totals/average/position are recomputed inline on every keystroke across the whole class list, which slows large classes.

## What will be built

### 1. Grading engine (`src/grading-engine/`)
A dedicated, typed engine mirroring the exam engine's architecture:

- **Score store** — single source of truth for students, activity columns, term scores and activity scores, with per-cell versioning so a late server response can never overwrite a newer local edit.
- **Save queue** — per-cell single-flight with queued follow-ups, exponential backoff, dedupe and offline awareness; edits made offline are held and flushed automatically on reconnect.
- **Idempotent writes** — every save becomes an upsert keyed on the natural identity of the cell, so retries and duplicate clicks can never create a second row.
- **Recovery** — on load/refresh/reconnect, server state and local draft are merged freshest-wins; unsaved edits survive a refresh or a 2-minute drop.
- **Computation module** — pure, memoized totals, weighted averages and ranking, recalculated incrementally instead of over the full class on each keystroke.
- **Publishing pipeline** — single-flight publish/unpublish of scores with a clear confirm step, progress state and accurate success/failure reporting.
- **Lifecycle + errors + logging** — resource registry for timers/listeners, typed grading errors with friendly messages, structured logs with correlation ids (reusing Phase 1 utilities).

### 2. Database migration
- Add unique constraints so one student has exactly one term score per subject/term/type, enabling true upserts (existing duplicates are consolidated first, keeping the most recent value).
- Supporting indexes for the grading sheet, ranking and report-card queries.
- Keeps the existing activity-score uniqueness rule, which already works.

### 3. UI rewiring (no feature loss)
- `GradingSheet.tsx` becomes a thin view over the engine: same layout, subject cards, term tabs, activity columns, add/delete activity, admin read-only mode, per-cell saving indicator.
- Adds: per-cell save state (saving / saved / retrying / failed with retry), offline badge, unsaved-count indicator.
- Activity deletion moves to the themed confirmation dialog with Cancel.
- `ReportCardGenerator.tsx` and `RankModule.tsx` consume the same computation module so totals, averages and positions match everywhere.
- Score publishing in the tasks/scores views routes through the publishing pipeline.

### 4. Tests
Vitest coverage for: save-queue ordering and single-flight, upsert idempotency under retry, offline queue flush on reconnect, freshest-wins recovery merge, totals/average/ranking correctness including partially graded students, and publish pipeline dedupe.

## Verification before completion
Typecheck, full test run, build check, and a pass over the grading sheet, report card, rank view and score publishing for regressions.
