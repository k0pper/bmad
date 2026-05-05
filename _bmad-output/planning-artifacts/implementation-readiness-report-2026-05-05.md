---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
documentsIncluded:
  prd: _bmad-output/planning-artifacts/prd.md
  architecture: _bmad-output/planning-artifacts/architecture.md
  epics: _bmad-output/planning-artifacts/epics.md
  ux: _bmad-output/planning-artifacts/ux-design-specification.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-05
**Project:** FollowCV

---

## PRD Analysis

### Functional Requirements

**User Account Management**
- FR1: Users can register for an account with email/password or an OAuth provider
- FR2: Users can authenticate, maintain, and terminate their session securely
- FR3: New users complete a preference setup step during onboarding that pre-populates their preference profile
- FR4: Users can view and edit their preference profile (job function, seniority, location, work style, salary range) at any time
- FR5: Users can permanently and immediately delete their account and all associated data
- FR6: Users can request a full export of their data (CV files, job records, application history) as a downloadable archive; the export runs asynchronously and is delivered when ready
- FR7: Users can revoke connected OAuth integrations (Gmail) without losing any job or application data
- FR8: The system automatically flags accounts with no login activity for 12 months for deletion, sending a 30-day warning email before deletion executes
- FR9: Admins can authenticate and access administrative functions through a role-protected interface; admin accounts include Pro-tier feature access

**Job Import & Capture**
- FR10: Users can import a job listing by pasting a URL, with fields auto-populated from structured data extracted from the page; the system captures company domain at import time for employer matching
- FR11: When a URL import is attempted for a listing already tracked by the user, the system detects the duplicate and presents a resolution choice before saving
- FR12: Users can import a job listing via a manual entry form when URL extraction is unavailable or returns incomplete data
- FR13: The system visually distinguishes auto-imported listings from manually entered ones
- FR14: Users can edit any field on a job listing after import
- FR15 *(Vision — deferred):* Users can capture job listings from login-walled sources using a browser extension that reads the page client-side

**Living Job Board**
- FR16: Users can view all tracked job listings on a central board
- FR17: The system computes and displays a vitality state for each listing across 8 states (Hot, Active, Cooling, Cold, Deadline, Ghosting, In Dialogue, Closed) without requiring user input, per a pre-defined state machine specification
- FR18: The system recalculates vitality states on an automated background schedule; failed recalculation jobs are retried 3 times with exponential backoff and surfaced as errors in the admin interface after the final failure
- FR19: Users can manually override the computed vitality state of any listing; overrides persist until explicitly cleared and are visually distinguished from system-computed states
- FR20: Users can archive a listing to remove it from the active board
- FR21: Users can filter and sort the board by vitality state, company, date added, and application status; users can search listings by keyword across title, company, and notes

**Application Tracking**
- FR22: Users can record an application against a job listing, capturing application date, the selected CV version, optional supporting documents, and free-text notes; recording triggers an immutable CV snapshot attached to the application record (FR33)
- FR23: Users can manually update a listing's application status using a defined taxonomy: Applied, Interviewing, Offer Received, Rejected, Withdrawn, On Hold, Ghosted
- FR24: The system identifies listings in 'Applied' or 'In Dialogue' status with no recorded activity in the last 7 days and surfaces these as 'Follow-up due' items on the board; the follow-up window threshold is configurable
- FR25: Pro users can connect a Gmail account (read-only) to enable automatic status detection based on employer domain matching
- FR26: The system automatically updates a listing's vitality state when email activity from a matched employer domain is detected (Pro); matching uses the company domain captured at import (FR10)
- FR27: Users can view the exact CV version attached to any past application record; the system retrieves the point-in-time snapshot, not the current version; missing snapshot files are surfaced gracefully
- FR28: The system prevents modification of any CV snapshot after the application action is recorded
- FR29: Users can add, edit, and view free-text notes on any application or job listing record

**CV Management**
- FR30: Users can upload a CV file and save it as a named, timestamped version
- FR31: Users can view the complete history of their saved CV versions
- FR32: Users can restore, duplicate, or rename any previous CV version; restoring a version creates a new version entry and checks the free tier cap before saving
- FR33: When recording an application, the system automatically snapshots and attaches the selected CV version to the application record as an immutable copy stored independently of the source version
- FR34: CV files are served via per-request authenticated access tokens that expire after use; public profile artifacts are stored and served separately; revoking public visibility (FR39) invalidates the public artifact
- FR35: Free tier users can store up to the configured maximum number of CV versions; Pro users have unlimited storage
- FR36 *(Growth/Pro — deferred):* CV Strength Meter — intrinsic quality score with actionable recommendations
- FR37 *(Growth/Pro — deferred):* Skill Gap Indicator — keyword-match comparison between job listing requirements and CV content
- FR38 *(Pro — deferred):* Users can generate a public URL that renders their current CV as a shareable web page
- FR39 *(Pro — deferred):* Users can control the visibility of their public profile URL

**Health Score & Coaching**
- FR40: The system computes an Application Health Score from five rule-based indicators reflecting the user's pipeline state, per a pre-defined scoring formula and threshold specification
- FR41: The health score is displayed as one of three coaching zones (🟢 / 🟡 / 🔴), with zone boundaries defined in the scoring specification; status updates to application records trigger a cascading health score recalculation
- FR42: Each coaching zone surfaces a single deterministic next-action instruction from a pre-defined lookup table keyed by active indicator and zone
- FR43: The health score and coaching instruction update automatically when underlying application or listing data changes

**Subscription & Access Control**
- FR44: Free tier users are capped at a configurable maximum number of active job listings (default: 25)
- FR45: The system surfaces the approaching cap progressively to users before the limit is reached (at 80% and 90% of cap)
- FR46: When a user reaches the listing cap, the system presents a contextual upgrade prompt before blocking the import
- FR47: Users can subscribe to, manage, and cancel the Pro tier from within the product
- FR48: The freemium cap and other configurable thresholds are stored in a runtime config system (database-backed) adjustable by an administrator without requiring a code deployment

