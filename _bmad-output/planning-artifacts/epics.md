---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
---

# FollowCV - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for FollowCV, decomposing the requirements from the PRD, UX Design, and Architecture documents into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Users can register for an account with email/password or an OAuth provider
FR2: Users can authenticate, maintain, and terminate their session securely
FR3: New users complete a preference setup step during onboarding that pre-populates their preference profile
FR4: Users can view and edit their preference profile (job function, seniority, location, work style, salary range) at any time
FR5: Users can permanently and immediately delete their account and all associated data
FR6: Users can request a full export of their data (CV files, job records, application history) as a downloadable archive; the export runs asynchronously and is delivered when ready
FR7: Users can revoke connected OAuth integrations (Gmail) without losing any job or application data
FR8: The system automatically anonymizes free tier accounts with no login activity for 24 months by replacing identifying data with hashed placeholders and soft-deleting job records; Pro accounts are exempt from automated cleanup
FR9: Admins can authenticate and access administrative functions through a role-protected interface; admin accounts include Pro-tier feature access
FR10: Users can import a job listing by pasting a URL, with fields auto-populated from structured data extracted from the page; the system captures company domain at import time for employer matching
FR11: When a URL import is attempted for a listing already tracked by the user, the system detects the duplicate and presents a resolution choice before saving
FR12: Users can import a job listing via a manual entry form when URL extraction is unavailable or returns incomplete data
FR13: The system visually distinguishes auto-imported listings from manually entered ones
FR14: Users can edit any field on a job listing after import
FR15 (Vision): Users can capture job listings from login-walled sources using a browser extension — DEFERRED
FR16: Users can view all tracked job listings on a central board
FR17: The system computes and displays a vitality state for each listing across 8 states (Hot, Active, Cooling, Cold, Deadline, Ghosting, In Dialogue, Closed) without requiring user input, per a pre-defined state machine specification
FR18: The system recalculates vitality states on an automated background schedule; failed recalculation jobs are retried 3 times with exponential backoff and surfaced as errors in the admin interface after the final failure
FR19: Users can manually override the computed vitality state of any listing; overrides persist until explicitly cleared and are visually distinguished from system-computed states
FR20: Users can archive a listing to remove it from the active board
FR21: Users can filter and sort the board by vitality state, company, date added, and application status; users can search listings by keyword across title, company, and notes
FR22: Users can record an application against a job listing, capturing application date, the selected CV version, optional supporting documents, and free-text notes; recording triggers an immutable CV snapshot attached to the application record
FR23: Users can manually update a listing's application status using a defined taxonomy (Applied, Interviewing, Offer Received, Rejected, Withdrawn, On Hold, Ghosted)
FR24: The system identifies listings in Applied or In Dialogue status with no recorded activity in the last 7 days and surfaces these as Follow-up due items on the board; the follow-up window threshold is configurable
FR25: Pro users can connect a Gmail account (read-only) to enable automatic status detection based on employer domain matching
FR26: The system automatically updates a listing's vitality state when email activity from a matched employer domain is detected (Pro); matching uses the company domain captured at import
FR27: Users can view the exact CV version attached to any past application record; the system retrieves the point-in-time snapshot, not the current version; missing snapshot files are surfaced gracefully
FR28: The system prevents modification of any CV snapshot after the application action is recorded
FR29: Users can add, edit, and view free-text notes on any application or job listing record
FR30: Users can upload a CV file and save it as a named, timestamped version
FR31: Users can view the complete history of their saved CV versions
FR32: Users can restore, duplicate, or rename any previous CV version; restoring creates a new version entry and checks the free tier cap before saving
FR33: When recording an application, the system automatically snapshots and attaches the selected CV version as an immutable copy stored independently of the source version
FR34: CV files are served via per-request authenticated access tokens that expire after use; public profile artifacts stored and served separately
FR35: Free tier users can store up to the configured maximum number of CV versions; Pro users have unlimited storage
FR36 (Growth/Pro): CV Strength Meter — intrinsic quality score with actionable improvement recommendations — DEFERRED
FR37 (Growth/Pro): Skill Gap Indicator — keyword-match comparison between job listing and CV — DEFERRED
FR38 (Pro): Public profile URL rendering current CV as shareable web page — DEFERRED
FR39 (Pro): Users can control visibility of their public profile URL — DEFERRED
FR40: The system computes an Application Health Score from five rule-based indicators reflecting the user's pipeline state, per a pre-defined scoring formula and threshold specification
FR41: The health score is displayed as one of three coaching zones (🟢 / 🟡 / 🔴) with zone boundaries defined in the scoring specification; status updates trigger cascading health score recalculation
FR42: Each coaching zone surfaces a single deterministic next-action instruction from a pre-defined lookup table keyed by active indicator and zone
FR43: The health score and coaching instruction update automatically when underlying application or listing data changes
FR44: Free tier users are capped at a configurable maximum number of active job listings (default: 25)
FR45: The system surfaces the approaching cap progressively to users before the limit is reached (at 80% and 90% of cap)
FR46: When a user reaches the listing cap, the system presents a contextual upgrade prompt before blocking the import
FR47: Users can subscribe to, manage, and cancel the Pro tier from within the product
FR48: The freemium cap and other configurable thresholds are stored in a runtime config system (database-backed) adjustable by an administrator without requiring a code deployment
FR49: Admins can view scraper health metrics by source, including success rate and failure type over time
FR50: Admins can view individual import failure logs (URL, error type, timestamp)
FR51: Admins can view platform-level metrics (registered users, WAU, CV storage, conversion rate) and manage individual user accounts including tier adjustment, suspension, and deletion
FR52: Admins can trigger a GDPR-compliant data export for any user; the export runs asynchronously, notifies the user on completion, and stores the artifact with a defined retention TTL
FR53: The system logs all data export requests with timestamps for compliance
FR54: Admins can identify users who have reached the freemium cap without converting
FR55: The background job system retries failed jobs 3 times with exponential backoff; jobs exceeding the retry limit are routed to a dead-letter queue visible in the admin interface; each job type has a defined timeout
FR56 (Growth): Behavioral preference feedback — system detects drift and prompts profile updates — DEFERRED

### NonFunctional Requirements

