# Story 4.1: Health Score Engine

Status: done

## Story

As a **user**, I want the system to compute my Application Health Score from my actual pipeline data, so that I get an objective read on the state of my job search without having to analyse it myself.

## Acceptance Criteria (from epics.md)

1. `health-score-engine.ts` returns a `HealthScoreResult` (score 0–100, zone GREEN/YELLOW/RED, active indicator id, coaching instruction).
2. Five indicators: `LOW_PIPELINE_RATIO`, `LOW_RECENT_ACTIVITY`, `HIGH_GHOSTING_DRAG`, `OVERDUE_FOLLOWUPS`, `STALE_CV` — each with the spec's coaching message.
3. Zones: ≥70 GREEN, 40–69 YELLOW, <40 RED.
4. Highest-priority active indicator wins the coaching string (priority is the AC's listed order).
5. Engine is pure: reads, never writes; fully unit-tested.
6. The score recomputes on data change. **Project-context override:** the codebase uses `router.refresh()` from clients after Server-Action mutations, not `revalidateTag`. The widget is a Server Component that re-queries on each render, so a refresh produces a fresh score automatically — no cache tag needed.

## Implementation

### Pure engine

`src/lib/services/health-score-engine.ts` exports:

- `computeHealthScore(inputs) → HealthScoreResult` — pure, no Prisma.
- `getHealthScoreForUser(userId)` — fetches the four data slices the engine needs and calls `computeHealthScore`. Read-only.

Inputs: active listings (with vitalityState + application status/updatedAt + title/company for the OVERDUE_FOLLOWUPS message), all applications (for the recent-activity window), most recent `CvVersion.uploadedAt`, the AppConfig follow-up threshold, and `now`. The engine reuses `isFollowUpDue` from the Story 3.6 detector so the rule is shared and the threshold is honoured.

### Scoring

Uniform weight: each indicator that fires deducts 20 points. None fire → 100 (GREEN). All five fire → 0 (RED). The numeric score reflects breadth; the single coaching instruction reflects severity priority.

### Priority

Listed-order is the priority order, exactly as the AC says:
1. LOW_PIPELINE_RATIO
2. LOW_RECENT_ACTIVITY
3. HIGH_GHOSTING_DRAG
4. OVERDUE_FOLLOWUPS
5. STALE_CV

Tested explicitly: when both LOW_PIPELINE_RATIO and LOW_RECENT_ACTIVITY fire, the active indicator is LOW_PIPELINE_RATIO. When OVERDUE and STALE_CV both fire, OVERDUE wins.

### Edge cases covered by tests

- Empty board (zero listings) — `LOW_PIPELINE_RATIO` does NOT fire (no divide-by-zero, no false stale classification).
- Zero CVs — `STALE_CV` does NOT fire (the engine doesn't pretend "missing" means "old").
- Threshold boundaries — `LOW_PIPELINE_RATIO` is strictly greater than 60% (not ≥); `HIGH_GHOSTING_DRAG` is strictly greater than 3.
- Purity check — `JSON.stringify` round-trip before/after equality (engine never mutates inputs).
- Score arithmetic — three indicators → 40 (YELLOW), five indicators → 0 (RED), zero → 100 (GREEN).
- OVERDUE_FOLLOWUPS — names the specific listing in the message; other indicators never name a listing.

### Files

- `followcv/src/lib/services/health-score-engine.ts` — created
- `followcv/src/lib/services/health-score-engine.test.ts` — created (20 tests)

Suite: 280 tests; tsc/lint/build clean.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story implemented and shipped to main | claude-opus-4-7 |
