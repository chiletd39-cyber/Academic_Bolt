# Roadmap

## Current request — Finish streaming before answer viewing
- [ ] Fix reported build errors and confirm the latest preview builds successfully.
- [ ] Replace Jitsi with LiveKit in meetings and live events (credentials supplied; implementation and verification in progress).
- [ ] Verify streaming and publish only after the replacement is ready.
- [ ] Then add authorized, read-only student answer viewing for teachers and the child's parents.

## Phase 2 — Grading & scoring engine (in progress)
- [x] DB migration: term-score uniqueness + upsert RPCs
- [x] Engine types + typed errors
- [x] Computation module (totals, averages, ranking, memoized)
- [x] Save queue (per-cell single-flight, backoff, offline flush)
- [x] Score store (versioned cells, freshest-wins)
- [x] Publish pipeline (single-flight publish/unpublish)
- [ ] useGradingEngine hook + GradingSheet rewiring (themed delete confirm, per-cell states, offline badge)
- [ ] RankModule uses shared computation
- [ ] Publishing call sites route through pipeline (HistoryModule, TeacherDashboard)
- [ ] Tests + typecheck + build check

## Phase 3+4 — Meetings, live streaming, QR mobile broadcasting (requested 2026-09-16)
Web app only, no Electron.
- [ ] Inspect existing meetings/live/realtime/schema
- [ ] Migrations: broadcast sessions/tokens/sources, trusted devices, attendance, viewers, reports, audit
- [ ] Server-authoritative RLS + RPCs (ended meeting permanently closed, role checks)
- [ ] src/meeting-engine/ provider-agnostic media layer + state machines
- [ ] QR mobile broadcast: generate/share/revoke/expire, secure token, device limits
- [ ] Mobile capture page (camera/mic permissions, preview, switch camera, network state)
- [ ] src/realtime/ centralized manager (reconnect, dedupe, replay)
- [ ] Attendance + durable reports (meeting + live event)
- [ ] Auth state machine + login UX/performance
- [ ] Service/repository layer, notification reliability, audit logging
- [ ] Tests, build/type/lint verification