NFR-P1: The job board dashboard loads within 2 seconds for a user with up to 100 active listings on a standard broadband connection
NFR-P2: URL import (fetch, parse, and save) completes within 5 seconds under normal load; failures surface a user-facing error within the same window
NFR-P3: Standard CRUD API routes respond within 500ms at the 95th percentile
NFR-P4: CV file uploads of up to 10MB complete without timeout or data truncation
NFR-P5: Background vitality recalculation completes for all of a user's active listings within 1 hour of the scheduled trigger
NFR-S1: All data is encrypted in transit (TLS 1.2 minimum) and at rest
NFR-S2: CV files are accessible only via per-request authenticated access tokens that expire after use; no public bucket access
NFR-S3: Gmail OAuth tokens are encrypted at rest and never exposed to the client
NFR-S4: Authentication sessions expire after 24 hours of idle time and are invalidated immediately on explicit logout
NFR-S5: All API routes enforce authentication; unauthenticated requests return 401 without exposing system detail
NFR-S6: Admin routes enforce role-based access control; standard user credentials cannot access admin functions
NFR-S7: Pro subscription payment processing handled entirely by PCI-compliant third-party (Stripe); card data never stored by the application
NFR-S8: Gmail OAuth scope is strictly read-only; the application never reads, stores, logs, or transmits email content
NFR-SC1: The system supports 5,000 registered users with 25% weekly active concurrency without infrastructure reconfiguration
NFR-SC2: A single user's board with up to 100 listings meets the 2-second load target
NFR-SC3: The background job queue processes vitality recalculation across 5,000 active users within a 1-hour window
NFR-SC4: Object storage accommodates up to 100MB per user; aggregate platform storage scales without manual infrastructure intervention
NFR-R1: Zero tolerance for data loss on CV versions and application CV snapshots — immutable records must survive any single infrastructure failure
NFR-R2: Background job failures are retried 3 times with exponential backoff and routed to DLQ after final failure; silent failure is not acceptable
NFR-R3: A scraper failure for one user's import is fully isolated and does not affect any other user's operations
NFR-R4: Monthly application uptime target: 99.5% excluding scheduled maintenance windows
NFR-A1: Primary user flows — job import, board view, apply action, CV upload — are fully navigable via keyboard
NFR-A2: All interactive elements carry accessible labels compatible with common screen readers
NFR-A3: Vitality states are differentiated by label and/or icon in addition to colour; colour alone is not the sole signal
NFR-A4: The product is functionally tested on Chrome, Firefox, Safari, and Edge (last 2 major versions) prior to release

### Additional Requirements

AR1: Initialize project with `npx create-next-app@latest followcv --typescript --tailwind --eslint --app --src-dir` followed by `npx shadcn@latest init` — this is Epic 1 Story 1
AR2: Configure Neon (Serverless Postgres) as database host with Prisma ORM; set up Prisma schema with all application models and enums; configure connection pooling via Neon serverless driver
AR3: Configure Auth.js v5 with Google OAuth provider and JWT session strategy; implement dedicated GmailToken table with AES-256-GCM encryption for refresh token storage; enforce 24-hour idle session expiry
AR4: Configure pg-boss durable job queue on Neon Postgres; implement Vercel Cron integration via `api/jobs/process/route.ts` as the polling target; register all job types with 3× retry and exponential backoff
AR5: Configure **Vercel Blob** (private store) for CV file storage; implement direct upload flow via `@vercel/blob/client`'s `upload()` against an `/api/cv/upload-token` route that wraps `handleUpload({ onBeforeGenerateToken })` for auth + cap checks → client calls a confirmation Server Action to create the `CvVersion` DB row; implement same-origin proxy routes for browser-facing reads (`/api/cv/[id]/file` and `/api/cv/snapshot/[id]/file`) that auth-check, ownership-check, then stream via `get(s3Key, { access: "private" })`. Vercel Blob v2 has no browser-usable signed-URL form for private blobs, which is why the proxy is the only viable read path. (Original draft specified Cloudflare R2 + AWS SDK v3 pre-signed URLs; swapped during Story 3.1 — see project-context.md.)
AR6: Configure Stripe SDK; implement webhook Route Handler at `api/webhooks/stripe/route.ts` with signature verification; connect webhook to entitlement-service for subscription tier updates
AR7: Set up Sentry error tracking (instrumentation.ts) and Vercel Analytics in root layout; configure source map uploads on deploy
AR8: Set up GitHub Actions CI/CD pipeline: typecheck, ESLint, Vitest unit tests, Prisma migrate --create-only dry-run on PR; Playwright E2E on staging post-deploy
AR9: All Server Actions must enforce auth session check at entry and return `ActionResult<T> = { data: T; error: null } | { data: null; error: string }` — never throw. Post-mutation cache invalidation is via `router.refresh()` from the calling client (Server Components re-query Prisma directly). The original draft specified `revalidateTag`; the codebase consolidated on `router.refresh()` — see project-context.md → "Cache invalidation".
AR10: entitlement-service must always read subscription tier from DB (never trust JWT alone); `checkListingCap(userId)` must be called in every Server Action that creates a JobListing
AR11: vitality-state-machine.ts is the sole permitted writer of vitalityState on JobListing; all other code calls this service — direct Prisma writes to vitalityState are forbidden
AR12: CvSnapshot records are write-once; cv-snapshot-service.ts is the only creator of CvSnapshot records; S3 keys derived from snapshotId are never reused

### UX Design Requirements

UX-DR1: Implement Tailwind v4 @theme CSS variables in globals.css — brand color (indigo-600), surface backgrounds (slate-50/slate-100/slate-900), spacing scale (4px grid), and Inter typeface token; these must match the UX spec design tokens exactly
UX-DR2: Self-host Inter variable font and configure in root layout with `font-display: swap`; apply as the default sans-serif via Tailwind theme
UX-DR3: Implement VitalityBadge component — 8 states (Hot/Active/Cooling/Cold/Deadline/Ghosting/In Dialogue/Closed) each with a distinct emoji, label, and background color; color is never the sole signal (requires label per NFR-A3)
UX-DR4: Implement HealthScoreWidget component — displays coaching zone icon (🟢/🟡/🔴), coaching instruction text with named listings (e.g., "Follow up on Principal Designer (Stripe) today"), and zone color; always visible in dashboard sidebar
UX-DR5: Implement BoardRow component — 56px row height, Server Component outer shell with Client Component wrapper for interactive controls (status change, archive, apply); supports useOptimistic for instant feedback on mutations; each row displays salary range (e.g. "$80k–$120k") and posting date (relative, e.g. "Posted 3 days ago") when available; entire row is clickable and navigates to the listing detail page
UX-DR6: Implement ImportDrawer component — slide-over drawer pattern (no modal) with URL input field as primary path; on scraper failure or incomplete data, surface manual entry form with pre-filled fields inline (no navigation away)
UX-DR7: Implement ApplyRitualDialog component — dialog that surfaces CV version selector, optional notes, optional supporting document upload, and application date; confirm action triggers apply Server Action and CV snapshot creation
UX-DR8: Implement CVVersionSelector component — list of CV versions with name, upload date, file size, and active indicator; supports selecting a version for apply action or management actions (rename, duplicate, restore)
UX-DR9: Implement FilterChipBar component — horizontal chip row for filtering by vitality state, with sort dropdown (date added, company, deadline); connected to keyword search input
UX-DR10: Implement EmptyBoardState component — first-session zero-state with headline, sub-copy, and primary CTA ("Import your first job") that opens ImportDrawer; must not be a blank page
UX-DR11: Implement StalenessBanner component — board-level recency signal displaying last_computed_at timestamp when it is more than 2 hours old; dismissible per session
UX-DR12: Implement ProGatePattern component — consistent upgrade prompt used at all Pro feature surfaces (listing cap, Gmail connect, CV Strength, public profile); single component with configurable headline and CTA copy
UX-DR13: Implement dashboard shell layout — 256px fixed sidebar (left) with "FollowCV" brand name at the top (links back to homepage `/`), navigation links, HealthScoreWidget, and user menu; main content area fills remaining width; layout is the `(dashboard)/layout.tsx` Server Component
UX-DR14: Implement full keyboard navigation for primary flows: URL import (open drawer → paste → confirm), apply action (open dialog → select CV → confirm), board filter, vitality state override — all without requiring a mouse
UX-DR15: Implement desktop-first responsive layout — 1280px is the baseline (no `max-width` clamping); at 768px (md breakpoint) sidebar collapses to icon-only or off-canvas; mobile layout is out of scope
UX-DR16: All UI interactions must be animated purposefully and efficiently. Motion system rules:
  - **Drawer (ImportDrawer):** slides in from the right on open (`translateX(100%) → 0`, 300 ms `cubic-bezier(0.32,0.72,0,1)`); reverses on close. Backdrop fades in/out (280 ms same easing). Implemented via Base UI `data-starting-style` / `data-ending-style` attributes + `.drawer-popup` / `.drawer-backdrop` CSS classes in `globals.css`.
  - **Board rows:** staggered slide-up on page load (`translateY(5px) + opacity:0 → normal`, 240 ms ease-out, 35 ms delay per row, capped at 8 rows). Implemented via `.board-row-animate` CSS class + `--row-index` CSS custom property passed as inline style from the server component.
  - **Sidebar (mobile):** slides in/out via `transition-transform 250 ms cubic-bezier(0.32,0.72,0,1)` on the `<aside>`; overlay fades in via `.sidebar-overlay-enter` CSS animation (200 ms).
  - **General principle:** enter transitions slightly faster than exit; `will-change: transform` on elements that animate; no animation on reduced-motion (add `@media (prefers-reduced-motion: reduce)` guards if needed in future).
  - All animation CSS lives in `src/app/globals.css` in the "App-wide motion system" block (above `@layer base`).