**Platform Administration**
- FR49: Admins can view scraper health metrics by source, including success rate and failure type over time, derived from structured per-job import logs
- FR50: Admins can view individual import failure logs (URL, error type, timestamp)
- FR51: Admins can view platform-level metrics (registered users, weekly active users, total CV storage used, free-to-Pro conversion rate) and manage individual user accounts — including account details, per-account usage stats, tier adjustment, suspension, and deletion
- FR52: Admins can trigger a GDPR-compliant data export for any user; the export runs asynchronously, notifies the user on completion, and stores the artifact with a defined retention TTL
- FR53: The system logs all data export requests with timestamps for compliance
- FR54: Admins can identify users who have reached the freemium cap without converting
- FR55: The background job system (vitality recalculation, Gmail polling, data exports) retries failed jobs 3 times with exponential backoff; jobs exceeding the retry limit are routed to a dead-letter queue visible in the admin interface; each job type has a defined timeout
- FR56 *(Growth — deferred):* The system detects behavioral patterns and prompts users to review their preference profile when stated preferences diverge from observed behavior

**Total MVP FRs (Phase 1):** 46 (FR1–FR14, FR16–FR35, FR40–FR55, excluding FR15, FR36–FR39, FR56)

---

### Non-Functional Requirements

**Performance**
- NFR-P1: Job board dashboard loads within 2 seconds for a user with up to 100 active listings on a standard broadband connection
- NFR-P2: URL import (fetch, parse, and save) completes within 5 seconds under normal load; failures surface a user-facing error within the same window
- NFR-P3: Standard CRUD API routes respond within 500ms at the 95th percentile
- NFR-P4: CV file uploads of up to 10MB complete without timeout or data truncation
- NFR-P5: Background vitality recalculation completes for all of a user's active listings within 1 hour of the scheduled trigger

**Security**
- NFR-S1: All data is encrypted in transit (TLS 1.2 minimum) and at rest
- NFR-S2: CV files in object storage are accessible only via per-request authenticated access tokens that expire after use; direct storage bucket access is not exposed publicly
- NFR-S3: Gmail OAuth tokens are encrypted at rest and never exposed to the client
- NFR-S4: Authentication sessions expire after 24 hours of idle time and are invalidated immediately on explicit logout
- NFR-S5: All API routes enforce authentication; unauthenticated requests return 401 without exposing system detail
- NFR-S6: Admin routes enforce role-based access control; standard user credentials cannot access admin functions regardless of URL knowledge
- NFR-S7: Pro subscription payment processing is handled entirely by a PCI-compliant third-party provider; card data never passes through or is stored by the application
- NFR-S8: Gmail OAuth scope is strictly read-only; the application never reads, stores, logs, or transmits the content of any email

**Scalability**
- NFR-SC1: The system supports 5,000 registered users with 25% weekly active concurrency without infrastructure reconfiguration
- NFR-SC2: A single user's board with up to 100 listings meets the 2-second load target (NFR-P1)
- NFR-SC3: The background job queue processes vitality recalculation across 5,000 active users within a 1-hour window without manual intervention
- NFR-SC4: Object storage accommodates up to 100MB of files per user account; aggregate platform storage scales without manual infrastructure intervention

**Reliability**
- NFR-R1: Zero tolerance for data loss on CV versions and application CV snapshots — these are immutable records and must survive any single infrastructure failure
- NFR-R2: Background job failures are retried 3 times with exponential backoff and routed to a dead-letter queue after the final failure; silent failure is not acceptable
- NFR-R3: A scraper failure for one user's import is fully isolated and does not affect any other user's import operations
- NFR-R4: Monthly application uptime target: 99.5% (approximately 3.6 hours downtime tolerance), excluding scheduled maintenance windows communicated in advance

**Accessibility**
- NFR-A1: The primary user flows — job import, board view, apply action, CV upload — are fully navigable via keyboard without a mouse
- NFR-A2: All interactive elements carry accessible labels compatible with common screen readers
- NFR-A3: Vitality states are differentiated by label and/or icon in addition to colour; colour alone is not the sole signal for any state distinction
- NFR-A4: The product is functionally tested on Chrome, Firefox, Safari, and Edge (last 2 major versions each) prior to release

**Total NFRs:** 22 (NFR-P1–P5, NFR-S1–S8, NFR-SC1–SC4, NFR-R1–R4, NFR-A1–A4)

---

### Additional Requirements / Constraints

- **Tech stack fixed:** Next.js (App Router), NextAuth.js, Vercel deployment, pg-boss job queue, S3-compatible storage
- **Vitality state truth table:** Must be a pre-implementation spec artifact before engineering starts (PRD calls this out explicitly)
- **Health score formula & thresholds:** Must be fully specced as a pre-implementation document before engineering starts
- **Coaching copy:** Content design workstream — must be specified separately before engineering
- **CV snapshot edge cases:** Must be specced: user edits CV post-snapshot, selects non-current version to apply with, orphaned snapshots on CV deletion
- **Freemium cap is config-driven:** Default 25; adjustable via database-backed runtime config without deploy
- **Scraper approach:** JSON-LD (`@type: JobPosting`) primary; manual form fallback. No bespoke per-domain extractors in MVP.
- **Gmail OAuth:** Ships at MVP launch as Pro Beta. Scope: sender domain → status rule only. Email content never read or stored.
- **Payment processing:** PCI-compliant third party (Stripe implied). Cards never touch the application.
- **GDPR:** No formal registration required at this stage but privacy best practices apply; privacy policy required at launch.
- **URL health checks:** Referenced in active tracking description but not separately specified as an FR — mechanism not detailed.

---

### PRD Completeness Assessment

The PRD is thorough and well-structured. Key strengths: clear phased scope, explicit deferral decisions, rich constraint documentation, and pre-spec artifacts explicitly called out as prerequisites. Notable gaps for assessment purposes:
1. The **vitality state truth table** is referenced as required but not included — it is a prerequisite for FR17/FR18 implementation
2. The **health score formula, zone boundaries, and coaching lookup table** are referenced as required specs but not included — prerequisite for FR40–FR43
3. **CV version cap (free tier)** for FR35 is mentioned but the specific limit is not defined (only the listing cap of 25 is explicit)
4. **Follow-up window threshold** (FR24) is noted as configurable but no default is specified
5. **Inactive account deletion** (FR8) references a 12-month threshold — this is clear

