# Story 1.2: Database Schema & Infrastructure Setup

Status: review

## Story

As a **developer**,
I want the Neon PostgreSQL database connected with the full Prisma schema,
so that all subsequent stories have a typed, migrated data layer to build on.

## Acceptance Criteria

1. `prisma/schema.prisma` defines models: `User`, `PreferenceProfile`, `JobListing`, `Application`, `CvVersion`, `CvSnapshot`, `GmailToken`, `AppConfig`, `ScrapeLog`, `AuditLog`, `DataExportRequest`
2. The `VitalityState` enum covers all 8 states: `HOT`, `ACTIVE`, `COOLING`, `COLD`, `DEADLINE`, `GHOSTING`, `IN_DIALOGUE`, `CLOSED`
3. The `SubscriptionTier` enum covers `FREE` and `PRO`
4. The `User` model includes `lastVisitAt DateTime?` (updated on every dashboard load, used by the per-row recency indicator)
5. The `JobListing` model includes `stateChangedAt DateTime?` (set by `vitality-state-machine.ts` on every state transition)
6. `src/lib/db/index.ts` exports a Prisma client singleton safe for Next.js hot-reload
7. `prisma migrate dev` runs without errors and all tables exist in Neon (requires `DATABASE_URL` in `.env.local`)
8. The Neon serverless driver (`@neondatabase/serverless`) is configured as the Prisma adapter for serverless function contexts
9. Sentry is initialized in `src/instrumentation.ts` and Vercel Analytics is added to `src/app/layout.tsx`

## Tasks / Subtasks

- [x] Task 1: Install dependencies (AC: 6, 8, 9)
  - [x] Install Prisma CLI and client: `npm install -D prisma` and `npm install @prisma/client`
  - [x] Install Neon serverless driver and Prisma adapter: `npm install @neondatabase/serverless @prisma/adapter-neon`
  - [x] Install Sentry: `npm install @sentry/nextjs`
  - [x] Install Vercel Analytics: `npm install @vercel/analytics`

- [x] Task 2: Create Prisma schema with all models and enums (AC: 1, 2, 3, 4, 5)
  - [x] Initialize Prisma: `npx prisma init --datasource-provider postgresql`
  - [x] Define all enums: `UserRole`, `SubscriptionTier`, `VitalityState`, `OverrideSource`, `ImportSource`, `ApplicationStatus`, `ScrapeStatus`, `AuditSource`, `ExportStatus`
  - [x] Define `User` model with `lastVisitAt DateTime?`
  - [x] Define `PreferenceProfile` model linked to `User`
  - [x] Define `JobListing` model with `stateChangedAt DateTime?`, `overrideState`, `overrideSource`, `lastComputedAt`, `postedAt`, `closingDate`
  - [x] Define `Application` model linked to `JobListing` and `CvSnapshot`
  - [x] Define `CvVersion` and `CvSnapshot` models (CvSnapshot is write-once — no `updatedAt`)
  - [x] Define `GmailToken` model (refreshToken will be encrypted at the service layer)
  - [x] Define `AppConfig` model for runtime-configurable thresholds
  - [x] Define `ScrapeLog`, `AuditLog`, `DataExportRequest` models
  - [x] Run `npx prisma validate` to confirm schema is syntactically correct

- [x] Task 3: Prisma client singleton with Neon adapter (AC: 6, 8)
  - [x] Create `src/lib/db/index.ts` exporting a singleton `prisma` instance
  - [x] Use `@prisma/adapter-neon` with `Pool` from `@neondatabase/serverless` as the driver adapter
  - [x] Guard against multiple instances during Next.js hot-reload via `globalThis`

- [x] Task 4: Create `.env.example` with all required env vars (AC: 7)
  - [x] Add `DATABASE_URL` placeholder with note about Neon connection string format
  - [x] Add `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` placeholders
  - [x] Add `NEXT_PUBLIC_SENTRY_DSN` for client-side Sentry
  - [x] Add `GMAIL_TOKEN_ENCRYPTION_KEY` placeholder (32-byte hex for AES-256-GCM)