### FR Coverage Map

```
FR1:  Epic 1 — Google OAuth registration
FR2:  Epic 1 — Session management (Auth.js v5, JWT)
FR3:  Epic 1 — Preference setup onboarding
FR4:  Epic 1 — Editable preference profile
FR5:  Epic 1 — Account deletion
FR6:  Epic 7 — User-requested data export (GDPR pipeline)
FR7:  Epic 1 — Revoke Gmail OAuth without data loss
FR8:  Epic 7 — Inactive account auto-flagging (background job)
FR9:  Epic 1 — Admin role-protected auth
FR10: Epic 2 — URL import with JSON-LD extraction + domain capture
FR11: Epic 2 — Duplicate detection on URL import
FR12: Epic 2 — Manual import fallback form
FR13: Epic 2 — Visual distinction: auto vs manually entered
FR14: Epic 2 — Edit any field after import
FR16: Epic 2 — Central board view
FR17: Epic 2 — 8-state vitality computation (state machine)
FR18: Epic 2 — Scheduled background recalculation + retry + DLQ
FR19: Epic 2 — Manual vitality override (persists, visually distinct)
FR20: Epic 2 — Archive listing
FR21: Epic 2 — Filter, sort, keyword search
FR22: Epic 3 — Record application with CV snapshot trigger
FR23: Epic 3 — Manual application status update (taxonomy)
FR24: Epic 3 — Follow-up due detection (7-day configurable threshold)
FR25: Epic 6 — Gmail OAuth connection (Pro)
FR26: Epic 6 — Auto vitality update on employer domain email (Pro)
FR27: Epic 3 — View point-in-time CV snapshot on application record
FR28: Epic 3 — Prevent CV snapshot modification post-apply
FR29: Epic 3 — Notes on applications and listings
FR30: Epic 3 — Upload CV as named, timestamped version
FR31: Epic 3 — View CV version history
FR32: Epic 3 — Restore, duplicate, rename CV version
FR33: Epic 3 — Immutable CV snapshot on apply (write-once, Vercel Blob)
FR34: Epic 3 — CV files via authenticated same-origin proxy (private Vercel Blob store)
FR35: Epic 3 — Free tier CV version cap enforcement
FR40: Epic 4 — Health Score from 5 rule-based indicators
FR41: Epic 4 — 3-zone display (🟢/🟡/🔴) + cascading recalculation
FR42: Epic 4 — Single deterministic coaching action per zone/indicator
FR43: Epic 4 — Auto-update on underlying data changes
FR44: Epic 5 — 25-listing free tier cap
FR45: Epic 5 — Progressive cap warnings (80%, 90%)
FR46: Epic 5 — Contextual upgrade prompt at cap
FR47: Epic 5 — Subscribe, manage, cancel Pro via Stripe
FR48: Epic 5 — Config-driven thresholds (DB-backed, no deploy needed)
FR49: Epic 7 — Scraper health metrics by source
FR50: Epic 7 — Individual import failure logs
FR51: Epic 7 — Platform metrics + user account management
FR52: Epic 7 — Admin-triggered GDPR data export
FR53: Epic 7 — Data export request audit log
FR54: Epic 7 — Users stuck at cap without converting
FR55: Epic 7 — Dead-letter queue visibility in admin
```

## Epic List

### Epic 1: Authentication & Account Setup
Users can access FollowCV securely, complete onboarding preference setup, and manage their account. This epic establishes the entire technical foundation — project init, design system, auth, CI/CD, and observability — so every subsequent epic builds on a live, deployable base.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR7, FR9
**ARs covered:** AR1, AR2, AR3, AR7, AR8
**UX-DRs covered:** UX-DR1, UX-DR2, UX-DR13

### Epic 2: Job Import & Living Board
Users can import job listings by URL and see their board automatically compute and display vitality states — the core product promise — without any manual updates.
**FRs covered:** FR10, FR11, FR12, FR13, FR14, FR16, FR17, FR18, FR19, FR20, FR21
**ARs covered:** AR4, AR9, AR11
**UX-DRs covered:** UX-DR3, UX-DR5, UX-DR6, UX-DR9, UX-DR10, UX-DR11, UX-DR15

### Epic 3: Application Tracking & CV Management
Users can record applications with immutable CV snapshots, track and update application status, manage follow-ups, and maintain a versioned CV history.
**FRs covered:** FR22, FR23, FR24, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35
**ARs covered:** AR5, AR12
**UX-DRs covered:** UX-DR7, UX-DR8, UX-DR14

### Epic 4: Application Health Score
Users see their Application Health Score with a single deterministic coaching action telling them exactly what to do next.
**FRs covered:** FR40, FR41, FR42, FR43
**UX-DRs covered:** UX-DR4

### Epic 5: Freemium & Pro Subscription
Users approaching the listing cap see progressive prompts and can upgrade to Pro via Stripe; the cap is enforced server-side and configurable without a deploy.
**FRs covered:** FR44, FR45, FR46, FR47, FR48
**ARs covered:** AR6, AR10
**UX-DRs covered:** UX-DR12

### Epic 6: Gmail OAuth & Auto-Tracking (Pro Beta)
Pro users can connect Gmail with a clear consent ceremony; the system automatically updates listing vitality state when employer domain emails arrive.
**FRs covered:** FR25, FR26

### Epic 7: Platform Administration & GDPR
Admins can monitor scraper health, manage user accounts, view platform metrics, fulfill GDPR export requests, and observe the dead-letter queue.
**FRs covered:** FR6, FR8, FR49, FR50, FR51, FR52, FR53, FR54, FR55