---

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement (summary) | Epic / Story | Status |
|---|---|---|---|
| FR1 | Register with email/password or OAuth | Epic 1, Story 1.3 | ✓ Covered |
| FR2 | Authenticate, maintain, terminate session securely | Epic 1, Story 1.3 | ✓ Covered |
| FR3 | Preference setup onboarding on first login | Epic 1, Story 1.4 | ✓ Covered |
| FR4 | View and edit preference profile | Epic 1, Story 1.5 | ✓ Covered |
| FR5 | Permanently delete account and all data | Epic 1, Story 1.5 | ✓ Covered |
| FR6 | Request full data export as async downloadable archive | Epic 7, Story 7.4 | ✓ Covered |
| FR7 | Revoke Gmail OAuth without losing job/application data | Epic 1, Story 1.5 | ✓ Covered |
| FR8 | Auto-flag inactive accounts (12 months), 30-day warning email before deletion | Epic 7, Story 7.5 | ⚠️ PARTIAL — see gaps |
| FR9 | Admin auth + role-protected interface | Epic 1, Story 1.3 | ✓ Covered |
| FR10 | URL import + JSON-LD extraction + company domain capture | Epic 2, Story 2.1 | ✓ Covered |
| FR11 | Duplicate URL detection + resolution choice | Epic 2, Story 2.1 | ✓ Covered |
| FR12 | Manual import fallback form | Epic 2, Story 2.2 | ✓ Covered |
| FR13 | Visual distinction: auto-imported vs manually entered | Epic 2, Stories 2.1 & 2.2 | ✓ Covered |
| FR14 | Edit any field on a listing after import | Epic 2, Story 2.5 | ✓ Covered |
| FR16 | Central board view of all tracked listings | Epic 2, Story 2.3 | ✓ Covered |
| FR17 | 8-state vitality computation (rule-based, no user input) | Epic 2, Story 2.4 | ✓ Covered |
| FR18 | Scheduled background recalculation + 3× retry + DLQ on failure | Epic 2, Story 2.4 | ✓ Covered |
| FR19 | Manual vitality override — persists, visually distinct | Epic 2, Story 2.5 | ✓ Covered |
| FR20 | Archive listing from active board | Epic 2, Story 2.5 | ✓ Covered |
| FR21 | Filter by state, sort, keyword search | Epic 2, Story 2.6 | ✓ Covered |
| FR22 | Record application + CV snapshot trigger | Epic 3, Story 3.3 | ✓ Covered |
| FR23 | Manual application status update (full taxonomy) | Epic 3, Story 3.4 | ✓ Covered |
| FR24 | Follow-up due detection — configurable threshold | Epic 3, Story 3.6 | ✓ Covered |
| FR25 | Gmail OAuth connection for Pro users | Epic 6, Story 6.1 | ✓ Covered |
| FR26 | Auto vitality update on employer domain email (Pro) | Epic 6, Story 6.2 | ✓ Covered |
| FR27 | View point-in-time CV snapshot per application | Epic 3, Story 3.5 | ✓ Covered |
| FR28 | Prevent modification of CV snapshot post-apply | Epic 3, Story 3.5 | ✓ Covered |
| FR29 | Notes on applications and listings | Epic 3, Story 3.4 | ✓ Covered |
| FR30 | Upload CV as named, timestamped version | Epic 3, Story 3.1 | ✓ Covered |
| FR31 | View complete CV version history | Epic 3, Story 3.1 | ✓ Covered |
| FR32 | Restore, duplicate, rename CV version | Epic 3, Story 3.2 | ✓ Covered |
| FR33 | Immutable CV snapshot on apply (write-once, independent copy) | Epic 3, Story 3.3 | ✓ Covered |
| FR34 | CV files via expiring authenticated pre-signed tokens | Epic 3, Story 3.1 | ✓ Covered |
| FR35 | Free tier CV version cap enforcement | Epic 3, Stories 3.1 & 3.2 | ✓ Covered |
| FR40 | Health Score computed from 5 rule-based indicators | Epic 4, Story 4.1 | ✓ Covered |
| FR41 | 3-zone display (🟢/🟡/🔴) + cascading recalculation on data changes | Epic 4, Story 4.1 | ✓ Covered |
| FR42 | Single deterministic coaching action per zone/indicator | Epic 4, Stories 4.1 & 4.2 | ✓ Covered |
| FR43 | Health score auto-updates when underlying data changes | Epic 4, Story 4.1 | ✓ Covered |
| FR44 | 25-listing free tier cap (default, configurable) | Epic 5, Story 5.1 | ✓ Covered |
| FR45 | Progressive cap warnings at 80% and 90% | Epic 5, Story 5.1 | ✓ Covered |
| FR46 | Contextual upgrade prompt when cap reached | Epic 5, Story 5.1 | ✓ Covered |
| FR47 | Subscribe, manage, and cancel Pro tier via Stripe | Epic 5, Story 5.2 | ✓ Covered |
| FR48 | Config-driven thresholds in DB-backed runtime config | Epic 5, Story 5.1 | ✓ Covered |
| FR49 | Admin scraper health metrics by source | Epic 7, Story 7.1 | ✓ Covered |
| FR50 | Admin import failure logs (URL, error, timestamp) | Epic 7, Story 7.1 | ✓ Covered |
| FR51 | Platform metrics + user account management (including tier adj, suspension, deletion) | Epic 7, Story 7.2 | ✓ Covered |
| FR52 | Admin-triggered GDPR data export (async, notifies user, TTL) | Epic 7, Stories 7.2 & 7.4 | ✓ Covered |
| FR53 | Data export requests logged with timestamps for compliance | Epic 7, Story 7.4 | ⚠️ PARTIAL — see gaps |
| FR54 | Identify users who reached freemium cap without converting | Epic 7, Story 7.2 | ⚠️ PARTIAL — see gaps |
| FR55 | DLQ visibility in admin interface | Epic 7, Story 7.3 | ✓ Covered |

