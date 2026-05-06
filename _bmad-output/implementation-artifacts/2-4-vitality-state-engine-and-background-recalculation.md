# Story 2.4: Vitality State Engine & Background Recalculation

Status: review

## Story

As a **user**,
I want the board to automatically update listing vitality states without my input,
So that I always know which listings need attention when I return.

## Acceptance Criteria

1. Vitality states transition according to the state machine truth table: `HOT` (posted ≤7 days, no application), `ACTIVE` (applied, awaiting response), `COOLING` (posted 8–21 days), `COLD` (posted >21 days), `DEADLINE` (closing date within 48h), `GHOSTING` (applied >14 days, no response), `IN_DIALOGUE` (email reply detected or manual status), `CLOSED` (listing removed or manually closed)
2. pg-boss is initialized with the Neon connection and all job types registered in `src/lib/jobs/index.ts` with 3× retry and exponential backoff
3. A Vercel Cron schedule in `vercel.json` calls `POST /api/jobs/process` at the configured interval to trigger pg-boss polling
4. Failed recalculation jobs after 3 retries are moved to the dead-letter queue (pg-boss `failed` state)
5. `JobListing.lastComputedAt` is updated on every recalculation (both changed and unchanged states)
6. Direct Prisma writes to `vitalityState` outside `vitality-state-machine.ts` are never introduced in this story

## Tasks / Subtasks

- [x] Task 1 — Install pg-boss and confirm DB connectivity (AC: 2)
  - [x] Install `pg-boss` package
  - [x] Verify `DATABASE_URL` works for pg-boss (standard pg connection)

- [x] Task 2 — Job infrastructure: `src/lib/jobs/index.ts` (AC: 2, 4)
  - [x] Export job name constants (`JOB_VITALITY_RECOMPUTE`)
  - [x] Export `createBoss()` factory — creates pg-boss instance with `DATABASE_URL`, retryLimit: 3, retryBackoff: true
  - [x] Export `ensureQueues(boss)` — creates queues with retry config + DLQ; `JOB_HANDLERS` map for all job types

- [x] Task 3 — Vitality recompute job handler: `src/lib/jobs/vitality-recompute.ts` (AC: 1, 5)
  - [x] Fetch all non-archived, non-deleted listings with `application`, latest `GMAIL_SIGNAL` audit log
  - [x] For each listing: call `computeVitalityState()`, compare to stored state
  - [x] Update `vitalityState` + `stateChangedAt` (on change) + `lastComputedAt` (always) via Prisma
  - [x] Write `AuditLog` entry (`SYSTEM_RECOMPUTE`) only when state actually changes
  - [x] Return summary: `{ processed, changed, errors }`

- [x] Task 4 — Cron API route: `src/app/api/jobs/process/route.ts` (AC: 2, 3, 4)
  - [x] Verify `Authorization: Bearer {CRON_SECRET}` header; return 401 if missing/invalid
  - [x] Create and start pg-boss; register workers
  - [x] Send a `vitality-recompute` job (stately policy: skip if already queued/active)
  - [x] Manual fetch pattern: fetch pending job, execute handler, complete or fail
  - [x] Return JSON summary; stop boss before returning (finally block)

- [x] Task 5 — Vercel Cron config: `vercel.json` (AC: 3)
  - [x] Create `vercel.json` with cron calling `/api/jobs/process` at `0 0 * * *` (daily)

- [x] Task 6 — Tests: `src/lib/jobs/vitality-recompute.test.ts` (AC: 1, 5)
  - [x] Mock Prisma; test that changed states are updated with `stateChangedAt`
  - [x] Test that unchanged states still get `lastComputedAt` updated
  - [x] Test that archived listings are skipped (filtered at query level)
  - [x] Test that audit log is written only on state change
  - [x] Test error handling — errors counted, processing continues
  - [x] Test gmail signal passed correctly to computeVitalityState
  - [x] Test multiple listings with mixed changed/unchanged counts

## Dev Notes

### pg-boss setup
- Version: pg-boss v10.x
- Uses standard `node-postgres` (pg) driver — `DATABASE_URL` works directly
- Neon provides a PostgreSQL-compatible connection string; pg-boss creates its own schema tables in the DB
- pg-boss should be instantiated fresh per serverless invocation (no global singleton in production)
- `retryLimit: 3`, `retryBackoff: true` → exponential backoff on retry
- Failed jobs after 3 retries remain in `pgboss.job` with `state = 'failed'` (this is the DLQ)

### Job handler pattern
```typescript
// src/lib/jobs/vitality-recompute.ts
import { prisma } from "@/lib/db"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"

export async function handleVitalityRecompute() {
  const now = new Date()
  const listings = await prisma.jobListing.findMany({
    where: { archived: false, deletedAt: null },
    include: { application: true },
  })
  // For each listing: get gmailSignalAt from AuditLog, compute, update
}
```

### Gmail signal lookup
- Lookup latest `GMAIL_SIGNAL` AuditLog per listing in a single query (not N+1):
  ```
  prisma.auditLog.findMany({
    where: { source: 'GMAIL_SIGNAL', listingId: { in: listingIds } },
    orderBy: { computedAt: 'desc' },
    distinct: ['listingId']
  })
  ```

### Cron endpoint
- Vercel provides `Authorization: Bearer {CRON_SECRET}` on cron invocations
- `CRON_SECRET` env var set in Vercel project settings and `.env.local`
- Route must be `POST` (Vercel Cron uses POST)
- Set `export const maxDuration = 60` for Vercel function timeout

### Existing patterns
- `computeVitalityState` in `src/lib/services/vitality-state-machine.ts`
- `VitalityInputs` type in same file
- `AuditSource.SYSTEM_RECOMPUTE` enum value in schema
- `prisma` singleton from `src/lib/db/index.ts`
- `ApplicationStatus` from `@/generated/prisma/client`
- Test pattern: see `src/lib/services/vitality-state-machine.test.ts` for vitest style

## Dev Agent Record

### File List
- `_bmad-output/implementation-artifacts/2-4-vitality-state-engine-and-background-recalculation.md`
- `followcv/src/lib/jobs/index.ts` — created
- `followcv/src/lib/jobs/vitality-recompute.ts` — created
- `followcv/src/lib/jobs/vitality-recompute.test.ts` — created
- `followcv/src/app/api/jobs/process/route.ts` — created
- `followcv/vercel.json` — created
- `followcv/package.json` — `pg-boss@^12.18.2` added

### Change Log
- 2026-05-06: Story implemented — pg-boss infrastructure, vitality recompute job, cron API route, Vercel cron config, 9 tests

### Completion Notes
- pg-boss initialized via `createBoss()` factory using `DATABASE_URL`; queues created with `policy: 'stately'` so duplicate cron invocations don't stack up jobs
- `ensureQueues()` creates the DLQ queue first, then the main queue with `deadLetter` pointing to it (3× retry, exponential backoff)
- Vitality recompute fetches all active listings in two queries (listings + gmail signals), processes in a loop, updates `lastComputedAt` always and `stateChangedAt` only on state change
- Cron endpoint uses manual fetch pattern (serverless-safe) — sends a job, fetches it, runs handler, completes/fails; boss stopped in `finally` regardless
- `maxDuration = 60` set on the route for Vercel function timeout headroom
- `CRON_SECRET` env var required; Vercel sets the `Authorization: Bearer` header automatically on cron invocations