---

## Epic 1: Authentication & Account Setup

Users can access FollowCV securely, complete onboarding preference setup, and manage their account. This epic establishes the entire technical foundation — project init, design system, auth, CI/CD, and observability — so every subsequent epic builds on a live, deployable base.

### Story 1.1: Project Initialization & Design System Foundation

As a **developer**,
I want the Next.js project initialized with the full design system foundation,
So that every subsequent story builds on a consistent, deployable base with correct tooling.

**Acceptance Criteria:**

**Given** a new empty repository,
**When** the initialization sequence is run,
**Then** `npx create-next-app@latest followcv --typescript --tailwind --eslint --app --src-dir` produces a working Next.js 16 project with Turbopack dev server, TypeScript strict mode, and `src/` directory structure
**And** `npx shadcn@latest init` completes with Tailwind v4 integration and the `src/components/ui/` directory created
**And** `globals.css` contains the Tailwind v4 `@theme` block with all FollowCV design tokens: indigo-600 brand color, slate surface scale, 4px spacing grid
**And** Inter variable font is self-hosted in `public/fonts/` and applied as the default sans-serif via `@theme`
**And** the root `layout.tsx` loads Inter with `font-display: swap` and wraps the app in a `Providers` client component
**And** the dashboard shell layout is implemented as `src/app/(dashboard)/layout.tsx` — 256px fixed left sidebar + fluid main content area — with placeholder nav links and user menu slot
**And** `npm run dev` starts without errors and the landing page renders at `localhost:3000`
**And** GitHub Actions CI workflow runs typecheck, ESLint, and Vitest on every PR with zero initial failures

### Story 1.2: Database Schema & Infrastructure Setup

As a **developer**,
I want the Neon PostgreSQL database connected with the full Prisma schema,
So that all subsequent stories have a typed, migrated data layer to build on.

**Acceptance Criteria:**

**Given** a Neon project is provisioned,
**When** the Prisma schema is initialized,
**Then** `prisma/schema.prisma` defines models: `User`, `PreferenceProfile`, `JobListing`, `Application`, `CvVersion`, `CvSnapshot`, `GmailToken`, `AppConfig`, `ScrapeLog`, `AuditLog`, `DataExportRequest`
**And** the `VitalityState` enum covers all 8 states: `HOT`, `ACTIVE`, `COOLING`, `COLD`, `DEADLINE`, `GHOSTING`, `IN_DIALOGUE`, `CLOSED`
**And** the `SubscriptionTier` enum covers `FREE` and `PRO`
**And** the `User` model includes `lastVisitAt DateTime?` (updated on every dashboard load, used by the per-row recency indicator)
**And** the `JobListing` model includes `stateChangedAt DateTime?` (set by `vitality-state-machine.ts` on every state transition, used to surface rows with recent changes)
**And** `src/lib/db/index.ts` exports a Prisma client singleton safe for Next.js hot-reload
**And** `prisma migrate dev` runs without errors and all tables exist in Neon
**And** the Neon serverless driver (`@neondatabase/serverless`) is configured as the Prisma adapter for serverless function contexts
**And** Sentry is initialized in `instrumentation.ts` and Vercel Analytics is added to `layout.tsx`

### Story 1.3: Google OAuth Authentication

As a **user**,
I want to sign in with my Google account,
So that I can access FollowCV without creating a separate password.

**Acceptance Criteria:**

**Given** a user is on the login page,
**When** they click "Sign in with Google",
**Then** they are redirected through Google OAuth and land on the dashboard after successful authentication
**And** a `User` record is created in the database on first sign-in with `email`, `name`, and `subscriptionTier: FREE`
**And** a JWT session cookie is set (HTTP-only, signed, 30-day sliding expiry)
**And** the session JWT contains `userId`, `email`, `subscriptionTier`, and `gmailConnected: false`
**And** `src/middleware.ts` redirects unauthenticated requests to `/login` for all `(dashboard)` routes
**And** explicit logout invalidates the session immediately and redirects to `/login`
**And** after 24 hours of idle time the session expires and the user is redirected to `/login`
**And** the admin role is enforced via a `role` field on `User`; users with `role: ADMIN` can access `/admin` routes; standard users receive 403

### Story 1.4: Onboarding Preference Setup

As a **new user**,
I want to complete a preference setup form after my first sign-in,
So that the product understands my job search context and can coach me accurately from day one.

**Acceptance Criteria:**

**Given** a user has just authenticated for the first time (no `PreferenceProfile` exists),
**When** they land on the dashboard,
**Then** they are shown the onboarding preference form before the board
**And** the form captures: job function, seniority level, preferred locations (multi-select), work style (remote/hybrid/onsite), and target salary range
**And** submitting the form creates a `PreferenceProfile` record linked to the user
**And** the form is keyboard-navigable (Tab between fields, Enter to submit, Escape to dismiss any dropdowns)
**And** after submission the user lands on the board with a populated `PreferenceProfile`
**And** users who already have a `PreferenceProfile` skip the onboarding form on subsequent logins

### Story 1.5: Account Settings & Profile Management

As a **user**,
I want to view and edit my preference profile and manage my account,
So that I can keep my job search context current and control my data.

**Acceptance Criteria:**

**Given** a user navigates to `/settings`,
**When** the page loads,
**Then** their current `PreferenceProfile` fields are displayed in an editable form
**And** saving changes updates the `PreferenceProfile` record and shows an inline success confirmation
**And** a "Delete account" action is available that requires explicit confirmation ("Type DELETE to confirm")
**And** confirming deletion immediately and permanently deletes the `User` and all associated records (cascade), then redirects to the marketing page
**And** a "Revoke Gmail access" button is present (disabled if Gmail is not connected); clicking it deletes the `GmailToken` record without affecting any job or application data
**And** all settings form interactions are keyboard-navigable

---

## Epic 2: Job Import & Living Board

Users can import job listings by URL and see their board automatically compute and display vitality states — the core product promise — without any manual updates.

### Story 2.1: URL Import with JSON-LD Extraction

As a **user**,
I want to import a job listing by pasting its URL,
So that all listing fields populate automatically without manual typing.

**Acceptance Criteria:**

**Given** a user opens the ImportDrawer and pastes a URL,
**When** they submit,
**Then** the `scraper-service` fetches the page server-side and extracts fields from `@type: JobPosting` JSON-LD structured data: title, company, location, salary range, posting date
**And** the company domain is extracted from the URL and stored on `JobListing.companyDomain` for employer matching
**And** a `ScrapeLog` record is created capturing URL, status (success/partial/fail), fields extracted, and duration
**And** the import completes within 5 seconds; a user-facing error is shown if it exceeds that window
**And** the new listing appears on the board with `vitalityState` computed on creation
**And** auto-imported listings are visually marked with an import-source indicator (FR13)
**And** a duplicate URL (already tracked by this user) is detected before saving and presents a resolution choice: "View existing listing" or "Import as new" (FR11)
**And** the new `JobListing` record is created with `last_computed_at` set to the current timestamp at time of import, so the staleness banner does not show immediately for a freshly imported listing