**Deferred (out of scope for MVP):** FR15, FR36, FR37, FR38, FR39, FR56 — all correctly marked DEFERRED in epics

---

### Missing / Partial Coverage

#### Gap 1 — FR8: Inactive Account Handling (CRITICAL)

**FR8 requires:**
> "The system automatically flags accounts with no login activity for 12 months for deletion, sending a 30-day warning email before deletion executes."

**Story 7.5 implements:**
- 2-year inactivity threshold (not 12 months as specified)
- Free tier users only (PRD makes no tier distinction)
- Immediate anonymization with no warning email sent first
- Anonymization (email hash + soft-delete) rather than account deletion

**Impact:** This is a three-way mismatch:
1. Threshold period: 12 months (PRD) vs 2 years (story)
2. Warning mechanism: 30-day pre-deletion warning email (PRD) → completely absent from story
3. Action: "deletion" (PRD) vs anonymization (story) — the distinction matters for GDPR compliance interpretation
4. Scope: all users (PRD) vs free tier only (story)

**Recommendation:** Story 7.5 requires a complete rewrite of its acceptance criteria to match FR8. The story needs: (a) 12-month threshold, (b) a warning email job that fires 30 days before deletion, (c) clarification of whether "deletion" means hard delete or GDPR-compliant anonymization (should align with the privacy policy and legal review), (d) whether the policy applies to Pro users.

---

#### Gap 2 — FR53: User-Initiated Export Audit Log (MEDIUM)

**FR53 requires:**
> "The system logs all data export requests with timestamps for compliance."

**Story 7.4** enqueues a pg-boss job and emails the user a download link, but its acceptance criteria do not include an explicit audit log entry in `AuditLog` for the user's own self-service export request. Story 7.2 logs admin-triggered exports, but user-initiated exports via Story 7.4 have no explicit AC requiring `AuditLog` write.

**Recommendation:** Add an AC to Story 7.4: "A record is written to `AuditLog` with `source: USER_EXPORT_REQUEST`, `userId`, and `requestedAt` timestamp when the export job is enqueued."

---

#### Gap 3 — FR54: Users Stuck at Cap (LOW)

**FR54 requires:**
> "Admins can identify users who have reached the freemium cap without converting."

**Story 7.2** shows a user table with listing count but has no dedicated filter, view, or report to surface specifically users at the cap limit who have not converted. The data is derivable but the AC doesn't specify it.

**Recommendation:** Add an AC to Story 7.2: "A filterable view (or dashboard metric) shows users where `listingCount >= listingCapFree AND subscriptionTier = 'FREE'`, sortable by listing count and last active date."

---

#### Gap 4 — Model Naming Inconsistency (LOW)

**Story 1.2** defines the Prisma model as `ScrapeLog`.
**Story 7.1** references `ScraperJobLog` records written by `scraper-runner.ts`.

These are the same concept but with different names. This will cause confusion during implementation.

**Recommendation:** Standardize on `ScrapeLog` (matches the Prisma schema definition in Story 1.2) across all stories. Update Story 7.1 accordingly.

---

#### NFR Coverage Note

NFRs are addressed inline within story ACs rather than as dedicated stories — which is appropriate. However, the following NFRs have no explicit acceptance criteria anywhere in the epics:

- **NFR-P3** (CRUD API 500ms p95) — no story references this
- **NFR-P5** (1-hour vitality recalculation window) — Story 2.4 sets up pg-boss but doesn't assert the 1-hour completion window
- **NFR-SC1–SC4** (scalability targets) — no story references these; appropriate for infrastructure/load-testing phase but worth flagging
- **NFR-R4** (99.5% monthly uptime) — no story references this; SLA concern
- **NFR-A4** (browser testing matrix: Chrome, Firefox, Safari, Edge last 2 versions) — no story includes cross-browser test execution in its ACs

---

### Coverage Statistics

- **Total MVP FRs (Phase 1):** 46
- **FRs fully covered in epics:** 42
- **FRs partially covered:** 3 (FR8, FR53, FR54)
- **FRs missing entirely:** 0
- **Deferred FRs correctly excluded:** 6 (FR15, FR36, FR37, FR38, FR39, FR56)
- **Coverage percentage (full + partial):** 100% — but 3 require remediation before implementation
- **Coverage percentage (fully covered only):** 91%

---

## UX Alignment Assessment

### UX Document Status

Found: `ux-design-specification.md` (81 KB, 2026-05-05)

The UX specification is comprehensive and high-quality — covering emotional design, component strategy, journey flows, accessibility, and responsive strategy. It was authored with the PRD as input. The Architecture document also references the UX spec as an input. Overall alignment is strong. However, several material conflicts exist that will produce implementation bugs if not resolved before engineering starts.

---

### UX ↔ PRD Alignment Issues

#### Issue 1 — Onboarding Preference Form: Completely Different Data Captured (CRITICAL)

**PRD FR3 + Story 1.4 require:**
The onboarding form captures: job function, seniority level, preferred locations (multi-select), work style (remote/hybrid/onsite), target salary range. This creates a `PreferenceProfile` record with a "Vision-compatible data model."

**UX spec (Journey 5) specifies:**
Three questions:
1. "How many applications are you typically running at once?" (Fewer than 5 / 5–15 / 15–25+)
2. "How would you describe your current search?" (Exploring / Targeted / Intensive)
3. "What matters most to you in tracking applications?" (Deadlines / Follow-up / CV control / All)

These calibrate "Health score thresholds, Follow-up window default, Coaching language tone" — which is not what the PRD's `PreferenceProfile` model captures.

**Impact:** The `PreferenceProfile` data model is structurally incompatible with the UX journey. Story 1.4 will produce a form that is entirely different from what the UX spec designs. This must be reconciled before engineering. Decision required: which preference model is canonical?

