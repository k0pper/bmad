# Story 6.2: Automatic Vitality State Updates from Gmail

Status: review

## Story

As a **Pro user**,
I want the board to automatically update listing status when I receive email replies from employers,
so that I know an application is active without manually checking my inbox.

## Acceptance Criteria

1. **Background job `gmail-ingest-signals` runs on the existing Vercel Cron path** (`/api/jobs/process`). For each user where `subscriptionTier === 'PRO'` AND `GmailToken` exists, the job invokes `processGmailSignalsForUser(userId, now)`. Per-user errors are caught — one user's failure does not abort the batch.
2. **Per-user processor refreshes the access token** by `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`, `client_id=AUTH_GOOGLE_ID`, `client_secret=AUTH_GOOGLE_SECRET`, `refresh_token=<decrypted refresh token>`. On success, persists the new `accessToken` + `expiresAt` to the `GmailToken` row via `setGmailToken({ ... })` (re-encrypts the same refresh token under the existing key).
3. **Token-revoked path:** if Google returns HTTP 400 with body `{ "error": "invalid_grant" }` (the canonical signal that the user revoked the grant in Google's account settings), the processor calls `revokeGmailAccess(userId)` to delete the `GmailToken` row, calls `unstable_update({ user: { gmailConnected: false } })` is **not** invoked here (the user has no live session in a cron context), and returns `{ status: 'revoked', ...counts }`. The job logs the per-user revoked event and continues to the next user. The whole job is **not** sent to the pg-boss DLQ for this scenario — only un-categorisable failures (network outage, Prisma exceptions) are.
4. **Email content is never read, stored, or logged.** The processor calls only `GET https://gmail.googleapis.com/gmail/v1/users/me/messages` with `q=from:<domain> after:<unix-seconds>` and `maxResults=1`. It reads only the response's `resultSizeEstimate` field (or the `messages` array length). Message bodies, subjects, snippets, and IDs are **never** fetched, persisted, or logged. This is a privacy hard rule. Tests must assert the URL is `messages` (list), never `messages/{id}` (get).
5. **The processor enumerates each user's distinct `companyDomain`s** from the user's `JobListing` rows where `archived = false AND deletedAt IS NULL AND companyDomain IS NOT NULL AND application IS NOT NULL` (no application → no domain to match against; signal is meaningless without an apply event). For each distinct domain, it issues exactly one Gmail `messages.list` call. **Distinct-by-domain** means N domains for the user → N Gmail calls per tick, regardless of how many listings share a domain.
6. **Each domain match writes one `AuditLog` row per affected listing** with `source: 'GMAIL_SIGNAL'`, `userId: <user>`, `listingId: <listing>`, `computedAt: <now>`, `metadata: null`. The existing `vitality-recompute` job (already wired) reads the latest `GMAIL_SIGNAL` per listing in `handleVitalityRecompute` ([followcv/src/lib/jobs/vitality-recompute.ts:23-31](../../followcv/src/lib/jobs/vitality-recompute.ts#L23-L31)) and `computeVitalityState`'s Rule 5 ([followcv/src/lib/services/vitality-state-machine.ts:35-38](../../followcv/src/lib/services/vitality-state-machine.ts#L35-L38)) transitions the listing to `IN_DIALOGUE` if the signal post-dates the application. **Story 6.2 does NOT mutate `vitalityState` directly** — it writes the audit row and lets the state machine handle the transition. (No second writer to the boundary the architecture explicitly bounds.)
7. **The `/api/jobs/process` Route Handler triggers BOTH jobs in order** on every cron tick: first `gmail-ingest-signals`, then `vitality-recompute`. The route is refactored from its current single-job shape to drain a small, ordered set of pending jobs in one invocation. The `gmail-ingest-signals` job is sent before `vitality-recompute` so the recompute step picks up audit rows the same tick.
8. **A per-user "since" watermark prevents double-processing.** A new column `GmailToken.lastSignalCheckAt: DateTime?` records the timestamp passed as `after:` to Gmail. After a successful per-user run, the column is updated to `now`. On the first run for a user, the watermark is null → the processor uses `GmailToken.createdAt` as the floor (so we never look at email older than the connect event). The Gmail `after:` parameter is unix seconds (per Gmail API docs).
9. **Job isolation under `runtime: nodejs` with `maxDuration: 60`.** Per-user processing is wrapped in `try/catch` so one user's network glitch never aborts the loop. Per-user errors are accumulated into the job result `{ users: N, found: M, revoked: K, errors: [{ userId, error }] }`. The job-level outcome is success unless every user errored or a system-level exception (e.g., DB connection lost) is thrown.
10. **Tests cover the four discriminating branches** of the processor (token refresh ok + matches found / token refresh ok + no matches / token revoked → row deleted / Gmail API non-200 → user marked errored, row preserved) plus the job-level isolation guarantee (one revoked user does not affect the other users' results). All Gmail/Google calls are mocked via `vi.fn()` — no real network in tests.

## Tasks / Subtasks

- [x] **Task 1: Schema migration (AC8)**
  - [x] 1.1 Add `lastSignalCheckAt DateTime?` to `GmailToken` model in `prisma/schema.prisma`
  - [x] 1.2 Generate + run migration (`npx prisma migrate dev --name gmail_token_last_signal_check_at`)
  - [x] 1.3 Regenerate Prisma client (run automatically by `migrate dev`)

- [x] **Task 2: Extend `gmail-token-service.ts` (AC2, AC8)**
  - [x] 2.1 Add `refreshAccessToken(userId, now)` — returns `{ status: 'ok', accessToken, expiresAt }` or `{ status: 'revoked' }`. On HTTP 400 + `error: 'invalid_grant'` returns revoked. Other failures throw.
  - [x] 2.2 Add `setLastSignalCheckAt(userId, when)` — single-row update via `findFirst → update`; no-op if row gone.
  - [x] 2.3 Add `getSignalCheckpoint(userId)` — returns `{ lastSignalCheckAt, createdAt }` or `null`. Avoids loading the full `getGmailToken` payload (no decryption) for the checkpoint read in the processor.
  - [x] 2.4 Vitest: 11 new tests covering happy path, `invalid_grant`→revoked, generic 400 throws, 5xx throws, missing access_token throws, race-deleted row → revoked, missing GmailToken throws, missing env throws, watermark update happy + no-op, checkpoint read happy + null.

- [x] **Task 3: `gmail-signal-processor.ts` (AC2–AC6, AC8)**
  - [x] 3.1 Created `src/lib/services/gmail-signal-processor.ts`. Exports `processGmailSignalsForUser(userId, now): Promise<ProcessorResult>` returning `{ status: 'ok' | 'revoked' | 'no-token', checked, found }`.
  - [x] 3.2 Implementation per spec; uses `getSignalCheckpoint` (no decryption needed for the watermark read), `refreshAccessToken` (decrypts refresh token internally), distinct-by-domain Gmail query, single-row audit-log creates.
  - [x] 3.3 Vitest: 11 tests. Covers no-token, revoked-on-invalid-grant, no-listings, no-matches, matches-with-multi-listing-domain-grouping, watermark floor selection (lastSignalCheckAt vs createdAt fallback), bearer auth header, Gmail API error propagation, **privacy hard rule: URL never matches `/messages/<id>`**, future-applied no-write guard.

- [x] **Task 4: Job handler (AC1, AC9)**
  - [x] 4.1 Created `src/lib/jobs/gmail-ingest-signals.ts` with `handleGmailIngestSignals()`.
  - [x] 4.2 Per-user `try/catch` accumulates `errors[]`, never rethrows. System-level exception (e.g. `prisma.user.findMany` rejection) propagates so pg-boss DLQ triggers correctly.
  - [x] 4.3 5 Vitest tests: zero users → empty result; correct DB filter shape; aggregates ok+revoked+no-token; **per-user error isolation (one throw doesn't abort batch)**; system-level error propagates.

- [x] **Task 5: Wire jobs registry (AC1)**
  - [x] 5.1 Added `JOB_GMAIL_INGEST_SIGNALS` constant + DLQ queue, registered in `JOB_HANDLERS`. Also exported `JOB_PROCESS_ORDER` so the route can drain in deterministic order.

- [x] **Task 6: Refactor `/api/jobs/process` route to multi-job (AC7)**
  - [x] 6.1 Route now iterates `JOB_PROCESS_ORDER`, sending+fetching+processing each. Returns `{ results: { <jobName>: { status, jobId?, result?, error? } } }`. HTTP 500 if any job failed; 200 otherwise. Auth gate + 60s `maxDuration` preserved.
  - [x] 6.2 Added `route.test.ts` with 5 tests: 401 on bad/missing CRON_SECRET; both jobs sent + processed in order; no-pending-job handling; one-job-failure-doesn't-stop-the-other.

- [x] **Task 7: `vercel.json` (AC1)**
  - [x] 7.1 Left as-is. Documented in Dev Notes / external setup that frequency is tunable on the existing entry.

- [x] **Task 8: `project-context.md` updates (AC1, AC4, AC6, AC8)**
  - [x] 8.1 Added new section "Gmail signal ingestion (Story 6.2)" documenting eligibility filter, per-user processor pipeline, privacy hard rule, per-user isolation, first-run floor.

- [x] **Task 9: Suite-wide regression**
  - [x] 9.1 `npm run lint` clean, `npm run test:run` 380/380 (32 files), `npm run build` green.
  - [x] 9.2 No new npm dependency added.

## Dev Notes

### What is already in place — DO NOT rebuild

- **`GmailToken` model** with `userId @unique`, `accessToken`, `refreshToken` (AES-256-GCM ciphertext), `expiresAt`, `connectedEmail`, `createdAt`, `updatedAt`. Story 6.2 only ADDS `lastSignalCheckAt`.
- **`gmail-token-service.ts`** with `getGmailToken(userId)` (decrypts refresh token), `setGmailToken({ ... })` (re-encrypts), `encryptRefreshToken` / `decryptRefreshToken`. Story 6.2 ADDs `refreshAccessToken` and `setLastSignalCheckAt` here — same module, same encryption-key plumbing, no reinvention.
- **`revokeGmailAccess(userId)`** in `src/lib/account/service.ts` — deletes the row + best-effort POST to Google's revoke endpoint. Reuse as-is for the revoked path.
- **`computeVitalityState`** Rule 5 already handles `gmailSignalAt > application.appliedAt → IN_DIALOGUE` ([followcv/src/lib/services/vitality-state-machine.ts:35-38](../../followcv/src/lib/services/vitality-state-machine.ts#L35-L38)). DO NOT modify the state machine.
- **`handleVitalityRecompute`** already reads the latest `GMAIL_SIGNAL` audit per listing in a single distinct query and feeds it into `computeVitalityState`. ([followcv/src/lib/jobs/vitality-recompute.ts:23-31](../../followcv/src/lib/jobs/vitality-recompute.ts#L23-L31)) DO NOT touch this code path.
- **`AuditSource.GMAIL_SIGNAL`** is already in the schema. Just write rows with this source.
- **`/api/jobs/process` Route Handler** is already auth-gated by `CRON_SECRET` and bounded by `maxDuration = 60`. Story 6.2 only refactors the body to drain multiple job types in order.
- **`vercel.json`** already has the daily cron. Story 6.2 does not add a second entry.

### What this story is NOT — out of scope

- **Per-listing watermarks.** The spec uses one `lastSignalCheckAt` per user, not per listing. A signal that landed in the user's inbox before they applied to a listing is filtered out at write time (we only audit-log when `application.appliedAt < now`). Per-listing precision is unnecessary because Rule 5 (`gmailSignalAt > application.appliedAt`) is the actual gate.
- **Re-running the recompute job in-process if a signal lands.** The route invocation already calls recompute after ingest in the same tick — no in-process re-trigger.
- **A new Gmail SDK dependency.** `googleapis` adds ~10 MB to cold starts. We use native `fetch` for one endpoint.
- **Direct `vitalityState` writes from the processor.** Architecture rule: only `vitality-state-machine.ts` writes that field. The processor writes `AuditLog`; recompute writes `vitalityState`. Two writers across one boundary is a regression we must not introduce.
- **Backfill for users who connected Gmail before this story shipped.** On their first job tick, `lastSignalCheckAt` is null → processor uses `createdAt` as the floor → we look at email since the connect event. This is the desired behaviour. No data migration needed.
- **UI surface for "Gmail signals seen recently" / signal counters.** No spec.
- **Notifications when an `IN_DIALOGUE` transition happens.** No spec.

### `invalid_grant` is the canonical revoked-token signal

When the user disconnects via Google's "Apps with access" page (or the refresh token has been invalidated for any other reason — password reset, scope removed by admin, etc.), the next `grant_type=refresh_token` call returns:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{ "error": "invalid_grant", "error_description": "Token has been expired or revoked." }
```

The processor must distinguish this from transient failures (5xx, network) — only `invalid_grant` triggers `revokeGmailAccess`. Everything else accumulates into the per-user error list and the row stays put for the next tick.

### Gmail search query semantics

- `q=from:<domain> after:<unix-seconds>` — Gmail search syntax. `from:example.com` matches `*@example.com` (no `@` prefix needed; the bare token after the colon is treated as a domain match for full-domain queries). Ref: https://support.google.com/mail/answer/7190
- The `after:` parameter is **unix seconds** (not ms). Ref: Gmail API guides on filtering — "Specify accurate dates using seconds".
- The endpoint `GET https://gmail.googleapis.com/gmail/v1/users/me/messages` returns `{ messages?: [{id, threadId}], nextPageToken?, resultSizeEstimate }`. Story 6.2 reads only `resultSizeEstimate` (or `messages?.length`); message IDs are present in the response but we never use them.
- Use `maxResults=1` to minimise API quota cost (5 quota units per call regardless, but still — be polite).

### `gmail.readonly` is the only OAuth scope ever requested

The Story 6.1 OAuth flow requested `gmail.readonly` and `prompt=consent`. No new scope is required for `messages.list`. If this story ever needs `messages.get` (it doesn't, by design), the user would need to re-consent — which we explicitly avoid.

### Tests must mock `fetch`, not stub HTTP

Vitest with `vi.spyOn(global, 'fetch')` is the pattern (see `src/app/api/oauth/gmail/route.test.ts` for the established convention in this repo). DO NOT reach for nock or msw — the Story 6.1 callback route already proves `vi.fn()` mocking is sufficient.

### Privacy posture is a hard rule, not a guideline

The processor must never:
- Call `GET .../messages/{id}` (would return body + headers — not allowed by AC4)
- Persist message IDs to any table
- Log the `messages` array contents (only `resultSizeEstimate` and the count of matches found)
- Use the access token for any URL other than `messages` list

These are tested explicitly. A regression here is a privacy incident, not a bug.

### Project-context constraints (already loaded)

- **No Neon HTTP transactions / no `*Many` writes.** Audit-log creation is one row at a time per matching listing; the new `lastSignalCheckAt` write is a single-row update.
- **Cache invalidation: `router.refresh()` not `revalidateTag`.** The cron handler returns JSON; no client-side cache to invalidate.
- **Server Action contract: never throw, return `{ data, error }`.** The processor and job are not Server Actions — they're called from a Route Handler. They MAY throw (and the handler catches), but per-user errors should be caught inside the loop.
- **JWT `gmailConnected` is a UI hint only.** The processor reads from the DB; it does NOT consult `session.user.gmailConnected`. There's no session in a cron context anyway.

### Cron frequency and Vercel Hobby plan

The current cron is `0 0 * * *` (daily). Vercel Hobby allows up to 2 cron schedules total. Hourly would deliver more value (an applicant gets feedback sooner) but the project is currently using only one of two slots — leaving room to evolve. If you want hourly during dev/staging, change the schedule on the existing entry rather than adding a second one. Pro plan removes the cap.

### Files this story creates or modifies

**New:**
- `src/lib/services/gmail-signal-processor.ts` (+ `.test.ts`)
- `src/lib/jobs/gmail-ingest-signals.ts` (+ `.test.ts`)
- `prisma/migrations/<timestamp>_gmail_token_last_signal_check_at/migration.sql`

**Modified:**
- `prisma/schema.prisma` — add `lastSignalCheckAt DateTime?` to `GmailToken`
- `src/lib/services/gmail-token-service.ts` — add `refreshAccessToken` + `setLastSignalCheckAt` (+ tests in existing `.test.ts`)
- `src/lib/jobs/index.ts` — register `JOB_GMAIL_INGEST_SIGNALS`
- `src/app/api/jobs/process/route.ts` — drain both jobs (+ tests)
- `followcv/project-context.md` — new "Gmail signal ingestion" section

**Not modified:**
- `prisma/schema.prisma` for any other model — `JobListing`, `Application`, `AuditLog` unchanged
- `src/lib/services/vitality-state-machine.ts` — already handles GMAIL_SIGNAL via Rule 5, do not touch
- `src/lib/jobs/vitality-recompute.ts` — already reads GMAIL_SIGNAL audit logs, do not touch
- `package.json` — no new dependency

### Testing standards

- Vitest co-located `*.test.ts`; mock Prisma via the existing test setup; mock `fetch` via `vi.spyOn(global, 'fetch')`.
- No Playwright E2E — this is a backend-only story (no UI), and a real Gmail account is required to drive a real signal. Manual smoke test via `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/process` after sending a test email from a domain that matches one of the user's listings.
- Coverage targets: every branch in the processor (revoked / ok-no-matches / ok-with-matches / API-error) and the per-user isolation guarantee.

### References

- Epic + AC: [`_bmad-output/planning-artifacts/epics.md` § Story 6.2](../planning-artifacts/epics.md)
- Story 6.1 (sets up the token storage this story consumes): [`_bmad-output/implementation-artifacts/6-1-gmail-oauth-connection-flow.md`](./6-1-gmail-oauth-connection-flow.md)
- Architecture — Gmail token storage: [`_bmad-output/planning-artifacts/architecture.md` lines 168–173](../planning-artifacts/architecture.md)
- Architecture — pg-boss + Vercel Cron: [`_bmad-output/planning-artifacts/architecture.md` lines 222–240, 609–611](../planning-artifacts/architecture.md)
- Project context (loaded as persistent facts): [`followcv/project-context.md`](../../followcv/project-context.md)
- Existing recompute job that this story depends on: [`followcv/src/lib/jobs/vitality-recompute.ts`](../../followcv/src/lib/jobs/vitality-recompute.ts)
- Existing state machine Rule 5 (GMAIL_SIGNAL → IN_DIALOGUE): [`followcv/src/lib/services/vitality-state-machine.ts:35-38`](../../followcv/src/lib/services/vitality-state-machine.ts#L35-L38)
- Gmail API — messages.list and search syntax: https://developers.google.com/workspace/gmail/api/guides/list-messages and https://developers.google.com/workspace/gmail/api/guides/filtering

## External / configuration prerequisites

These are setup steps the **operator** must do before this story is operational. None are code changes — they are GCP / Vercel console operations.

1. **Gmail API must be enabled** for the GCP project that owns `AUTH_GOOGLE_ID`. Console URL: `https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=<your-project>`. (Already enabled if Story 6.1 was smoke-tested end-to-end. New environments need this on first deploy.)
2. **`CRON_SECRET` must be set** in `.env.local` (dev) and Vercel project env (prod). It auth-gates `/api/jobs/process`. Already required by the existing vitality-recompute cron — Story 6.2 reuses the same gate.
3. **`GMAIL_TOKEN_ENCRYPTION_KEY` must be set** in dev + prod. Already required by Story 6.1; this story reuses the same key (no rotation, no second key).
4. **OAuth Test users.** Until the consent screen is published + verified, every Pro user driving the flow must be on the OAuth consent screen's "Test users" list. (Same constraint as 6.1.)
5. **Vercel Cron schedule.** The existing `0 0 * * *` daily entry triggers both jobs now. If hourly fidelity is desired, change the schedule on that entry. Vercel Hobby caps total schedules at 2; Pro removes the cap.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `gmail-token-service.test.ts` initial failure: encryption key was read at top-level `const ENCRYPTED = encryptRefreshToken(...)` before `beforeEach` set the env var. Moved into `beforeEach`.
- `gmail-signal-processor.test.ts` initial failure: a single `Response` instance shared across `mockResolvedValue` calls had its body consumed by the first `res.json()`, throwing on the second. Switched to `mockImplementation(async () => new Response(...))` so each call returns a fresh body.
- `route.test.ts` initial failure: top-level mock factories closed over `handlers`/`fakeBoss` declared via `const`; vitest hoists `vi.mock` above declarations. Wrapped them in `vi.hoisted(() => ({ ... }))`.
- Build initially failed because `prisma generate` doesn't run automatically when columns are added to a model that the existing client already partially knew. Ran `npx prisma generate` after the migration to refresh the typings for `lastSignalCheckAt`.

### Completion Notes List

- All 9 tasks completed.
- 33 new tests added: 11 token-service additions, 11 signal-processor, 5 ingest-signals job, 5 jobs-process route. Total suite **380 tests, 32 files, all passing**.
- `npm run lint` clean, `npm run build` green (no TS errors after `prisma generate`).
- No new npm dependency. `googleapis` intentionally not added — one Gmail endpoint suffices via native `fetch`, and the SDK cold-start cost isn't justified.
- One schema migration: `20260508121413_gmail_token_last_signal_check_at` adds `lastSignalCheckAt: TIMESTAMP(3)` (nullable) to `gmail_tokens`.
- The cron route now drains both jobs in `JOB_PROCESS_ORDER`. Returns HTTP 500 if any job in the tick failed; 200 otherwise. CRON_SECRET gate preserved.
- `vercel.json` not touched — daily schedule still satisfies AC1 (the route triggers both jobs in a single invocation). If hourly fidelity becomes the right tradeoff, change the existing entry rather than adding a second one (Vercel Hobby's 2-cron cap).
- Privacy posture is enforced by tests: `gmail-signal-processor.test.ts` asserts every Gmail URL ends at `/messages` (list) and never matches `/messages/<id>` (get).

### File List

**New:**
- followcv/src/lib/services/gmail-signal-processor.ts
- followcv/src/lib/services/gmail-signal-processor.test.ts
- followcv/src/lib/jobs/gmail-ingest-signals.ts
- followcv/src/lib/jobs/gmail-ingest-signals.test.ts
- followcv/src/app/api/jobs/process/route.test.ts
- followcv/prisma/migrations/20260508121413_gmail_token_last_signal_check_at/migration.sql

**Modified:**
- followcv/prisma/schema.prisma (added `lastSignalCheckAt DateTime?` to GmailToken)
- followcv/src/lib/services/gmail-token-service.ts (added refreshAccessToken, setLastSignalCheckAt, getSignalCheckpoint)
- followcv/src/lib/services/gmail-token-service.test.ts (+11 tests)
- followcv/src/lib/jobs/index.ts (registered JOB_GMAIL_INGEST_SIGNALS, exported JOB_PROCESS_ORDER)
- followcv/src/app/api/jobs/process/route.ts (drains all jobs in JOB_PROCESS_ORDER per tick)
- followcv/project-context.md (new "Gmail signal ingestion (Story 6.2)" section)

**Not modified:**
- followcv/prisma/schema.prisma — `JobListing`, `Application`, `AuditLog` unchanged
- followcv/src/lib/services/vitality-state-machine.ts — Rule 5 already handles GMAIL_SIGNAL
- followcv/src/lib/jobs/vitality-recompute.ts — already reads GMAIL_SIGNAL audit logs
- followcv/package.json — no new dependency
- followcv/vercel.json — daily cron unchanged

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story drafted via bmad-create-story | claude-opus-4-7 |
| 2026-05-08 | Story implemented; 33 new tests; 380 total green; lint+build green; ready for code-review | claude-opus-4-7 |