### Story 2.2: Manual Import Fallback

As a **user**,
I want to manually enter a job listing when URL extraction fails or is incomplete,
So that I can track any role regardless of the job board's technical setup.

**Acceptance Criteria:**

**Given** a URL import returns no structured data or a scraper error,
**When** the ImportDrawer receives the failed result,
**Then** a manual entry form appears inline (no navigation away) pre-filled with whatever was extractable (company name from domain, posting date as today)
**And** the form requires at minimum: job title and company name
**And** submitting the manual form creates a `JobListing` with `importSource: MANUAL`
**And** manually entered listings carry a distinct visual indicator on the board (FR13)
**And** users can also open the manual form directly without attempting a URL import

### Story 2.3: Living Board View

As a **user**,
I want to see all my tracked listings on a central board,
So that I can scan my entire job search pipeline at a glance.

**Acceptance Criteria:**

**Given** a user navigates to `/board`,
**When** the page loads,
**Then** all active (non-archived) `JobListing` records for the user render as `BoardRow` components — 56px row height, showing: company, title, `VitalityBadge`, date added, salary range (when available), and posting date (relative label, when available); each row is a clickable link to `/board/[listingId]`
**And** the board loads within 2 seconds for up to 100 listings (next/cache with `board-{userId}` tag)
**And** the `VitalityBadge` displays each of the 8 vitality states with a distinct emoji, label, and background colour; colour is never the sole signal
**And** a user with zero listings sees the `EmptyBoardState` component with a primary CTA to open ImportDrawer
**And** the `StalenessBanner` is shown when `last_computed_at` for any listing is more than 2 hours old
**And** the layout is desktop-first (1280px baseline); at 768px the sidebar collapses
**And** board rows whose `stateChangedAt > User.lastVisitAt` carry a subtle recency indicator (a coloured dot or "Updated" label) visible until the timestamp is more than 48 hours old; `User.lastVisitAt` is updated on every board page load

### Story 2.4: Vitality State Engine & Background Recalculation

As a **user**,
I want the board to automatically update listing vitality states without my input,
So that I always know which listings need attention when I return.

**Acceptance Criteria:**

**Given** the `vitality-state-machine.ts` service is the sole writer of `vitalityState` on `JobListing`,
**When** a scheduled recalculation runs,
**Then** vitality states transition according to the state machine truth table: `HOT` (posted ≤7 days, no application), `ACTIVE` (applied, awaiting response), `COOLING` (posted 8–21 days), `COLD` (posted >21 days), `DEADLINE` (closing date within 48h), `GHOSTING` (applied >14 days, no response), `IN_DIALOGUE` (email reply detected or manual status), `CLOSED` (listing removed or manually closed)
**And** pg-boss is initialized with the Neon connection and all job types registered in `src/lib/jobs/index.ts` with 3× retry and exponential backoff
**And** a Vercel Cron schedule in `vercel.json` calls `POST /api/jobs/process` at the configured interval to trigger pg-boss polling
**And** failed recalculation jobs after 3 retries are moved to the dead-letter queue
**And** `JobListing.last_computed_at` is updated on every recalculation
**And** direct Prisma writes to `vitalityState` outside `vitality-state-machine.ts` are never introduced

### Story 2.5: Manual Vitality Override & Listing Management

As a **user**,
I want to manually override a listing's vitality state and archive listings I'm done with,
So that I can correct the system when I have information it doesn't.

**Acceptance Criteria:**

**Given** a user clicks the `VitalityBadge` on a `BoardRow`,
**When** they select a different state from the override menu,
**Then** the listing's `vitalityState` is updated via `vitality-state-machine.ts` with `overrideSource: USER` and the new state persists across background recalculations
**And** overridden states are visually distinguished from system-computed states (e.g., lock icon on the badge)
**And** the user can clear an override to return to system-computed state
**And** after selecting a new state, a toast appears with a 30-second "Undo" action; clicking Undo reverts the listing to its previous `vitalityState` value via a compensating Server Action
**And** archiving a listing (FR20) removes it from the active board and sets `archived: true`; archived listings are accessible via a filter toggle
**And** editing any field on a listing (FR14) opens an inline edit form; changes save via Server Action and revalidate the board cache

### Story 2.6: Board Filtering, Sorting & Search

As a **user**,
I want to filter, sort, and search my board,
So that I can quickly find specific listings and focus on what needs attention.

**Acceptance Criteria:**

**Given** a user interacts with the `FilterChipBar`,
**When** they select a vitality state chip,
**Then** the board filters to show only listings matching that state; multiple chips can be active simultaneously
**And** a sort dropdown allows sorting by: date added (default, newest first), company name (A–Z), and deadline (soonest first)
**And** a keyword search input filters listings in real time across title, company, and notes fields
**And** active filters are visually indicated on the chips; a "Clear all" control resets to the default view
**And** filter, sort, and keyword search state is reflected in the URL query string (e.g. `?status=cooling,cold&q=google&sort=date-added`), enabling shareable filtered views and browser back-button navigation; state changes update the URL without a full server round-trip

### Story 2.7: Listing Detail Page

As a **user**,
I want to open a dedicated detail view for any listing,
So that I can see all fields, notes, application history, and CV snapshot in one focused view.

**Acceptance Criteria:**

**Given** a user clicks a `BoardRow` on `/board`,
**When** the listing detail page loads at `/board/[listingId]`,
**Then** the "always visible" core info block shows: title, company, location, salary range (formatted as "$80k–$120k"), posting date, date added, source URL (clickable), and the `VitalityBadge`
**And** below the core info, an accordion (`DetailAccordion`) holds all secondary sections so the view is never overwhelming; sections can be independently expanded or collapsed; the "Why this state?" section is open by default
**And** the "Why this state?" accordion section uses `VitalityExplanation`: skipped rules are hidden entirely; only evaluated rules are shown — "passed" prerequisites rendered as a compact checklist above a visual connector, and the single decisive ("fired") rule rendered as a highlighted conclusion card alongside the `VitalityBadge`; the component lives in `src/components/listing/VitalityExplanation.tsx`
**And** the "Notes" accordion section is shown only when `listing.notes` is non-null
**And** the "Application" accordion section shows application status and applied date when an `Application` record exists; otherwise shows "No application recorded yet" with a future CTA placeholder
**And** additional accordion sections for CV snapshot, timeline, and edit actions can be added in future stories without layout changes
**And** a back link returns the user to `/board`
**And** the page is accessible: all interactive elements reachable by keyboard, heading hierarchy correct, ARIA labels on action buttons

---

## Epic 3: Application Tracking & CV Management

Users can record applications with immutable CV snapshots, track application status, manage follow-ups, and maintain a versioned CV history.

### Story 3.1: CV Upload & Version History

As a **user**,
I want to upload a CV file and give it a name,
So that I have a versioned history of my CVs to choose from when applying.

**Acceptance Criteria:**