---

#### Issue 2 — Keyword Search Explicitly Excluded from UX (CRITICAL)

**PRD FR21 requires:**
"users can search listings by keyword across title, company, and notes"

**Epic Story 2.6 includes:**
"a keyword search input filters listings in real time across title, company, and notes fields" as an explicit AC.

**UX spec states (Filtering Patterns section):**
*"Search: Not in MVP. The board targets under 25 active listings where scan-based navigation is sufficient. Search is a post-MVP enhancement."*

**Impact:** The UX spec directly contradicts a scoped MVP requirement. Story 2.6 includes it; the UX design does not include any search input component or placement. The implementing developer will have no UX guidance for where or how to place search. Resolution required: either add search to the UX spec (with placement and interaction design) or remove FR21/Story 2.6 AC from MVP scope.

---

#### Issue 3 — CV File Upload Size Limit: 10MB (PRD) vs 25MB (UX) (MEDIUM)

**PRD NFR-P4:** "CV file uploads of up to 10MB complete without timeout or data truncation"
**Epic Story 3.1:** "upload a PDF file (up to 10MB)"
**UX spec Form Patterns:** "Max 25MB per file with inline error on the upload target if exceeded"

**Impact:** The UX spec will produce error copy ("25MB limit exceeded") and validation logic at the wrong threshold. The PRD limit of 10MB is the correct constraint given Vercel's serverless function limits and the direct R2 upload pattern. The UX spec should be updated to 10MB.

---

#### Issue 4 — Health Score Zone Thresholds: Different Values (MEDIUM)

**Epic Story 4.1:**
> "score ≥70 → GREEN, 40–69 → YELLOW, <40 → RED"

**UX spec HealthScoreWidget component:**
> "green (score ≥ 80) · yellow (50–79) · red (< 50)"