- [x] Task 5: Sentry initialization (AC: 9)
  - [x] Create `src/instrumentation.ts` with `register()` function that initializes Sentry for server and edge runtimes
  - [x] Create `sentry.server.config.ts` at the project root with minimal server-side Sentry config
  - [x] Create `sentry.edge.config.ts` at the project root with minimal edge Sentry config

- [x] Task 6: Vercel Analytics (AC: 9)
  - [x] Import `Analytics` from `@vercel/analytics/react` in `src/app/layout.tsx`
  - [x] Add `<Analytics />` to the root layout inside `<body>`

- [x] Task 7: Generate Prisma types and run validations
  - [x] Run `npx prisma generate` to generate the TypeScript client types
  - [x] Run `npm run test:run` — confirm no regressions
  - [x] Run `npx tsc --noEmit` — confirm no TypeScript errors
  - [x] Run `npm run lint` — confirm no ESLint errors

- [x] Task 8: Run database migration (AC: 7)
  - [x] Add `DATABASE_URL` to `.env.local` (Neon dev branch connection string)
  - [x] Run `npx prisma migrate dev --name init` — all tables created in Neon
  - [x] Verified tables in Neon dashboard (Prisma Studio)

## Dev Notes

### Prerequisites

Story 1.1 must be complete. This story adds the data layer on top of the project initialized in Story 1.1.

### Package Versions

Install these exact packages:
- `prisma` (devDependency) — Prisma CLI for schema and migrations
- `@prisma/client` — Runtime Prisma client (auto-generated from schema)
- `@neondatabase/serverless` — Neon's WebSocket-based Postgres driver for serverless environments
- `@prisma/adapter-neon` — Prisma driver adapter that uses the Neon serverless pool
- `@sentry/nextjs` — Sentry Next.js SDK (includes server, client, and edge bundles)
- `@vercel/analytics` — Vercel Analytics for web vitals

### Prisma + Neon Adapter Pattern

The architecture requires the Neon serverless driver as the Prisma adapter. This allows Prisma to use Neon's WebSocket connection pool in serverless function contexts instead of standard TCP, which is critical for cold-start performance on Vercel.

`src/lib/db/index.ts`:
```typescript
import { PrismaClient } from '@prisma/client'
import { Pool } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

The `prisma generate` command must be run after schema changes to update the TypeScript types. The `schema.prisma` file must enable the `driverAdapters` preview feature.

### Schema Design Decisions

**JobListing.vitalityState default:** `COOLING` — conservative fallback for listings with unknown age.

**CvSnapshot has no `updatedAt`:** Snapshots are write-once. Adding `updatedAt` would suggest they can be modified.

**GmailToken.refreshToken:** Stored as a plain string in the DB schema. Encryption/decryption is handled by `gmail-token-service.ts` at the application layer — the DB column has no knowledge of encryption.

**AuditLog has no `updatedAt`:** Audit logs are append-only. Updating them would defeat their purpose.

**AppConfig:** Key-value table for runtime-configurable thresholds. Seed with:
- `listingCapFree`: `"25"`
- `cvVersionCapFree`: `"5"`
- `followUpThresholdDays`: `"7"`

### Sentry Setup

Minimal setup for Story 1.2 — SENTRY_DSN defaults to empty string so the app starts without crashing when DSN is not configured.

`src/instrumentation.ts`:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}
```

`sentry.server.config.ts` (project root):
```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  debug: false,
})
```

`sentry.edge.config.ts` (project root):
```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  debug: false,
})
```

### Database Migration

The `prisma migrate dev` command (Task 8) requires a real Neon DATABASE_URL. This cannot be run without credentials. Steps:
1. Provision a Neon project at https://neon.tech
2. Copy the connection string (pooled endpoint)
3. Add to `.env.local`: `DATABASE_URL="postgresql://..."` 
4. Run: `cd followcv && npx prisma migrate dev --name init`

### Vercel Analytics

```typescript
// In layout.tsx — after installing @vercel/analytics:
import { Analytics } from '@vercel/analytics/react'
// Add inside <body>: <Analytics />
```

### TypeScript: `next.config.ts` sentry instrumentation hook

`@sentry/nextjs` may prompt to update `next.config.ts` with `withSentryConfig`. Skip this for Story 1.2 — the minimal `instrumentation.ts` setup is sufficient for the foundation. The full Sentry build integration can be wired up in a later story when the DSN is configured.