**Given** a user navigates to the CV section,
**When** they upload a PDF file (up to 10MB),
**Then** the upload uses Vercel Blob's client-upload flow: the client calls `upload()` from `@vercel/blob/client` against `/api/cv/upload-token` (the route auth-checks and runs the cap check inside `onBeforeGenerateToken` before returning a token) → the browser PUTs the bytes directly to Vercel Blob → the client calls a `confirmCvUpload({ blobUrl, name, fileSize, fileHash })` Server Action which creates the `CvVersion` row with `s3Key = blobUrl`. The `s3Key` column is a misnomer kept from the original R2 draft — it now stores the Vercel Blob URL.
**And** the upload completes without timeout for files up to 10MB
**And** the user is prompted to give the version a name (default: "CV — {date}") before confirming
**And** the `CVVersionSelector` component lists all versions with name, upload date, file size, and an "active" indicator for the most recently uploaded
**And** CV files are served exclusively via the authenticated same-origin proxy at `/api/cv/[id]/file` (Vercel Blob v2 has no browser-usable signed-URL form for private blobs — direct browser navigation returns 403). The proxy auth-checks, ownership-checks, and streams via `get(s3Key, { access: "private" })`. A `?download=1` query flips `Content-Disposition` between `inline` and `attachment`. The blob URL never leaves the server.
**And** free tier users are shown their current version count against the configured cap; uploading when at cap returns `{ data: null, error: "CV version limit reached — upgrade to Pro for unlimited versions" }`

### Story 3.2: CV Version Management

As a **user**,
I want to rename, duplicate, and restore previous CV versions,
So that I can organise my CV history and build on past versions without overwriting them.

**Acceptance Criteria:**

**Given** a user views their `CVVersionSelector`,
**When** they select a version action,
**Then** renaming updates `CvVersion.name` in place; the change is immediate with optimistic UI
**And** duplicating creates a new `CvVersion` record with the same `s3Key` reference and a name of "{original name} (copy)"; the free tier cap is checked before saving
**And** restoring a previous version creates a new `CvVersion` entry (never overwrites the original); the restored version becomes the active selection
**And** deleting a `CvVersion` that has no associated `CvSnapshot` records removes the record; versions referenced by a snapshot cannot be deleted and show a tooltip explaining why

### Story 3.3: Record Application with CV Snapshot

As a **user**,
I want to record an application against a listing with my chosen CV version automatically snapshotted,
So that I always know exactly which CV version a company received.

**Acceptance Criteria:**

**Given** a user opens the `ApplyRitualDialog` from a `BoardRow`,
**When** they complete the apply flow,
**Then** the dialog shows: `CVVersionSelector` (required), application date (default: today), and optional notes. (The original epic also mentioned an optional supporting-document upload; deferred during Story 3.3 — there is no `SupportingDocument` model and no UX detail.)
**And** confirming the apply action calls the `apply-to-job` Server Action which sequences: (1) `cv-snapshot-service.createSnapshot()` reads the source `CvVersion` blob via `get()` and writes a fresh, immutable copy via `put()` to `cv/{userId}/{uuid}.pdf` in Vercel Blob — Vercel Blob v2 has no native server-side `copy()`; (2) creates the `CvSnapshot` row pointing at the new blob URL; (3) creates the `Application` row with FKs to both the `JobListing` and `CvSnapshot`; (4) calls `vitality-state-machine.computeVitalityState()` and updates the listing if the state changed.
**And** the apply action is "atomic enough" via sequenced cleanup (Neon HTTP forbids transactions): if any DB write fails after the blob is written, the orphan blob is `del()`'d and any orphan snapshot row is deleted. Snapshot is created before Application, so the original epic constraint "if snapshot creation fails, Application is not created" is automatically satisfied by the sequence.
**And** the apply flow is fully keyboard-navigable: Tab through fields, Enter to confirm
**And** after the apply action completes the dialog calls `router.refresh()`; the Server Component re-fetches and the `BoardRow` re-renders showing the ACTIVE vitality and the "Applied" indicator. (The original epic mentioned "optimistic" updates; the codebase consolidated on `await action; router.refresh()` across every Board mutation — see project-context.md.)

### Story 3.4: Application Status Management & Notes

As a **user**,
I want to update my application status and add notes to listings and applications,
So that I can track the full history of each opportunity in one place.

**Acceptance Criteria:**

**Given** a user has a listing with a recorded application,
**When** they update the application status,
**Then** a status selector on the listing detail view offers the full taxonomy: Applied, Interviewing, Offer Received, Rejected, Withdrawn, On Hold, Ghosted
**And** selecting a status calls the `manage-listing` Server Action, updates the `Application` record, and revalidates `listing-{listingId}` and `board-{userId}` cache tags
**And** notes can be added or edited on any `JobListing` or `Application` record via an inline free-text field; notes save on blur
**And** all status and note interactions are available via keyboard navigation

### Story 3.5: View Application CV Snapshot

As a **user**,
I want to view the exact CV version attached to any past application,
So that I always know which version a company received, even if my CV has changed since.

**Acceptance Criteria:**

**Given** a user views a listing with a recorded application,
**When** they click "View CV sent",
**Then** the link opens the snapshot in a new tab via the same-origin proxy at `/api/cv/snapshot/[id]/file` (with `?download=1` for the Download variant). The proxy auth-checks via the Application → JobListing → userId join (CvSnapshot has no `userId` column), then streams via `get(s3Key, { access: "private" })`. (The original epic said "pre-signed GET URL"; Vercel Blob v2 has no browser-usable signed-URL form for private blobs, so the proxy is the only viable read path.)
**And** the snapshot file is the immutable point-in-time copy — not the current version of the source CV
**And** `CvSnapshot` records cannot be modified after creation; the schema has no update path and the cv-snapshot-service is the only write site
**And** if the snapshot file is missing from storage, the proxy returns 404 and the UI surfaces "Snapshot unavailable" gracefully rather than a broken link
**And** the application detail view labels the attached file with the version name sent (e.g., "CV sent: Senior Frontend — v3")

### Story 3.6: Follow-up Due Detection

As a **user**,
I want the board to surface listings that need a follow-up,
So that I never let an application go cold because I forgot to chase.

**Acceptance Criteria:**

**Given** a listing is in `Applied` or `IN_DIALOGUE` status with no recorded activity,
**When** 7 days pass since the last activity (configurable via `AppConfig.followUpThresholdDays`),
**Then** the listing is surfaced as "Follow-up due" on the `BoardRow` with a distinct visual indicator
**And** the follow-up detection runs as part of the vitality recalculation background job
**And** the follow-up threshold value is read from the `AppConfig` table at runtime (not hardcoded)
**And** recording any new activity (status update, note, application) resets the follow-up timer

---

## Epic 4: Application Health Score

Users see their Application Health Score with a single deterministic coaching action telling them exactly what to do next.

### Story 4.1: Health Score Engine

As a **user**,
I want the system to compute my Application Health Score from my actual pipeline data,
So that I get an objective read on the state of my job search without having to analyse it myself.

**Acceptance Criteria:**

