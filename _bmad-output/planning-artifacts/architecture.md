---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-05-05'
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
workflowType: 'architecture'
project_name: 'FollowCV'
user_name: 'Alex'
date: '2026-05-05'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
56 FRs across 8 domains: User Account Management (FR1–9), Job Import (FR10–15), Living Board (FR16–21), Application Tracking (FR22–29), CV Management (FR30–39), Health Score (FR40–43), Subscription (FR44–48), and Admin (FR49–56).

Architectural weight is unevenly distributed. The Vitality State Machine (FR16–21) and CV snapshot-on-apply (FR30–39) carry the majority of implementation complexity and risk. The Health Score engine (FR40–43) is deterministic by design but must compute consistently across both async and synchronous paths. Gmail OAuth (FR22–29) introduces an external dependency and token lifecycle management that has no clean fallback.

**Non-Functional Requirements:**
- Performance: 2s board load p95, 500ms API p95, 5s max import — prohibit synchronous heavy lifting on the request path; pagination and query optimization are non-optional
- Security: NextAuth.js session management, read-only Gmail OAuth with minimal scope, private object store served via authenticated same-origin proxy (no public delivery URLs), GDPR right-to-erasure and data export pipeline
- Scalability: 5,000 concurrent users at 25% WAU — Vercel serverless + managed Postgres is sufficient, but connection pooling (PgBouncer/Neon) is required from the start
- Reliability: Zero data loss on CV snapshots (Vercel Blob durability), pg-boss dead-letter queue for failed jobs, 3× retry with exponential backoff on all background tasks
- Accessibility: WCAG 2.1 Level AA — must inform component-level decisions, not be retrofitted

**Scale & Complexity:**
- Primary domain: Full-stack web application (Next.js App Router, significant service layer)
- Complexity level: Medium-High
- Complexity concentrates in: state machine transitions, async job scheduling, OAuth token lifecycle, and GDPR compliance pipeline
- Estimated architectural components: ~12 distinct service/domain boundaries

### Technical Constraints & Dependencies

- **Runtime**: Next.js App Router (App directory, Server Components, Server Actions)
- **Deployment**: Vercel (serverless functions, Edge Config for feature flags)
- **Job Queue**: pg-boss — durable, Postgres-backed; 3× retry, exponential backoff, DLQ
- **Object Storage**: Vercel Blob (private store) — CV versions and per-application snapshots; delivery via authenticated same-origin proxy routes (Vercel Blob v2 has no browser-usable signed-URL form for private blobs)
- **Auth**: NextAuth.js (Google OAuth for login, separate Gmail OAuth scope for email access)
- **Payments**: Stripe (subscription management, webhook-driven entitlement updates)
- **UI**: shadcn/ui + Tailwind CSS v3 on Radix UI primitives; Inter typeface; indigo-600 brand

### Cross-Cutting Concerns Identified

1. **Authentication & Authorization** — session-based auth via NextAuth.js with route-level and data-level enforcement; Gmail OAuth token refresh lifecycle separate from login session
2. **Durable Background Jobs** — vitality aging, staleness detection, deadline warnings, and Gmail ingestion all depend on pg-boss reliability; job failure must not silently corrupt board state
3. **Feature Flag / Entitlement Enforcement** — freemium 25-listing cap must be enforced at the service layer, not UI; Vercel Edge Config for flag delivery
4. **Immutable Object Storage** — CV snapshots must be write-once, never overwritten; delivery via authenticated same-origin proxy is the only mechanism (Vercel Blob private store)
5. **GDPR Compliance Pipeline** — data export (FR55) and erasure (FR56) are architectural obligations crossing every data domain
6. **Audit Logging** — application-of-record actions (apply, archive, CV upload) require an append-only log for integrity and debugging
7. **Optimistic UI with Server Revalidation** — real-time-feel board without WebSockets; requires consistent cache invalidation strategy across Server Components and mutations

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Next.js web application. Stack fully specified in PRD — starter selection is foundation-only; no bundled framework choices needed.

### Starter Options Considered

| Option | Verdict |
|---|---|
| `create-next-app@latest` | ✅ Selected — clean foundation, stack pre-decided |
| `create-t3-app` | ❌ Rejected — tRPC not in spec, competes with Server Actions |

### Selected Starter: create-next-app@latest (Next.js 16.2.4)

**Rationale for Selection:**
The PRD pre-selects all major architectural dependencies (Auth.js v5, pg-boss, S3, Stripe). T3 Stack's signature tRPC layer is not in the spec and would compete with Next.js Server Actions as the API pattern. A clean official starter provides the Turbopack dev server and App Router foundation without imposing framework choices already made.

**Initialization Command:**

```bash
npx create-next-app@latest followcv \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir
```

Then immediately add the component library:

```bash
cd followcv && npx shadcn@latest init
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript strict mode, Next.js 16.2.4 App Router, React 19, Node.js runtime on Vercel

**Styling Solution:**
Tailwind CSS v4 (CSS-based @theme configuration — no tailwind.config.js). shadcn/ui provides the component layer. UX spec design tokens map cleanly to v4 @theme variables.

**Build Tooling:**
Turbopack dev server (significantly faster than webpack in development), standard Vercel production build pipeline

**Testing Framework:**
Not included by starter — to be added via architectural decisions (step 4)

**Code Organization:**
`src/` directory with App Router file conventions: `src/app/`, `src/components/`, `src/lib/`. Domain-specific service directories established in step 4.

**Development Experience:**
Turbopack HMR, TypeScript path aliases (`@/*`), ESLint with Next.js rules, AGENTS.md included for AI coding assistant guidance

**Note:** Project initialization using this command should be the first implementation story. ORM selection and remaining library additions are covered in step 4.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- ORM: Prisma — Prisma Migrate handles complex enum/status fields for vitality state machine cleanly
- Database Hosting: Neon — Vercel-native managed Postgres with built-in serverless connection pooling
- Session Strategy: JWT — stateless, optimal for Vercel serverless; revocation handled by GDPR erasure flow
- Gmail Token Storage: Dedicated encrypted table — security boundary separation from login session
- Mutation Pattern: Server Actions + Route Handlers split (see API section)

**Important Decisions (Shape Architecture):**
- Caching: `router.refresh()` from clients after Server-Action mutations (Server Components re-query Prisma directly). The original plan was `next/cache` + `revalidateTag` but the codebase consolidated on `router.refresh()`; see project-context.md → "Cache invalidation".
- Validation: Zod — universal, shared schemas between client and server
- Client State: useOptimistic + useState — keeps client bundle lean per Marcus's lightweight preference
- Object storage: **Vercel Blob (private store)** — zero infra setup, native Vercel integration, single env var. Original plan (Cloudflare R2 + AWS SDK v3 + pre-signed URLs) was swapped during Story 3.1 implementation on cost-of-setup grounds; see project-context.md → "Object storage — Vercel Blob".
- Testing: Vitest + Testing Library + Playwright

**Deferred Decisions (Post-MVP):**
- Upstash Redis — add only if next/cache proves insufficient under load testing
- TanStack Query — add only if real-time polling patterns emerge (import progress, etc.)

### Data Architecture

**ORM: Prisma (latest stable)**
- Rationale: Best-in-class migration tooling for schema evolution, strong TypeScript type generation for the vitality state machine's enum-heavy schema, industry-standard. pg-boss manages its own schema tables independently and coexists cleanly.
- Affects: All database interactions, migration workflow, type generation

**Database Hosting: Neon (Serverless Postgres)**
- Rationale: Vercel-native integration, built-in PgBouncer-compatible connection pooling (critical for serverless cold starts), Postgres 16, generous free tier for MVP.
- Connection: Via Neon serverless driver (`@neondatabase/serverless`) for edge/serverless contexts; standard Prisma datasource for background jobs
- Affects: Connection string config, Prisma datasource, pg-boss initialization

**Caching: next/cache with revalidateTag**
- Rationale: Native App Router cache covers Server Component output; tag-based revalidation invalidates board cache on mutations without an external service. Sufficient for 2s p95 board load target at 5,000 user scale.
- Tags strategy: `board-{userId}`, `listing-{listingId}`, `health-score-{userId}`
- Affects: Server Component fetch calls, Server Action post-mutation revalidation

**Schema Migration: Prisma Migrate**
- Branching strategy: migration files committed to version control, applied via CI on deploy
- Affects: All schema changes, CI/CD pipeline

### Authentication & Security

**Auth.js v5 (NextAuth) — JWT Session Strategy**
- Session stored in signed HTTP-only cookie; no `Session` DB table required
- Token contains: `userId`, `email`, `subscriptionTier`, `gmailConnected` flag
- Refresh: 30-day sliding window via `updateSession` on activity
- Affects: All protected routes, Server Component auth checks, middleware

**Gmail OAuth Token Storage: Dedicated `GmailToken` Table**
- Separate from the Auth.js `Account` table — explicit audit boundary
- `refreshToken` encrypted at rest using AES-256-GCM with `GMAIL_TOKEN_ENCRYPTION_KEY` env var
- `accessToken` ephemeral (15min TTL), re-fetched by pg-boss job on expiry
- Revocation: full row delete on Gmail disconnect or GDPR erasure
- Affects: Gmail OAuth callback handler, pg-boss email ingestion jobs, GDPR erasure pipeline

**Object storage: Vercel Blob (private store)**
- CV files and per-application snapshots live in a private Vercel Blob store (`access: "private"`).
- Vercel Blob v2 does **not** expose a browser-usable signed-URL form for private blobs (`head().url` returns 403 when opened directly). All browser-facing reads — preview, download, thumbnail — go through a same-origin proxy route that auth-checks, ownership-checks, and streams via `get(s3Key, { access: "private" })`.
- CV uploads use Vercel Blob's client-upload flow (`@vercel/blob/client`'s `upload()` → token route wrapping `handleUpload({ onBeforeGenerateToken })` for auth + cap checks). Direct browser → Blob, bypassing the Vercel function body limit.
- CV snapshot creation is server-only: read source via `get()` → `put()` to a fresh `cv/{userId}/{uuid}.pdf` path. Vercel Blob v2 has no native server-side `copy()`.
- Snapshot key format: `cv/{userId}/{uuid}.pdf` — immutable, never overwritten.
- Affects: CV upload-token route, CV upload Server Action, snapshot service, same-origin proxy routes, GDPR export pipeline.
- Single env var: `BLOB_READ_WRITE_TOKEN` (Vercel-injected when a Blob store is connected).

### API & Communication Patterns

**Primary Mutation Pattern: Server Actions**
- All user-initiated mutations (apply, import, archive, CV upload, status change) use Server Actions
- Server Actions return typed `{ data: T | null, error: string | null }` union — never throw
- Post-mutation: call `revalidateTag(...)` then return result; client uses `useTransition` + `useOptimistic`
- Route Handlers used exclusively for: Stripe webhooks, Gmail OAuth callback, pg-boss health endpoint

**Validation: Zod**
- Shared Zod schemas in `src/lib/schemas/` — imported by both Server Actions (server validation) and forms (client-side validation)
- All external input validated at the Server Action boundary before any DB interaction
- Affects: All Server Actions, all API Route Handlers, form components

**Error Handling: Typed Return Union**
- Server Actions: `return { data: null, error: "Human-readable message" }` on failure
- Route Handlers: JSON `{ error: { code: string, message: string } }` with appropriate HTTP status
- Unrecoverable errors (DB connection loss, etc.) propagate to `error.tsx` boundaries
- pg-boss job failures: logged to DLQ, surface via admin dashboard (FR49–56), never silently swallowed

### Frontend Architecture

**Server vs Client Component Boundary**
- Default to Server Components; opt into `"use client"` only for: event handlers, browser APIs, `useOptimistic`, React Hook Form
- Board rows (`BoardRow`): Server Component shell, Client Component for interactive controls
- HealthScoreWidget: Server Component (data-fetching), Client Component only for animation
- Affects: All component files, data fetching patterns

**Client State: useOptimistic + useState**
- `useOptimistic` for board mutations (vitality changes, archive, apply) — optimistic update, revert on error
- `useState` for filter/sort state, UI toggles (drawer open/close)
- No global state store for MVP — all data server-fetched and revalidated
- Affects: BoardRow, FilterChipBar, ImportDrawer, ApplyRitualDialog

**Forms: React Hook Form + Zod resolver**
- All form surfaces use `useForm` with `zodResolver` from `@hookform/resolvers/zod`
- Shared Zod schema drives both client validation and server-side Server Action validation
- Affects: ImportDrawer URL form, ApplyRitualDialog, settings forms

### Infrastructure & Deployment

**Testing: Vitest + Testing Library + Playwright**
- Unit/integration: Vitest (native ESM, faster than Jest with App Router)
- Component: Testing Library with `@testing-library/react`
- E2E: Playwright targeting critical paths (import → apply → health score update)
- Co-located test files: `*.test.ts(x)` alongside source
- Affects: CI pipeline, all new code must have test coverage for business logic

**Observability: Sentry + Vercel Analytics**
- Sentry: error tracking for Server Actions, Route Handlers, pg-boss job failures; source maps uploaded on deploy
- Vercel Analytics: web vitals (LCP, CLS, FID) for board load performance tracking against 2s p95 NFR
- Affects: `instrumentation.ts`, layout.tsx, CI/CD deploy step

**CI/CD: GitHub Actions + Vercel**
- Vercel handles preview deployments on PR; production deploy on main merge
- GitHub Actions: type check, lint, Vitest unit tests, Prisma migrate dry-run on PR
- Playwright E2E: run on staging environment post-deploy before production promotion
- Affects: `.github/workflows/`, `vercel.json`

### Decision Impact Analysis

**Implementation Sequence (critical path):**
1. Neon database provisioning + Prisma schema initialization
2. Auth.js v5 configuration (Google OAuth, JWT strategy)
3. pg-boss initialization on Neon connection
4. Core vitality state machine (FR16–21) — highest risk, implement first
5. CV snapshot pipeline (Vercel Blob + Prisma) — second highest risk
6. Board UI (Server Components + `router.refresh()`)
7. Health Score engine
8. Gmail OAuth + token storage
9. Stripe subscription + entitlement enforcement
10. GDPR export/erasure pipeline

**Cross-Component Dependencies:**
- Neon ← Prisma ← pg-boss (all share the same Postgres connection)
- Auth.js JWT ← `subscriptionTier` field ← Stripe webhook handler (must stay in sync)
- Gmail OAuth token ← pg-boss job scheduler ← vitality state machine (email signals feed state transitions)
- revalidateTag strategy ← Server Actions ← Board Server Components (cache invalidation chain must be consistent)

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified
8 areas where AI agents could make incompatible choices without explicit rules. Domain-specific rules (vitality state machine, CV immutability) are the highest risk.

### Naming Patterns

**Database / Prisma Naming:**
- Prisma model names: PascalCase singular (`User`, `JobListing`, `CvSnapshot`)
- DB table names: Prisma default snake_case plural (`job_listings`, `cv_snapshots`)
- Column names: camelCase in Prisma schema → snake_case in DB (Prisma maps automatically)
- Foreign keys: `userId`, `jobListingId` (camelCase, no `fk_` prefix)
- Enum values: SCREAMING_SNAKE_CASE (`HOT`, `IN_DIALOGUE`, `CLOSED`)

**pg-boss Job Naming:**
- Format: `domain/action` kebab-case — e.g., `vitality/age-listings`, `gmail/ingest-signals`, `cv/cleanup-orphaned-snapshots`
- Never use dot notation or PascalCase for job names

**File & Directory Naming:**
- Directories: kebab-case (`job-listings/`, `vitality-engine/`)
- React components: PascalCase files (`BoardRow.tsx`, `HealthScoreWidget.tsx`)
- Server Actions: kebab-case files in `src/actions/` (`import-listing.ts`, `apply-to-job.ts`)
- Utilities/services: kebab-case (`vitality-state-machine.ts`, `gmail-token-service.ts`)
- Tests: co-located `*.test.ts(x)` — never in a separate `__tests__/` directory

**API Route Naming:**
- Route Handlers: `src/app/api/[domain]/route.ts`
- Plural nouns for resource routes: `/api/listings`, `/api/cv-snapshots`
- No verb-based routes — use HTTP methods to express intent

### Structure Patterns

**Service Layer Rule:**
All business logic goes in `src/lib/services/`. Server Actions call services — they do not contain business logic themselves. This prevents logic duplication across actions.

**Project Organization:**
```
src/
  app/            # Next.js App Router — pages and layouts only
  actions/        # All Server Actions — one file per domain
  components/
    ui/           # shadcn/ui auto-generated — DO NOT EDIT
    board/        # Board-specific components
    health/       # Health score components
    application/  # Apply flow components
    vitality/     # VitalityBadge
    subscription/ # ProGatePattern
    shared/       # Reusable components
  lib/
    db/           # Prisma client singleton
    auth/         # Auth.js v5 config
    schemas/      # Zod schemas (shared client + server)
    services/     # Business logic services (incl. cv-snapshot-service: Vercel Blob get→put copy)
    jobs/         # pg-boss job definitions and handlers
    stripe/       # Stripe SDK client + webhook verification
    utils/        # Date formatting, error utilities
```

### Format Patterns

**Server Action Return Shape — ALL Server Actions, no exceptions:**
```typescript
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }
// ✅ return { data: listing, error: null }
// ✅ return { data: null, error: "Listing not found" }
// ❌ throw new Error("Listing not found")
```

**pg-boss Job Payload:**
All payloads must be JSON-serializable plain objects. Include `userId` in every payload.
```typescript
// ✅ await boss.send('vitality/age-listings', { userId, listingIds: [...] })
// ❌ no class instances, no Date objects in payloads
```

**Date Serialization:**
- DB: Prisma `DateTime` (ISO 8601 UTC)
- API/Action responses: ISO 8601 strings — never Unix timestamps
- UI display: format at render time with `Intl.DateTimeFormat` — never store pre-formatted dates

**Vitality State Values:**
Always use the Prisma enum type `VitalityState` — never raw strings.
```typescript
// ✅ listing.vitalityState === VitalityState.HOT
// ❌ listing.vitalityState === 'hot'
```

### Domain-Critical Patterns

**Vitality State Machine — MANDATORY:**
`vitalityState` on `JobListing` MUST ONLY be mutated via `src/lib/services/vitality-state-machine.ts`. Direct Prisma updates to `vitalityState` are FORBIDDEN anywhere else.

**CV Snapshots — Immutability Rule:**
`CvSnapshot` records are WRITE-ONCE. On every CV upload, create a new row — never update an existing one. S3 keys are derived from `snapshotId` and are never reused.

**Entitlement Enforcement — All Paths:**
Before creating any `JobListing`, call `entitlement-service.ts checkListingCap(userId)` in the Server Action — not only in the UI.

**Auth Check — All Server Actions:**
Every Server Action begins with:
```typescript
const session = await auth()
if (!session?.user?.id) return { data: null, error: 'Unauthorized' }
const userId = session.user.id
```

### Process Patterns

**Loading States:** Use `useOptimistic` for board mutations. Optimistic value must match the Server Action success shape exactly for clean rollback.

**revalidateTag Call Order:** Always call `revalidateTag` AFTER DB write succeeds, BEFORE returning from the Server Action.

**Error Display:** User-facing errors from `ActionResult.error` are displayed inline. Never surface raw Prisma/DB errors to users — map to human-readable messages in the service layer.

### Enforcement Guidelines

**All AI Agents MUST:**
- Route all `vitalityState` mutations through `vitality-state-machine.ts`
- Create new `CvSnapshot` records — never update existing ones
- Begin every Server Action with auth session check
- Call `checkListingCap` before creating any `JobListing`
- Return `ActionResult<T>` shape from all Server Actions — never throw
- Use `VitalityState` enum — never raw strings
- Name pg-boss jobs in `domain/action` kebab-case format
- Call `revalidateTag` after every successful DB mutation in a Server Action

**All AI Agents MUST NOT:**
- Add business logic inside Server Action files — delegate to services
- Write directly to `vitalityState` field outside the state machine service
- Store pre-formatted dates — format at render time only
- Add client-side `fetch()` where Server Actions or Server Components suffice
- Create Route Handlers for user-initiated mutations

## Project Structure & Boundaries

### Complete Project Directory Structure

```
followcv/
├── README.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── .env.local                          # Local secrets — never committed
├── .env.example                        # Committed template with all required keys
├── .gitignore
├── AGENTS.md                           # AI agent coding guidance (create-next-app)
├── .github/
│   └── workflows/
│       ├── ci.yml                      # typecheck, lint, vitest, prisma migrate --dry-run
│       └── e2e.yml                     # Playwright on staging post-deploy
├── prisma/
│   ├── schema.prisma                   # Single schema — all models and enums
│   └── migrations/                     # Prisma Migrate history (committed)
├── public/
│   └── fonts/                          # Inter variable font (self-hosted)
├── playwright/
│   ├── fixtures/                       # Shared auth fixture, test DB helpers
│   └── tests/
│       ├── import-flow.spec.ts         # FR10–15: URL import → board appearance
│       ├── apply-flow.spec.ts          # FR22–29: Apply → CV snapshot → state change
│       ├── health-score.spec.ts        # FR40–43: Score calculation + coaching display
│       └── auth.spec.ts                # FR1–9: Login, session persistence
└── src/
    ├── middleware.ts                    # Auth.js session guard on (dashboard) routes
    ├── instrumentation.ts              # Sentry initialization (server + edge)
    ├── app/
    │   ├── globals.css                 # Tailwind v4 @theme — all design tokens
    │   ├── layout.tsx                  # Root layout: Inter font, Analytics, Sentry
    │   ├── page.tsx                    # Landing / marketing page
    │   ├── error.tsx                   # Root error boundary
    │   ├── (auth)/
    │   │   ├── login/
    │   │   │   └── page.tsx            # FR1: Google OAuth login page
    │   │   └── callback/
    │   │       └── page.tsx            # Auth.js OAuth callback handler
    │   ├── (dashboard)/
    │   │   ├── layout.tsx              # Dashboard shell: sidebar + HealthScoreWidget
    │   │   ├── board/
    │   │   │   └── page.tsx            # FR16–21: Living Job Board (primary view)
    │   │   ├── settings/
    │   │   │   ├── page.tsx            # FR5–8: Profile & account settings
    │   │   │   ├── subscription/
    │   │   │   │   └── page.tsx        # FR44–48: Subscription management
    │   │   │   └── gmail/
    │   │   │       └── page.tsx        # FR22: Gmail OAuth connect / disconnect
    │   │   └── admin/
    │   │       └── page.tsx            # FR49–56: Admin dashboard (role-gated)
    │   └── api/
    │       ├── auth/
    │       │   └── [...nextauth]/
    │       │       └── route.ts        # Auth.js v5 handler
    │       ├── webhooks/
    │       │   └── stripe/
    │       │       └── route.ts        # FR44–48: Stripe subscription webhooks
    │       ├── oauth/
    │       │   └── gmail/
    │       │       └── route.ts        # FR22: Gmail OAuth callback + token storage
    │       └── jobs/
    │           └── process/
    │               └── route.ts        # Vercel Cron target — triggers pg-boss polling
    ├── actions/                        # All Server Actions — one file per domain
    │   ├── import-listing.ts           # FR10–15: URL scrape → create JobListing
    │   ├── manage-listing.ts           # FR16–21: Archive, restore, delete
    │   ├── apply-to-job.ts             # FR22–29: Apply action + CV snapshot + state
    │   ├── manage-cv.ts                # FR30–39: Upload CV, set active version
    │   ├── manage-account.ts           # FR1–9: Update profile, delete account (FR56)
    │   ├── export-data.ts              # FR55: GDPR data export trigger
    │   └── admin.ts                    # FR49–56: Admin actions, DLQ inspection
    ├── components/
    │   ├── ui/                         # shadcn/ui auto-generated — DO NOT EDIT
    │   ├── board/
    │   │   ├── BoardRow.tsx            # FR16–21: Listing row (SC shell + CC controls)
    │   │   ├── BoardRow.test.tsx
    │   │   ├── FilterChipBar.tsx       # FR20: Filter/sort chip controls
    │   │   ├── FilterChipBar.test.tsx
    │   │   ├── EmptyBoardState.tsx     # FR16: Zero-state for new users
    │   │   ├── StalenessBanner.tsx     # FR21: Staleness warning
    │   │   └── ImportDrawer.tsx        # FR10–15: URL import slide-over
    │   ├── health/
    │   │   ├── HealthScoreWidget.tsx   # FR40–43: Score + coaching zone
    │   │   ├── HealthScoreWidget.test.tsx
    │   │   └── CoachingInstruction.tsx # FR43: Specific named-listing action
    │   ├── application/
    │   │   ├── ApplyRitualDialog.tsx   # FR22–29: Apply flow dialog
    │   │   ├── ApplyRitualDialog.test.tsx
    │   │   └── CVVersionSelector.tsx  # FR30–39: CV version picker
    │   ├── vitality/
    │   │   └── VitalityBadge.tsx       # FR17: State badge (color + label)
    │   ├── subscription/
    │   │   └── ProGatePattern.tsx      # FR44–48: Upgrade prompt for free users
    │   └── shared/
    │       ├── Providers.tsx           # Client providers wrapper (root layout)
    │       └── ErrorMessage.tsx        # Reusable inline error display
    ├── lib/
    │   ├── db/
    │   │   └── index.ts                # Prisma client singleton
    │   ├── auth/
    │   │   └── index.ts                # Auth.js v5: providers, JWT callbacks, session
    │   ├── schemas/                    # Zod schemas — shared client + server
    │   │   ├── listing.ts
    │   │   ├── application.ts
    │   │   ├── cv.ts
    │   │   └── account.ts
    │   ├── services/
    │   │   ├── vitality-state-machine.ts    # FR16–21: CANONICAL state transitions
    │   │   ├── vitality-state-machine.test.ts
    │   │   ├── health-score-engine.ts       # FR40–43: 5 indicators → score + zone
    │   │   ├── health-score-engine.test.ts
    │   │   ├── gmail-token-service.ts       # FR22: AES-256-GCM token encrypt/decrypt
    │   │   ├── gmail-token-service.test.ts
    │   │   ├── gmail-signal-processor.ts    # FR22–29: Email → vitality signal
    │   │   ├── entitlement-service.ts       # FR44–48: checkListingCap, tier checks
    │   │   ├── entitlement-service.test.ts
    │   │   ├── cv-snapshot-service.ts       # FR30–39: Vercel Blob get→put copy (no Prisma write here)
    │   │   ├── cv-snapshot-service.test.ts
    │   │   ├── gdpr-export-service.ts       # FR55: Full data export assembly
    │   │   └── scraper-service.ts           # FR10–15: URL metadata extraction
    │   ├── jobs/
    │   │   ├── index.ts                # pg-boss init + job registration
    │   │   ├── vitality-aging.ts       # FR18–19: Scheduled state decay
    │   │   ├── deadline-alerts.ts      # FR19: Deadline warning jobs
    │   │   ├── gmail-ingestion.ts      # FR22–29: Fetch + process email signals
    │   │   └── stripe-sync.ts          # FR44–48: Subscription state reconciliation
    │   ├── stripe/
    │   │   └── index.ts                # Stripe SDK client + webhook signature verify
    │   └── utils/
    │       ├── dates.ts                # Intl.DateTimeFormat helpers
    │       └── errors.ts               # ActionResult<T> type + error mapping
```

### Architectural Boundaries

**Auth Boundary:** `src/middleware.ts` enforces Auth.js session on all `(dashboard)` routes at the edge. Server Actions enforce session independently — middleware is not the sole gate.

**State Machine Boundary:** `src/lib/services/vitality-state-machine.ts` is the only file permitted to write `vitalityState` on `JobListing`. All other code calls this service.

**CV Immutability Boundary:** Snapshot creation is split: `src/lib/services/cv-snapshot-service.ts` performs the Vercel Blob `get → put` copy and returns the new URL + a fresh UUID; `src/actions/apply-to-job.ts` is the only Server Action that creates `CvSnapshot` rows (write-once) and owns the cleanup ordering on failure. Snapshot blob path is `cv/{userId}/{uuid}.pdf`.

**Job Queue Boundary:** All pg-boss job definitions and handlers live in `src/lib/jobs/`. The Vercel Cron target (`api/jobs/process/route.ts`) triggers polling. Direct `boss.send()` outside this directory is discouraged — use typed job helpers from `src/lib/jobs/index.ts`.

**Entitlement Boundary:** `src/lib/services/entitlement-service.ts` is the canonical freemium gate. Always reads from DB — never trusts JWT `subscriptionTier` alone (JWT is a cache hint; Stripe webhook may have updated the DB since JWT was issued).

### Requirements to Structure Mapping

| FR Domain | Server Actions | Services | Components | Routes |
|---|---|---|---|---|
| FR1–9 User Account | `manage-account.ts` | — | `(auth)/login/` | `settings/` |
| FR10–15 Job Import | `import-listing.ts` | `scraper-service.ts` | `ImportDrawer.tsx` | — |
| FR16–21 Living Board | `manage-listing.ts` | `vitality-state-machine.ts` | `board/` components | `board/page.tsx` |
| FR22–29 Application | `apply-to-job.ts` | `gmail-*` services | `ApplyRitualDialog.tsx` | `api/oauth/gmail/` |
| FR30–39 CV Mgmt | `manage-cv.ts` | `cv-snapshot-service.ts` | `CVVersionSelector.tsx` | — |
| FR40–43 Health Score | — | `health-score-engine.ts` | `HealthScoreWidget.tsx` | — |
| FR44–48 Subscription | — | `entitlement-service.ts` | `ProGatePattern.tsx` | `api/webhooks/stripe/` |
| FR49–56 Admin/GDPR | `admin.ts`, `export-data.ts` | `gdpr-export-service.ts` | — | `admin/page.tsx` |

### Integration Points

**Internal Communication:**
- Server Actions → Services → Prisma → Neon
- Vercel Cron → `api/jobs/process` Route Handler → pg-boss poll → Job Handlers → Services
- Server Components → Prisma (direct reads, no service layer required for queries)
- Client Components → Server Actions via `useTransition` + form action binding

**External Integrations:**
- Google OAuth: Auth.js v5 provider
- Gmail API: `gmail-token-service.ts` + `gmail-signal-processor.ts` (read-only, scoped)
- Stripe: `api/webhooks/stripe/route.ts` → `lib/stripe/` → `entitlement-service.ts`
- Vercel Blob (private store): used directly via `@vercel/blob` (`get`, `put`, `del`); browser-facing reads go through same-origin proxy routes (`api/cv/[id]/file`, `api/cv/snapshot/[id]/file`)
- Sentry: `instrumentation.ts` + automatic Next.js SDK instrumentation
- Vercel Cron: triggers `api/jobs/process` on schedule for pg-boss job polling

**Data Flow:**
```
User action (click)
  → useTransition(serverAction)
  → Server Action (auth check → Zod validate → service call)
  → Service (business logic → Prisma write)
  → return ActionResult<T>
  → caller calls router.refresh()  ← project-context.md binds this, not revalidateTag
  → Server Component re-queries Prisma directly
  → Board re-renders with fresh data
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices are mutually compatible. Next.js 16 + Prisma + Auth.js v5 + pg-boss + Neon + Tailwind v4 + shadcn/ui have no version conflicts. Vercel Blob ships native to the Vercel platform with a single env var.

**Pattern Consistency:** Server Actions → typed return union is the correct App Router pattern. `router.refresh()` after Server-Action mutations is the consistent cache-invalidation pattern across every surface (Board, CV, Settings, Subscription) — Server Components re-query Prisma on every render, no `revalidateTag` plumbing required. VitalityState enum usage is consistent with Prisma codegen output. Service layer separation enables testability without pattern conflicts.

**Structure Alignment:** Project structure supports all decisions. pg-boss job isolation in `src/lib/jobs/` cleanly separates job definitions from business logic. Boundary rules prevent cross-contamination between domains.

### Requirements Coverage Validation ✅

**Functional Requirements:** All 56 FRs across 8 categories are architecturally covered with explicit mappings to files and services (see Requirements to Structure Mapping table).

**Non-Functional Requirements:**
- P1–P5 (Performance): `router.refresh()` + Neon connection pooling targets 2s board load p95
- S1–S8 (Security): JWT sessions, Gmail token AES-256-GCM encryption, Vercel Blob private store served via authenticated same-origin proxy, Stripe webhook verification, GDPR pipeline
- SC1–SC4 (Scalability): Vercel serverless auto-scales, Neon managed pooling, Vercel Cron handles job scheduling
- R1–R4 (Reliability): pg-boss 3× retry + DLQ, Vercel Blob durability, `CvSnapshot` write-once semantics, idempotent Stripe webhook via `stripe_webhook_events` dedup
- A1–A4 (Accessibility): Radix UI accessible primitives via shadcn/ui, WCAG 2.1 AA target

### Gap Analysis Results

**Critical Gap — RESOLVED: pg-boss on Vercel serverless**
pg-boss requires a persistent process; Vercel functions terminate per-request.
Resolution: Vercel Cron Jobs call `POST /api/jobs/process` Route Handler on schedule. The handler calls `boss.fetch()` and processes jobs within Vercel's 60s function timeout. Added `api/jobs/process/route.ts` to project structure. Schedule configured in `vercel.json`.

**Important Gap — RESOLVED: CV file upload path**
Vercel serverless functions have a 4.5MB body size limit — insufficient for CV PDFs.
Resolution: **Direct upload via Vercel Blob's client-upload flow** (the project switched from the original R2 + AWS-SDK pre-signed plan during Story 3.1; see project-context.md → "Object storage — Vercel Blob").

Flow:
1. Client calls `upload()` from `@vercel/blob/client` with `handleUploadUrl: "/api/cv/upload-token"` (token route does `auth()` + cap check inside `onBeforeGenerateToken`).
2. Client PUTs file directly to Vercel Blob — bypasses the Vercel function body limit.
3. On successful PUT, the client calls `confirmCvUpload({ blobUrl, name, fileSize, fileHash })` Server Action → creates the `CvVersion` DB row.
4. Snapshot creation on apply (`cv-snapshot-service.ts` + `apply-to-job` action) is server-only: read source blob via `get()`, write a fresh copy via `put()` to `cv/{userId}/{uuid}.pdf`.

**Important Gap — RESOLVED: JWT / subscription tier freshness**
JWT may contain stale `subscriptionTier` after a Stripe webhook updates the DB.
Resolution: `entitlement-service.ts` always reads subscription tier from DB. JWT `subscriptionTier` is a UI display hint only — never used as the authority for feature gates.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium-High, ~12 domain boundaries)
- [x] Technical constraints identified (Next.js, Vercel, pg-boss, Vercel Blob, Auth.js, Stripe)
- [x] Cross-cutting concerns mapped (7 concerns documented)

**Architectural Decisions**
- [x] Critical decisions documented with technology choices
- [x] Technology stack fully specified (Next.js 16.2.4, Prisma, Neon, Auth.js v5, Vercel Blob, Stripe)
- [x] Integration patterns defined (Server Actions, Route Handlers, Vercel Cron)
- [x] Performance considerations addressed (`router.refresh()`, Neon connection pooling)

**Implementation Patterns**
- [x] Naming conventions established (DB, pg-boss jobs, files, API routes)
- [x] Structure patterns defined (service layer, actions layer, component hierarchy)
- [x] Communication patterns specified (ActionResult<T>, `router.refresh()` post-mutation)
- [x] Process patterns documented (state machine boundary, CV immutability, entitlement)

**Project Structure**
- [x] Complete directory structure defined (all files and directories)
- [x] Component boundaries established (8 domain boundaries with ownership rules)
- [x] Integration points mapped (Cron, Stripe, Gmail, Vercel Blob, Sentry)
- [x] Requirements to structure mapping complete (FR1–56 → files table)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — all 16 checklist items complete, no open critical gaps

**Key Strengths:**
- Vitality state machine boundary is explicit and enforced by pattern rules — highest-risk component well-controlled
- CV snapshot immutability and direct Vercel Blob upload are clearly specified — second-highest risk resolved
- Entitlement enforcement reads from DB — subscription tier stays accurate regardless of JWT staleness
- pg-boss on Vercel solved cleanly with Vercel Cron — no additional infrastructure required for MVP

**Areas for Future Enhancement:**
- Upstash Redis or `unstable_cache` if `router.refresh()` proves insufficient under load
- TanStack Query if real-time polling patterns emerge
- Dedicated long-running worker if Vercel Cron 60s window becomes limiting
- Prisma Accelerate for global edge caching of DB queries

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently — especially the 8 MUST and 5 MUST NOT rules
- Respect all domain boundary ownership rules
- Refer to this document for all architectural questions before making local decisions

**First Implementation Priority:**
```bash
npx create-next-app@latest followcv \
  --typescript --tailwind --eslint --app --src-dir

cd followcv && npx shadcn@latest init
```

Then: Neon database provisioning → Prisma schema → Auth.js v5 → pg-boss init → vitality state machine (highest risk first).