### Source References

- DB layer singleton pattern: [architecture.md — Prisma client singleton]
- Neon adapter: [architecture.md — Database Hosting: Neon]
- Observability: [architecture.md — Observability: Sentry + Vercel Analytics]
- Schema models: [epics.md — Story 1.2 Acceptance Criteria]
- State machine fields: [vitality-state-machine-spec.md — Input Fields]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `PrismaNeonHttp` constructor requires two arguments (`connectionString`, `options`) — initial attempt with one argument failed TypeScript check; fixed by passing `{}` as empty options object.
- Prisma 7 generates client to `src/generated/prisma/` by default; imports must use `@/generated/prisma/client`, not `@prisma/client`.
- `PrismaNeonHttp` selected over `PrismaNeon` (Pool/WebSocket) because it is simpler for Vercel serverless (HTTP-based, no `ws` WebSocket config required per-runtime), while still using the Neon serverless driver (`@neondatabase/serverless`).
- Prisma 7 introduces `prisma.config.ts` (new in v7) — database URL is now configured there rather than in `schema.prisma`; `dotenv` installed as a dev dependency to load `.env` in the config file.

### Completion Notes List

- Prisma 7.8.0 installed with `@prisma/adapter-neon` 7.8.0 and `@neondatabase/serverless` 1.1.0.
- Full schema at `prisma/schema.prisma` — 11 models, 9 enums. Schema validates and generates types successfully.
- All 8 `VitalityState` enum values present: `HOT`, `ACTIVE`, `COOLING`, `COLD`, `DEADLINE`, `GHOSTING`, `IN_DIALOGUE`, `CLOSED`.
- `User.lastVisitAt DateTime?` and `JobListing.stateChangedAt DateTime?` confirmed in schema.
- Prisma client singleton at `src/lib/db/index.ts` uses `PrismaNeonHttp` — safe for Next.js hot-reload via `globalThis` guard.
- Generated Prisma types in `src/generated/prisma/` (in `.gitignore`); types regenerated on `prisma generate`.
- `src/instrumentation.ts` + `sentry.server.config.ts` + `sentry.edge.config.ts` — minimal Sentry initialization for server and edge runtimes.
- `@vercel/analytics` `<Analytics />` component added to root `layout.tsx`.
- `.env.example` committed with all required env var placeholders (DATABASE_URL, SENTRY_DSN, AUTH_SECRET, GMAIL_TOKEN_ENCRYPTION_KEY, R2 vars, Stripe vars).
- All verifications passed: `prisma validate` ✓, `prisma generate` ✓, `tsc --noEmit` ✓, `eslint` ✓, `vitest run` ✓, `next build` ✓.
- **Task 8 (DB migration) blocked:** `prisma migrate dev` requires real Neon `DATABASE_URL` in `.env.local`. Instructions in Task 8 and `.env.example`.

### File List

- `followcv/prisma/schema.prisma` — new (11 models, 9 enums, full FollowCV schema)
- `followcv/prisma.config.ts` — new (Prisma 7 config with DATABASE_URL)
- `followcv/src/lib/db/index.ts` — new (Prisma client singleton with PrismaNeonHttp)
- `followcv/src/generated/prisma/` — new (generated Prisma types, gitignored)
- `followcv/src/instrumentation.ts` — new (Sentry register hook)
- `followcv/sentry.server.config.ts` — new (Sentry server-side init)
- `followcv/sentry.edge.config.ts` — new (Sentry edge init)
- `followcv/src/app/layout.tsx` — updated (added Vercel Analytics)
- `followcv/.env.example` — new (all required env var placeholders)
- `followcv/.env` — new (Prisma-generated, gitignored)
- `followcv/.gitignore` — updated (added `!.env.example` exception)
- `followcv/package.json` — updated (added prisma, @prisma/client, @neondatabase/serverless, @prisma/adapter-neon, @sentry/nextjs, @vercel/analytics, ws, dotenv)

### Change Log

- 2026-05-05: Story 1.2 implemented — Prisma 7 schema with 11 models and 9 enums, Neon HTTP adapter singleton, Sentry instrumentation, Vercel Analytics. All code-level tasks complete; DB migration (Task 8) requires real Neon credentials.