**Given** a user has job listings and applications in their account,
**When** `health-score-engine.ts` is called with `userId`,
**Then** it evaluates 5 rule-based indicators and returns a `HealthScoreResult` containing: numeric score (0–100), coaching zone (`GREEN` / `YELLOW` / `RED`), active indicator ID, and coaching instruction string
**And** the 5 indicators are:
  - `LOW_PIPELINE_RATIO`: >60% of active listings are in `COLD`, `COOLING`, or `GHOSTING` → "Add fresh listings — your board has too many stale jobs"
  - `LOW_RECENT_ACTIVITY`: fewer than 2 applications recorded in the last 7 days → "Apply to 2 more jobs this week"
  - `HIGH_GHOSTING_DRAG`: >3 listings in `GHOSTING` state → "Archive your ghosted applications"
  - `OVERDUE_FOLLOWUPS`: any listings are "Follow-up due" → "Follow up on {listing title} ({company}) today" (names the specific listing)
  - `STALE_CV`: most recent `CvVersion.uploadedAt` is >30 days ago → "Your CV hasn't been updated in 30+ days — review it"
**And** zone assignment: score ≥70 → `GREEN`, 40–69 → `YELLOW`, <40 → `RED`
**And** when multiple indicators fire, the highest-priority active indicator determines the single coaching instruction (priority order matches the list above)
**And** `health-score-engine.ts` is a pure function with no side effects — it reads data but never writes; it is fully unit-tested with Vitest
**And** the score recomputes whenever `Application`, `JobListing`, or `CvVersion` data changes via Server Actions calling `revalidateTag('health-score-{userId}')`

### Story 4.2: Health Score Widget & Sidebar Display

As a **user**,
I want to see my Health Score and coaching instruction in the sidebar at all times,
So that I always know what to do next without navigating away from the board.

**Acceptance Criteria:**

**Given** a user is on any dashboard page,
**When** the sidebar renders,
**Then** the `HealthScoreWidget` Server Component fetches the user's `HealthScoreResult` and renders: the coaching zone icon (🟢/🟡/🔴) with a colour-matched background, and the coaching instruction text in full
**And** the widget is cached under `health-score-{userId}` and revalidated whenever a Server Action mutates application or listing data
**And** the widget renders server-side and does not add a client-side data fetch to the board load path
**And** if no indicators are active, the widget shows: 🟢 "Your pipeline looks healthy — keep it up"
**And** the `OVERDUE_FOLLOWUPS` instruction names the specific listing: "Follow up on {title} ({company}) today" — never an anonymous count
**And** the widget is legible at 256px sidebar width with no text truncation on standard coaching instruction lengths

---

## Epic 5: Freemium & Pro Subscription

Users approaching the listing cap see progressive prompts and can upgrade to Pro via Stripe; the cap is enforced server-side and configurable without a deploy.

### Story 5.1: Listing Cap Enforcement & Progressive Warnings

As a **user**,
I want to see clear warnings as I approach my listing limit and a contextual upgrade prompt when I reach it,
So that I understand the free tier ceiling and can choose to upgrade at the right moment.

**Acceptance Criteria:**

**Given** `entitlement-service.ts` always reads `subscriptionTier` and cap thresholds from the DB (`AppConfig` table) — never from the JWT alone,
**When** `checkListingCap(userId)` is called before any `JobListing` creation,
**Then** it returns `{ allowed: true }` if the user is below the cap, or `{ allowed: false, reason: string }` if at or over the cap; the Server Action returns the error without saving the listing
**And** the `AppConfig` table holds all configurable thresholds (`listingCapFree`, `followUpThresholdDays`, `cvVersionCapFree`) adjustable by an admin without a code deployment
**And** at 80% of the free cap (20/25 listings) the board shows a non-blocking banner: "You're using 20 of your 25 free listing slots"
**And** at 90% (22/25) the banner upgrades in urgency: "Almost full — 3 slots remaining. Upgrade to Pro for unlimited listings"
**And** when the cap is reached, the `ImportDrawer` blocks submission and renders the `ProGatePattern` component with headline "You've reached 25 tracked listings" and CTA "Upgrade to Pro"
**And** the `ProGatePattern` component is a single reusable component accepting `headline` and `ctaText` props; it is used consistently at every Pro feature surface across the app
**And** Pro users bypass `checkListingCap` entirely; the service short-circuits to `{ allowed: true }` for `subscriptionTier: PRO`

### Story 5.2: Pro Subscription via Stripe

As a **user**,
I want to subscribe to Pro, manage my subscription, and cancel it,
So that I can unlock unlimited listings and Pro features within the product.

**Acceptance Criteria:**

**Given** a user clicks "Upgrade to Pro" from any `ProGatePattern` or the subscription settings page,
**When** they proceed through the Stripe checkout flow,
**Then** a Server Action creates a Stripe Checkout Session and redirects the user to the Stripe-hosted payment page; card data never passes through or is stored by the application
**And** on successful payment, the Stripe webhook (`api/webhooks/stripe/route.ts`) receives `checkout.session.completed`, verifies the signature, and calls `entitlement-service.ts` to update `User.subscriptionTier` to `PRO` in the DB
**And** the Stripe webhook also handles `customer.subscription.updated` and `customer.subscription.deleted`, updating `subscriptionTier` accordingly
**And** the subscription settings page (`/settings/subscription`) displays: current tier, next billing date (for Pro), and a "Cancel subscription" action that schedules downgrade at period end
**And** after tier changes take effect, the next Server Action auth check reflects the updated tier from DB — no stale entitlement decisions from the JWT
**And** a cancelled Pro subscription downgrades to `FREE` at period end; if the user then has more than 25 listings, the board displays all listings read-only with a prompt to archive down to the cap

---

## Epic 6: Gmail OAuth & Auto-Tracking (Pro Beta)

Pro users can connect Gmail with a clear consent ceremony; the system automatically updates listing vitality state when employer domain emails arrive.

### Story 6.1: Gmail OAuth Connection Flow

As a **Pro user**,
I want to connect my Gmail account with a clear explanation of what access I'm granting,
So that I trust the integration and can enable automatic status tracking.

**Acceptance Criteria:**

**Given** a Pro user navigates to `/settings/gmail`,
**When** the page loads,
**Then** the page displays a consent ceremony explaining exactly what access is requested: "FollowCV checks whether you've received replies from companies you've applied to. It never reads email content." with the OAuth scope listed explicitly
**And** clicking "Connect Gmail" initiates the Google OAuth flow with scope `gmail.readonly` only
**And** on successful OAuth callback (`api/oauth/gmail/route.ts`), the access token and refresh token are stored in a new `GmailToken` record with the refresh token encrypted at rest using AES-256-GCM with `GMAIL_TOKEN_ENCRYPTION_KEY`
**And** the user's session JWT `gmailConnected` flag is updated to `true` via `updateSession()`
**And** the settings page reflects "Gmail connected" status with the connected account email and a "Disconnect" button
**And** clicking "Disconnect" deletes the `GmailToken` record, sets `gmailConnected: false` in the JWT, and confirms no job or application data is affected
**And** free tier users see the `ProGatePattern` in place of the connection UI: "Gmail auto-tracking is a Pro feature"
**And** after a Pro user has imported 3 or more listings without connecting Gmail, the sidebar or dashboard surfaces a dismissible prompt — "Connect Gmail to auto-track replies" with a link to `/settings/gmail`; the prompt is not shown again once dismissed or once Gmail is connected