**Impact:** These are not aligned. A score of 72 renders green per the story but yellow per the UX widget spec. Since the PRD explicitly calls for a "pre-defined scoring formula and threshold specification" (which hasn't been authored yet), neither document is authoritative — but they contradict each other, meaning the spec artifact is urgently needed before Story 4.1 or 4.2 begins implementation.

---

#### Issue 5 — Apply Action 60-Second Undo Window Not in Story ACs (MEDIUM)

**UX spec (Journey 2 and ApplyRitualDialog component):**
A 60-second undo window surfaces after recording an application. Within the window, undo deletes the snapshot and resets state. After 60 seconds, the snapshot is permanent.

**Epic Story 3.3:** No mention of an undo window. The story treats the apply action as atomic with no post-commit undo capability.

**Impact:** This is a significant UX pattern with real implementation cost — it requires a deferred delete mechanism, snapshot cleanup, and state rollback. If not in the story, it will not be implemented. Decision needed: include undo in Story 3.3, or accept that the apply action is permanent (and remove the undo pattern from the UX spec).

---

#### Issue 6 — Board Filter State Persistence: URL vs Local State (MEDIUM)

**UX spec Navigation Patterns:**
> "Board filter state reflected in URL query string (?status=cooling,cold)"

**Epic Story 2.6 AC:**
> "Filter and sort state is held in `useState` client-side and does not trigger a server round-trip"

**Impact:** These are directly contradictory. URL-based persistence enables shareable filtered views and back-button behavior; local state does not. The implementing developer will be given conflicting instructions. Decision needed: which behavior is canonical for MVP?

---

#### Issue 7 — Staleness Banner Trigger Timing: 6h (UX) vs 2h (epics AR) (LOW)

**UX spec StalenessBanner + Journey 3:**
Banner triggers when `last_computed_at` > 6 hours old.

**Epics UX-DR11:**
"displaying last_computed_at timestamp when it is more than 2 hours old"

**Impact:** Minor inconsistency but will produce conflicting implementation. The UX design requirement in the epics (2 hours) and the UX spec itself (6 hours) disagree. Needs alignment before Story 2.3 implementation.

---

#### Issue 8 — Gmail OAuth Proactive Prompt Trigger Not in Any Story (LOW)

**UX spec Journey 4:**
The Gmail prompt surfaces proactively "After 3+ imports OR health drops to Yellow for first time" — appearing in the sidebar below the health widget, not requiring navigation.

**Epic Story 6.1:**
Only describes `/settings/gmail` as the user-navigated connection page. No proactive in-app prompt triggering logic exists in any story.

**Impact:** The UX's highest-retention feature — the contextual Gmail prompt appearing at the right moment — has no implementation path. If not added to a story, the Gmail connection will only be discoverable via settings navigation. This undermines the UX's "Gmail as the primary return hook" design strategy.

---

#### Issue 9 — 30-Second Undo for State Override Not in Story ACs (LOW)

**UX spec VitalityBadge component:**
State override dropdown closes with "a toast confirms with 30-second undo"

**Epic Story 2.5:**
No undo window for manual state overrides. Overrides are immediate and persist until explicitly cleared.

**Impact:** Low-stakes but the UX spec will create a user expectation that overrides are undoable within 30 seconds. Not meeting this expectation is not critical but worth noting.

---

#### Issue 10 — Recency Indicator on Board Rows Not Explicitly in Story ACs (LOW)

**UX spec (Stale Board Return journey + BoardRow component):**
Rows whose state changed since the user's last visit carry a subtle recency indicator (dot or "Updated" label, visible for 48 hours after change). This requires storing `lastVisitAt` per user and comparing against `stateChangedAt` per listing.

**Epic Story 2.3 and 2.4:**
The `StalenessBanner` is mentioned but no per-row recency indicator is in any story AC.

**Impact:** This requires `User.lastVisitAt` timestamp and per-listing change tracking — non-trivial implementation scope. If not in a story, it will not be built.

---

### UX ↔ Architecture Alignment Issues

#### Issue 11 — Tailwind Version: UX Spec Says v3, Architecture Selects v4 (MEDIUM)

**UX spec Design System section:**
> "shadcn/ui + Tailwind CSS v3, built on Radix UI primitives"

**Architecture doc:**
> "Tailwind CSS v4 (CSS-based @theme configuration — no tailwind.config.js)"
> "All technology choices are mutually compatible. Next.js 16 + … + Tailwind v4 + shadcn/ui"

**Epics UX-DR1:**
"Implement Tailwind v4 @theme CSS variables in globals.css"

**Impact:** Tailwind v4 uses a CSS-based `@theme` block instead of `tailwind.config.js`. The UX spec's design tokens are defined as CSS custom properties (e.g., `--brand`, `--surface`), which is compatible with v4. However, the UX spec's component implementation guidance references Tailwind v3 patterns (e.g., `tailwind.config.js` for `@theme` extension). Implementers must use v4 syntax. The UX spec should be updated to reference v4 to avoid confusion.

---

#### Issue 12 — Architecture Fully Supports UX Requirements (CONFIRMATION)

All major UX architectural needs are met by the architecture:
- Server Components + `revalidateTag` → board self-update experience ✓
- `useOptimistic` → instant board feedback on mutations ✓
- Radix UI via shadcn/ui → keyboard nav + screen reader support ✓
- Pre-signed R2 URLs → CV file delivery ✓
- pg-boss → background vitality recalculation, staleness detection ✓
- Direct R2 upload pattern → resolves Vercel 4.5MB limit for CV uploads ✓
- Vercel Cron → triggers background jobs including Gmail ingestion ✓

---

### Summary of UX Alignment Issues

| # | Issue | Severity | Blocking? |
|---|---|---|---|
| 1 | Onboarding form: incompatible data models (PRD vs UX) | CRITICAL | Yes — must decide before Story 1.4 |
| 2 | Search excluded from UX spec but required by FR21/Story 2.6 | CRITICAL | Yes — must add UX design before Story 2.6 |
| 3 | CV file size: 25MB (UX) vs 10MB (PRD/Epics) | MEDIUM | Yes — will produce wrong validation |
| 4 | Health score zone thresholds differ between UX spec and Story 4.1 | MEDIUM | Yes — scoring spec must be authored first |
| 5 | 60-second undo for apply action not in Story 3.3 | MEDIUM | Decision needed before Story 3.3 |
| 6 | Board filter: URL query string (UX) vs useState (Story 2.6) | MEDIUM | Yes — conflicting instructions |
| 7 | Staleness banner timing: 6h (UX) vs 2h (epics AR) | LOW | No — needs alignment |
| 8 | Gmail proactive prompt trigger has no implementation story | LOW | No — undermines UX retention design |
| 9 | 30s undo for state override not in Story 2.5 | LOW | No |
| 10 | Per-row recency indicator not in any story AC | LOW | No — requires `lastVisitAt` infrastructure |
| 11 | Tailwind version: UX spec references v3, architecture uses v4 | MEDIUM | No — v4 @theme tokens are compatible; documentation clarity only |

---

## Epic Quality Review

### Review Against create-epics-and-stories Standards

All 7 epics and their 24 stories have been reviewed against best practices for user value focus, epic independence, story sizing, dependency ordering, and AC quality.

---

### 🔴 Critical Violations

#### Violation 1 — Stories 1.1 and 1.2 Are Technical Stories with No User Value

**Story 1.1 — "Project Initialization & Design System Foundation"**
- User persona: "As a **developer**"
- Value: Project initialized, GitHub Actions CI runs, dev server starts
- This is pure developer infrastructure. No user can benefit from this story being complete.

**Story 1.2 — "Database Schema & Infrastructure Setup"**
- User persona: "As a **developer**"
- Value: Prisma schema defined, tables migrated, Sentry initialized
- This is pure technical infrastructure. No user benefit until later stories build on it.

**Assessment:** By strict epic best practices, both stories violate the "user value" principle. The "developer" persona is acceptable only if the developer's outcome enables immediate user-facing capability — here it does not.

**Context / Mitigation:** This is a greenfield project and the architecture explicitly calls for these as the first implementation steps (AR1–AR3, AR7–AR8). The approach is pragmatic. However, the violation should be acknowledged. If the team applies the "user value" standard rigidly, these should be framed as pre-sprint foundation work or tagged as `[FOUNDATION]` to distinguish them from user stories.

**Recommendation:** Accept pragmatically for greenfield but tag as `[FOUNDATION]` stories to signal they are infrastructure prerequisites, not product features.

---

#### Violation 2 — Story 1.2 Creates All Database Tables Upfront (Violates JIT Schema Principle)

Story 1.2 defines the complete Prisma schema in one story, including all models used by Epics 2–7:
`User`, `PreferenceProfile`, `JobListing`, `Application`, `CvVersion`, `CvSnapshot`, `GmailToken`, `AppConfig`, `ScrapeLog`, `AuditLog`, `DataExportRequest`

The `create-epics-and-stories` best practice requires tables to be created only when first needed by a story — not all upfront.

**Impact:** The developer implementing Story 1.2 will write a large schema they cannot fully verify against any UI or business logic. Schema errors (wrong field names, missing relations, wrong enum values) will only surface when Epics 2–7 stories are implemented — at which point the migration history may be complex to unwind.

**Context / Mitigation:** Prisma's migration model is inherently single-file-per-migration. Creating incremental migrations per story is architecturally sound but operationally more complex. The architecture explicitly chose the full upfront schema to enable TypeScript type safety throughout. The risk of schema drift is real but the type-safety benefit is also real.

**Recommendation:** Accept as an architectural trade-off for type-safety, but document that Story 1.2's schema should be reviewed against Story 2.1 through 7.5 requirements before merging, and add a CI check that verifies schema consistency.

---

### 🟠 Major Issues

#### Issue 3 — Vitality State Truth Table Is Embedded in Story ACs, Not a Separate Pre-Spec Artifact

The PRD explicitly states: *"The Living Job Board — 8 computed vitality states... State transition logic must be fully specced as a truth table before implementation."*

Story 2.4 embeds the state transition rules inline in its acceptance criteria:
- `HOT` = posted ≤7 days, no application
- `ACTIVE` = applied, awaiting response
- `COOLING` = posted 8–21 days
- `COLD` = posted >21 days
- `DEADLINE` = closing date within 48h
- `GHOSTING` = applied >14 days, no response
- `IN_DIALOGUE` = email reply detected or manual status
- `CLOSED` = listing removed or manually closed

**Issues with this approach:**
1. The state machine has ambiguous overlap cases not addressed:
   - A listing posted 5 days ago with an application — is it `HOT` (≤7 days no application) or `ACTIVE` (applied)? `ACTIVE` takes precedence? The priority rules between states are not specified.
   - A listing posted 10 days ago (would be `COOLING`) with an application (would be `ACTIVE`) — which wins?
   - A listing in `COOLING` where the closing date is within 48h — does it become `DEADLINE`?
2. The PRD called for a separate truth table artifact precisely to force these edge cases to be resolved before implementation. Story ACs are not the right place for a state machine specification.

**Recommendation:** Before Story 2.4 implementation, author a standalone vitality state truth table document that addresses priority ordering when multiple rules apply, and add it to the planning artifacts. Story 2.4's ACs can then reference it.

---

#### Issue 4 — Health Score Formula Is Embedded in Story ACs, Not a Separate Pre-Spec Artifact

Same issue as Violation 3, but for the health score:

The PRD says: *"The health score and coaching instruction update automatically... per a pre-defined scoring formula and threshold specification."*

Story 4.1 embeds the formula inline:
- 5 specific indicator rules with exact thresholds
- Zone boundaries: ≥70 → GREEN, 40–69 → YELLOW, <40 → RED
- Coaching copy strings
- Priority ordering of indicators

**Issue:** The coaching copy strings are embedded in the AC ("Add fresh listings — your board has too many stale jobs"). The PRD calls coaching copy a "content design workstream — spec separately before engineering." The copy is in Story 4.1's ACs rather than a dedicated content document.

Additionally, the embedded zone thresholds (≥70 GREEN) conflict with the UX spec (≥80 GREEN), as already noted. Since neither is from the formally-required spec artifact, neither is authoritative.

**Recommendation:** Author the health score formula and threshold specification, and coaching copy lookup table, as a separate planning artifact before Story 4.1 begins. The conflict with the UX spec zone thresholds must be resolved in that document.

---

#### Issue 5 — Story 7.5 Has No Story for the 30-Day Warning Email (FR8 Gap)

Already documented in Epic Coverage Validation (Gap 1). Repeating for completeness in the quality review. Story 7.5 implements anonymization without any pre-deletion warning email mechanism. The 30-day warning email is a user-facing feature requiring its own notification pipeline (email template, scheduling logic, user record flagging) — it is missing entirely from the epic breakdown.

---

### 🟡 Minor Concerns

#### Concern 6 — Epic 1 Title Partially Technical

"Foundation & Authentication" — the "Foundation" label signals a technical milestone rather than a user outcome. The description compensates with user-centric language: "Users can access FollowCV securely, complete onboarding preference setup, and manage their account." But the title could be strengthened to: "Authentication & Account Setup" — removing the technical framing and focusing purely on user capability.

---

#### Concern 7 — `last_computed_at` Initial Value Not Specified

Story 2.4 updates `JobListing.last_computed_at` on every recalculation. The `StalenessBanner` in Story 2.3 triggers when this timestamp is more than 2 hours old (per epics UX-DR11).

**Edge case:** When a new listing is imported (Story 2.1), `vitalityState` is computed at creation time. But what value is set for `last_computed_at`? If it defaults to `null` or epoch, the staleness banner will show immediately for every new listing. If it defaults to `createdAt`, the banner won't appear for 2 hours — which is correct.

**Neither story 2.1 nor 2.4** specifies the initial `last_computed_at` value on `JobListing` creation. This is an edge case that will produce an incorrect UX on first import.

**Recommendation:** Add to Story 2.1's ACs: "The new `JobListing` record is created with `last_computed_at` set to the current timestamp at time of import."

---

#### Concern 8 — No Story Covers the Listing Detail Page

The PRD rendering strategy explicitly shows `/jobs/[id]` as a route. The architecture's project structure shows `board/` directory for board-level components but no `jobs/[id]` page in the structure. Story 3.4 (Application Status Management) references "the listing detail view" — implying a dedicated page exists — but no story explicitly builds this page.

**Impact:** A developer implementing Story 3.4 will need to build the listing detail page as part of the story, but it has no explicit acceptance criteria. This is a hidden implementation gap.

**Recommendation:** Add a brief story or expand Story 2.3 or 3.4 to explicitly cover the listing detail page (`/board/[listingId]`) with its layout, components, and navigation.

---

#### Concern 9 — Epic 3 Ordering: CV Upload (3.1) Before Application Recording (3.3) Is Correct But Narrative Is Non-Obvious

Story 3.1 (CV Upload) must precede Story 3.3 (Record Application) because 3.3 requires at least one CV version to exist. This ordering is correct but the dependency is not explicitly stated.

Story 3.3 says "Given a user opens the ApplyRitualDialog from a BoardRow" — which assumes Story 2.3 (the board) is complete. This cross-epic dependency is fine (Epic 3 follows Epic 2) but is worth flagging for documentation clarity.

---

### Epic Quality Checklist Results

| Epic | Delivers User Value | Independent | Stories Sized | No Fwd Deps | AC Quality |
|---|---|---|---|---|---|
| Epic 1 | ⚠️ Partial (Stories 1.1, 1.2 are technical) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Good |
| Epic 2 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ State machine spec embedded |
| Epic 3 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Good |
| Epic 4 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Scoring spec embedded |
| Epic 5 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Good |
| Epic 6 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Good |
| Epic 7 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Story 7.5 mismatch with FR8 |

**Greenfield / Brownfield Check:** Epic 1 Story 1.1 correctly implements the "initialize from starter template" pattern required by the architecture document. ✅

**Starter Template Check:** Story 1.1 includes `npx create-next-app@latest followcv` as the initialization command, exactly as specified in the architecture doc. ✅


---

## Summary and Recommendations

### Overall Readiness Status

## ✅ READY FOR IMPLEMENTATION

All 6 blocking issues and all 12 should-resolve issues have been addressed. The two required pre-implementation spec artifacts have been authored. The planning suite is complete and internally consistent — implementation can begin with Epic 1.

---

### Resolution Log

All issues identified in this report were resolved on 2026-05-05 via the IR fix pass. Decisions were made by the product owner and applied to all affected artifacts.

---

**BLOCKER 1 — RESOLVED: Onboarding Preference Form**

Decision 1A selected: UX spec Journey 5 updated to capture the 5 PRD fields (job function, seniority, location, work style, salary range). Story 1.4 ACs were already aligned with the PRD model; no change needed.

---

**BLOCKER 2 — RESOLVED: Keyword Search in MVP**

Decision 2A selected: Keyword search is in MVP scope. UX spec updated to include keyword search input alongside the filter chip row. Story 2.6 ACs already included keyword search; confirmed consistent.

---

**BLOCKER 3 — RESOLVED: Vitality State Truth Table**

`vitality-state-machine-spec.md` authored with: all 8 state definitions, 11-rule priority-ordered evaluation table, side effect specification, override behaviour, Gmail signal integration, and prohibited patterns.

---

**BLOCKER 4 — RESOLVED: Health Score Specification**

`health-score-spec.md` authored with: zone thresholds (≥70 GREEN / 40–69 YELLOW / <40 RED), 5 weighted indicator formulas with exact value tables, deterministic coaching instruction lookup table with template variables, computation timing, and edge cases. UX spec `HealthScoreWidget` states updated to match (was: ≥80 GREEN).

---

**BLOCKER 5 — RESOLVED: FR8 Inactive Account Policy**

Decision: 24-month threshold, free tier only, anonymize (not delete), no warning email. PRD FR8, epics requirements inventory, and Story 7.5 all updated to match.

---

**BLOCKER 6 — RESOLVED: Board Filter State Persistence**

Decision 3A selected: URL query string. Story 2.6 AC updated. UX spec filtering patterns updated to describe URL-reflected state.

---

### Should-Resolve Issues — All Resolved

| Priority | Issue | Resolution |
|---|---|---|
| HIGH | Apply action undo window — no AC | Decision 4B: apply is permanent. UX spec apply flow updated (undo branch removed). Story 3.3 note added. |
| HIGH | No listing detail page story | Story 2.7 added: `/board/[listingId]` page with full listing, application detail, CV snapshot CTA, and back-navigation. |
| HIGH | `last_computed_at` initial value not specified | Story 2.1 AC added: `last_computed_at` set to import timestamp so staleness banner does not fire immediately. |
| MEDIUM | CV file size: 25MB (UX) vs 10MB | UX spec updated to 10MB throughout (4 occurrences). |
| MEDIUM | FR53 audit log not in Story 7.4 | AC added to Story 7.4 for `AuditLog` write on export request. |
| MEDIUM | FR54 admin cap-hit filter not in Story 7.2 | AC added to Story 7.2 for cap-hit user filter with sort. |
| MEDIUM | Tailwind v3 in UX spec | UX spec updated to Tailwind CSS v4 throughout. |
| LOW | Staleness banner 6h (UX) vs 2h (epics) | UX spec updated to 2 hours throughout (4 occurrences). |
| LOW | Gmail proactive prompt not in any story | AC added to Story 6.1: dismissible prompt after 3+ imports without Gmail connected. |
| LOW | `ScraperJobLog` vs `ScrapeLog` naming | Standardized to `ScrapeLog` in Story 7.1. |
| LOW | 30-second undo for state override not in Story 2.5 | AC added to Story 2.5. |
| LOW | Per-row recency indicator not in any story | AC added to Story 2.3; `lastVisitAt` and `stateChangedAt` fields added to Story 1.2 schema. |

---

### Pre-Implementation Artifacts — Both Authored

1. **[`vitality-state-machine-spec.md`](vitality-state-machine-spec.md)** — Complete state machine truth table. Required before Story 2.4. ✅
2. **[`health-score-spec.md`](health-score-spec.md)** — Health score formula and coaching instruction lookup table. Required before Story 4.1. ✅

---

### Issues Summary by Category

| Category | Critical | Major | Minor | Total |
|---|---|---|---|---|
| Epic Coverage (FR traceability) | 1 (FR8) | 2 (FR53, FR54) | 2 (naming, NFR coverage) | 5 |
| UX ↔ PRD Alignment | 2 (onboarding, search) | 4 (size, thresholds, undo, filter) | 5 (timing, Gmail, undo, recency, Tailwind) | 11 |
| Epic Quality | 2 (tech stories, upfront schema) | 3 (truth table, scoring spec, FR8 story) | 3 (title, initial value, detail page) | 8 |
| **Total** | **5** | **9** | **10** | **24** |

---

### Final Note

This assessment identified **24 issues** across **3 categories**. Six are blocking and must be resolved before implementation begins. The remaining issues range from high-priority (should be resolved before the relevant story starts) to low-priority (quality improvements).

The planning quality is high overall. The architecture is thorough, the epic decomposition is sound, and the story acceptance criteria are specific and testable throughout. The gaps are concentrated in known risk areas (state machine, health score, inactive account handling) that the PRD itself called out as requiring upfront specification work — work that has not yet been completed.

**Immediate next steps:**
1. Author `vitality-state-machine-spec.md` — resolve priority ordering for state overlaps
2. Author `health-score-spec.md` — resolve zone threshold conflict, complete coaching copy table
3. Resolve the onboarding preference form data model (UX vs PRD)
4. Decide search in-MVP vs deferred, update both UX spec and Story 2.6
5. Rewrite Story 7.5 to implement FR8 correctly (12-month threshold, 30-day warning email)
6. Resolve board filter state persistence (URL vs local state)

*Assessment generated: 2026-05-05*
*Assessor: FollowCV Implementation Readiness Review (BMad)*
