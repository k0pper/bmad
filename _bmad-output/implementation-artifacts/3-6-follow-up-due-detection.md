# Story 3.6: Follow-up Due Detection

Status: done

## Story

As a **user**,
I want the board to surface listings that need a follow-up,
So that I never let an application go cold because I forgot to chase.

## Acceptance Criteria (from epics.md)

1. Listings in `Applied` / `INTERVIEWING` / `ON_HOLD` with no recent activity are surfaced as "Follow-up due" on the BoardRow with a distinct visual indicator.
2. The threshold is configurable via `AppConfig.follow_up_threshold_days` (default 7).
3. The threshold is read from the DB at runtime (not hardcoded).
4. Recording any new activity (status update, note, application) resets the follow-up timer.

## Implementation

### Pure follow-up detector

`src/lib/services/follow-up-detector.ts` exports two functions:

- `isFollowUpDue(inputs) → boolean` — pure, fully unit-tested. Inputs: `application` (status + updatedAt), `archived`, `thresholdDays`, `now`. Returns true only for non-archived listings with an Application in `APPLIED` / `INTERVIEWING` / `ON_HOLD` whose `updatedAt` is older than the threshold.
- `getFollowUpThresholdDays() → Promise<number>` — reads `AppConfig` key `follow_up_threshold_days`, defaults to 7 (also defaults if the value is non-numeric or non-positive). Single fetch per request.

The "no recent activity" semantic is satisfied by reading `Application.updatedAt`, which Prisma's `@updatedAt` bumps automatically on every write to the row. Status changes (`updateApplicationStatus`) and note edits (`updateApplicationNotes`) both go through `prisma.application.update`, so each one naturally resets the timer — exactly matching the spec.

### Why not a background job?

The original AC mentions "follow-up detection runs as part of the vitality recalculation background job". The follow-up flag is purely derived from existing columns (`Application.updatedAt`, `Application.status`, `JobListing.archived`) — there's no DB write needed and no schema column to populate. Computing it on read in the Board page is simpler, cheaper, and always fresh. No new schema, no need to invalidate a cached flag.

If a future story needs a denormalised `JobListing.followUpDue` column for, say, server-side filtering at scale, the recompute job would gain that responsibility. Not needed now.

### Board integration

`/board` page:
1. Selects `application: { id, status, updatedAt }` per listing (was `{ id }` only).
2. Calls `getFollowUpThresholdDays()` once for the request.
3. Computes `followUpDue: boolean` per listing into the existing `BoardListing` shape — same `nowMs` already used for the recency calc.

`BoardRow` now renders a three-state right-cluster pill:
- `applied && followUpDue` → amber **Follow up** pill (uses the `--color-vitality-deadline-*` tokens).
- `applied` only → green **Applied** pill (existing behaviour).
- otherwise → **Apply** button (existing behaviour) or nothing.

### Files

- `followcv/src/lib/services/follow-up-detector.ts` — created
- `followcv/src/lib/services/follow-up-detector.test.ts` — created (16 tests covering archived guard, no-application guard, status filtering, threshold boundary, custom threshold, AppConfig fallbacks)
- `followcv/src/app/(dashboard)/board/page.tsx` — modified (load threshold + status/updatedAt; project followUpDue per row)
- `followcv/src/components/board/BoardClient.tsx` — modified (`BoardListing.followUpDue`)
- `followcv/src/components/board/BoardClient.test.tsx` — modified (default `followUpDue: false` in test fixtures)
- `followcv/src/components/board/BoardRow.tsx` — modified (Follow up pill)

### Validations

`tsc --noEmit` clean, `eslint` clean, `next build` clean. Suite at 260 tests.

### Constraints honoured

- No transactions, no `*Many` writes (Neon HTTP rule).
- `router.refresh()` pattern preserved — the page is a Server Component and re-renders on every nav/refresh.
- Threshold read from `AppConfig` at request time (not hardcoded; per AC 3).

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story implemented and shipped to main | claude-opus-4-7 |