### Story 6.2: Automatic Vitality State Updates from Gmail

As a **Pro user**,
I want the board to automatically update listing status when I receive email replies from employers,
So that I know an application is active without manually checking my inbox.

**Acceptance Criteria:**

**Given** a Pro user has Gmail connected and a `JobListing` with a non-null `companyDomain`,
**When** the `gmail/ingest-signals` pg-boss job runs on its Vercel Cron schedule,
**Then** `gmail-token-service.ts` decrypts the stored refresh token and obtains a fresh access token
**And** `gmail-signal-processor.ts` queries the Gmail API for emails from the listing's `companyDomain` received since the last check timestamp
**And** email content is never read, stored, or logged — only sender domain is checked; the Gmail API response is not persisted beyond the processing window
**And** when a domain match is found, `vitality-state-machine.ts` transitions the listing to `IN_DIALOGUE` (if currently in `ACTIVE`, `COOLING`, `COLD`, or `GHOSTING`)
**And** the transition is recorded in `AuditLog` with `source: GMAIL_SIGNAL` and `timestamp`
**And** if the Gmail access token has expired and the refresh fails (token revoked by user in Google settings), the `GmailToken` record is deleted, `gmailConnected` set to `false`, and the failure is logged to the DLQ without affecting other users' jobs
**And** the ingestion job runs in isolation per user — one user's Gmail failure does not affect any other user's job

---

## Epic 7: Admin Operations & Compliance

Internal tooling for platform health visibility, GDPR obligations, and inactive account cleanup — enabling sustainable operations without manual database intervention.

### Story 7.1: Admin Dashboard — Scraper Health & Import Logs

As an **admin**,
I want to see the status and recent history of all scraper jobs,
So that I can detect failures and investigate import issues without accessing the database directly.

**Acceptance Criteria:**

**Given** an admin navigates to `/admin/scrapers`,
**When** the page loads,
**Then** the page displays a table of all scraper configurations with: scraper name, target platform, last run timestamp, last run status (success / failed / running), and listings imported in last run
**And** clicking a scraper row expands its recent job history (last 20 runs) with: timestamp, status, listings found, listings imported, and error message if failed
**And** all data is sourced from `ScrapeLog` records written by `scraper-service.ts` — no direct DB queries from the UI layer
**And** the `/admin` route tree is protected by a middleware check: `session.user.role === 'ADMIN'`; non-admin users receive a 403 response
**And** the admin role is set directly in the DB (`User.role = 'ADMIN'`); there is no UI for role assignment

### Story 7.2: Admin Dashboard — Platform Metrics & User Management

As an **admin**,
I want to see platform-level usage metrics and basic user management actions,
So that I can monitor growth and handle support requests.

**Acceptance Criteria:**

**Given** an admin navigates to `/admin/dashboard`,
**When** the page loads,
**Then** the page displays key metrics: total registered users, active users (last 30 days), total listings, listings by vitality state (breakdown), Pro subscriber count
**And** navigating to `/admin/users` shows a searchable user table with: email, registration date, subscription tier, listing count, and last active date
**And** an admin can trigger a manual data export for a specific user (calls the same GDPR export pipeline as Story 7.4) and download the resulting JSON file
**And** an admin can deactivate a user account (sets `User.isActive = false`, invalidates sessions); the user sees a "Account suspended" message on next login attempt
**And** all admin actions are logged to `AuditLog` with `source: ADMIN_ACTION`, `adminUserId`, and `targetUserId`
**And** the `/admin/users` table can be filtered to show only users where `listingCount >= listingCapFree AND subscriptionTier = 'FREE'` (users who have hit the free cap without upgrading), sortable by listing count and last active date (FR54)

### Story 7.3: Dead-Letter Queue Visibility

As an **admin**,
I want to see all jobs that have permanently failed (dead-letter queue),
So that I can investigate systemic failures and manually retry or dismiss them.

**Acceptance Criteria:**

**Given** an admin navigates to `/admin/dlq`,
**When** the page loads,
**Then** the page displays all jobs in the pg-boss dead-letter queue with: job name, user ID (if applicable), failure timestamp, error message, and retry count
**And** each DLQ entry has a "Retry" action that re-queues the job with a fresh attempt counter
**And** each DLQ entry has a "Dismiss" action that removes it from the DLQ without retrying (with a confirmation dialog)
**And** the DLQ is sourced from pg-boss's built-in failed job tracking — no additional table is needed
**And** bulk actions are available: "Retry all [job-name]" and "Dismiss all [job-name]" with a count preview before confirmation

### Story 7.4: GDPR Data Export Pipeline

As a **user**,
I want to request a complete export of all my personal data,
So that I can exercise my right to data portability under GDPR.

**Acceptance Criteria:**

**Given** a user navigates to `/settings/account` and clicks "Download my data",
**When** the request is submitted,
**Then** a Server Action enqueues a `gdpr/export` pg-boss job for the authenticated user's ID
**And** the export job (`gdpr-export-processor.ts`) collects: all `JobListing` records, all `CvSnapshot` metadata (not binary content), all `AuditLog` entries, and the `User` profile record (excluding password hash)
**And** the export is assembled as a single JSON file and uploaded to Vercel Blob at `exports/{userId}/{timestamp}.json` (private store, same as CV files)
**And** a download link to a same-origin proxy route (`/api/exports/[id]/file`, auth-scoped to the requesting user, 7-day TTL enforced at the application layer) is emailed to the user's registered address via the notification service
**And** if the export job fails, it is retried up to 3× per the standard pg-boss retry policy; on permanent failure the user receives an email notification to contact support
**And** the user can submit at most one export request per 24-hour window; subsequent requests within the window display: "Your export is being prepared. You'll receive an email with the download link."
**And** when the export job is enqueued, a record is written to `AuditLog` with `source: USER_EXPORT_REQUEST`, `userId`, and `requestedAt` timestamp for GDPR compliance (FR53)

### Story 7.5: Inactive Account Cleanup

As the **platform**,
I want to automatically anonymize data for accounts that have been inactive for an extended period,
So that we minimise data retention and comply with GDPR data minimisation principles.

**Acceptance Criteria:**

**Given** the `gdpr/cleanup-inactive-accounts` Vercel Cron job fires (weekly schedule),
**When** `gdpr-cleanup-processor.ts` runs,
**Then** it identifies all users where `User.lastActiveAt < NOW() - INTERVAL '2 years'` AND `User.subscriptionTier = 'FREE'`
**And** for each identified user: all `JobListing` records are soft-deleted (`deletedAt` timestamp set), all `CvVersion` and `CvSnapshot` blobs in Vercel Blob are deleted (the existing `deleteAccount` cleanup logic is reused — see `src/lib/account/service.ts`), `User.email` is replaced with a hashed placeholder (`sha256(email) + '@anonymised.invalid'`), and `User.isActive` is set to `false`
**And** the user's `GmailToken` (if any) is deleted
**And** each anonymisation is recorded in `AuditLog` with `source: GDPR_CLEANUP` and the count of affected records
**And** Pro users are never subject to automated cleanup regardless of inactivity period
**And** the cleanup processor is idempotent — re-running it on already-anonymised accounts produces no additional changes
