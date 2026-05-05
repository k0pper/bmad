---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish"]
releaseMode: phased
classification:
  projectType: "web_app"
  domain: "Job Search Workflow Automation"
  complexity: "medium"
  projectContext: "greenfield"
  complexityNote: "Simple interaction model; complexity concentrates in vitality state machine and Gmail-driven status inference"
  freeCapAssumption: "25 jobs — to be validated"
inputDocuments:
  - "_bmad-output/brainstorming/brainstorming-session-2026-05-04-1200.md"
workflowType: 'prd'
briefCount: 0
researchCount: 0
brainstormingCount: 1
projectDocsCount: 0
---

# Product Requirements Document — FollowCV

**Author:** Alex
**Date:** 2026-05-04

## Executive Summary

**FollowCV** is a personal web application for the deliberate job hunter — a professional running a structured search across 10–20 roles simultaneously who told themselves *"I'll track this properly this time"* and needs a system that holds up past week two. The product addresses a single core failure: job hunting is a pipeline problem that every existing tool treats as a filing problem. Most trackers are passive dashboards for manually-logged data. FollowCV is an active tracking system — the board self-diagnoses, the CV versions itself, and the health score tells you exactly what to do next.

The MVP delivers three capabilities: automatic job listing import via URL scraping with JSON-LD structured data extraction (paste a URL, all fields populate); a living job board where every listing computes its own vitality status across 8 freshness states (🔥 Hot → ✅ Active → 🌡️ Cooling → 🧊 Cold → ⏰ Deadline → 👻 Ghosting → 💬 In Dialogue → 🪦 Closed) without user input; and full CV version control with immutable snapshots attached to each application — so the user always knows exactly which version a company received.

The Application Health Score surfaces job hunt state as a coaching zone (🟢 / 🟡 / 🔴) with a single deterministic action per state. Each of the five rule-based indicators fires a specific instruction: low active pipeline ratio → *"Add fresh listings — your board has too many stale jobs"*; low recent activity → *"Apply to 2 more jobs this week"*; high ghosting drag → *"Archive your ghosted applications"*; overdue follow-ups → *"Follow up on [X] applications today"*; stale CV → *"Your CV hasn't been updated in 30+ days — review it."* No ambiguity, no judgment — one clear next action.

Monetization is freemium. The free tier covers the complete core loop. The upgrade trigger is reaching **25 tracked listings** — the natural ceiling for a deliberate job hunter mid-campaign. Pro unlocks at that moment: unlimited listings and CV versions, Gmail OAuth Pro Beta (read-only sender domain matching for automatic status updates, available from day one), CV Strength Meter, Skill Gap Indicator, and a public profile URL. No AI dependency in the MVP; all intelligence is rule-based.

### What Makes This Special

The board knows when listings go cold, when applications go dark, and when the pipeline needs attention — without being told. The CV is versioned like code, solving the silent problem of not knowing which version a company received. The health score coaches without judging, giving one deterministic action instead of a performance grade.

**Pitch:** *"Your spreadsheet tracks what you tell it. This tracks what actually happens — so you spend your time applying, not maintaining."*

### Project Classification

- **Type:** Web Application (SPA, freemium B2C)
- **Domain:** Job Search Workflow Automation
- **Complexity:** Medium — interaction model is simple; complexity concentrates in the vitality state machine and Gmail-driven status inference
- **Context:** Greenfield

## Success Criteria

### User Success

- User completes onboarding (preference setup + first job import) within their first session
- User imports their first job within 5 minutes of signup — the moment the product proves itself
- User returns to the app within 7 days of signup
- Health score improves over a 2-week period as a direct result of user-initiated actions (not penalised for silence outside their control)

### Business Success

**3 months — Proof of concept:**
- 500 registered users
- 15% of registered users active at least once per week
- 5% free-to-Pro conversion rate

**12 months — Proof of business:**
- 5,000 registered users
- 25% of registered users active at least once per week
- 10% free-to-Pro conversion rate
- Pro monthly churn under 15%
- 70% of month-1 users still active in month 3 (cohort retention)

### Technical Success

- URL scraping succeeds ≥80% of the time across supported job boards
- Vitality state transitions compute correctly within 1 hour of trigger — false positive rate <5%
- Gmail domain matching captures ≥95% of emails from matched domains within 24 hours
- Core board loads in under 2 seconds on a standard connection
- Zero data loss on CV versions and application snapshots
- ≥70% of test users can log and track 5 jobs to interview stage without confusion or help

### Measurable Outcomes

The product succeeds when a deliberate job hunter can run a full 10–20 application campaign without maintaining a spreadsheet, with a board that stays accurate without their input and a health score that coaches them on the one action that moves the needle.

## Product Scope

### MVP — Phase 1

- Secure multi-user authentication
- Smart Job Import — JSON-LD extraction + manual fallback (no bespoke per-domain extractors)
- Living Job Board — 8 computed vitality states (rule-based, no user input required)
- Application Health Score — 5 rule-based indicators, 🟢/🟡/🔴 coaching zone with deterministic action
- CV Version History — timestamped, user-named snapshots
- CV Snapshot per Application — immutable record at apply moment
- Preference Form Onboarding — structured preference capture
- Editable Preference Profile
- Job listing search and filter
- Notes per application
- Duplicate detection on URL import
- Gmail OAuth — Pro Beta, read-only sender domain matching (ships at launch)
- Freemium enforcement — config-driven listing cap (default: 25)

### Growth Features — Phase 2 (Pro Tier)

- Unlimited listings and CV versions
- CV Strength Meter — intrinsic CV quality scoring
- Skill Gap Indicator — rule-based keyword matching between job description and CV
- Public Profile URL — CV as shareable webpage
- Preference-driven swipe onboarding (replaces form once Taste Engine data model is ready)
- In-app notification delivery
- Behavioral preference feedback — system detects drift and prompts profile updates
- Bespoke per-domain scraper extractors (prioritised by MVP usage data)

### Vision — Phase 3

- AI Taste Engine — passive preference learning from implicit behavior
- AI Assist Layer — match explanations, CV tailoring hints, industry-aware wait times
- LinkedIn Browser Extension — DOM-based import for login-walled listings
- Additional email provider integrations (Outlook, Apple Mail)
- Mobile application
- Contact/recruiter relationship tracking
- CSV import from spreadsheets / competitors

## User Journeys

### Journey 1: Marcus — The Deliberate Job Hunter (Success Path)

**Opening Scene**
Marcus is a 31-year-old frontend developer, four years into his current role. He's not desperate — he's strategic. He's been saving job listings to his browser bookmarks for six weeks. There are 23 of them. He opened a Google Sheet to track them once, added three rows, and closed it. Tonight he finds FollowCV.

**Rising Action**
He signs up in under a minute. The onboarding presents a short preference form — remote or hybrid, startup or scale-up, IC or lead, target salary range. It takes two minutes. His preference profile exists. He pastes the URL of the first job he saved weeks ago — a Berlin-based startup. In four seconds: title, company, location, salary range, and posting date populate automatically. Status: 🌡️ Cooling — it was posted 18 days ago. He imports six more. Two are 🧊 Cold. One is already 🪦 Closed. He would never have known. He archives the dead ones. His board has eight live listings and it took him twelve minutes.

**Climax**
Five days later Marcus opens the app before his morning coffee. He hasn't touched it since setup. His health score has dropped from 🟢 to 🟡. The coaching action reads: *"Two applications are overdue for follow-up — act today."* One of the 🔥 Hot listings has moved to ⏰ Deadline — closing in 36 hours. He spends 20 minutes writing a follow-up email and submitting the deadline application. He attaches his CV — the system snapshots which version he sent. He doesn't need to remember.

**Resolution**
Three days later one of his follow-ups gets a reply. Status auto-updates to 💬 In Dialogue. His health score returns to 🟢. Six weeks later Marcus accepts an offer. He used 19 of his 25 free listing slots. He never opened a spreadsheet.

**Capabilities revealed:** URL scraping, vitality state computation, health score with deterministic coaching action, CV snapshot on application, automatic status update on reply (Pro), follow-up urgency detection.

---

### Journey 2: Marcus — Edge Cases

**Scenario A: The Scraper Fails**
Marcus finds a role on a company's custom Workday portal. He pastes the URL. The scraper returns nothing — Workday renders job data client-side and the JSON-LD parser finds no structured data. The app doesn't crash or show an error page. A clean form appears, pre-filled with whatever it could extract (company name from the URL domain, posting date as today). Marcus fills in the title and location in 30 seconds. The listing enters his board manually, tagged with a small icon indicating it was manually entered rather than scraped. He moves on.

**Scenario B: The 25-Job Cap**
Marcus has been hunting for three weeks. His board has 24 active listings. He finds a role he wants and pastes the URL. The import succeeds — but before it saves, the app surfaces a clean upgrade prompt: *"You've reached 25 tracked listings — the free tier limit. Upgrade to Pro for unlimited listings, Gmail auto-tracking, and more."* It's not a wall — it's a moment of truth. Marcus has already proven the product works. He upgrades.

**Capabilities revealed:** Graceful scraper fallback with manual form, manually-entered listing indicator, freemium cap enforcement with contextual upgrade prompt, Pro subscription flow.

---

### Journey 3: Platform Admin (Product Owner)

**Opening Scene**
Alex is the product owner and a Pro user. It's a Tuesday morning and he checks the admin dashboard before standup. He sees scraper success rate has dropped to 71% over the last 48 hours — below the 80% threshold. He investigates.

**Rising Action**
The logs show that Stepstone recently changed their HTML structure, breaking the primary CSS selector. The JSON-LD fallback is still working but only catching 60% of fields. Alex pushes a selector patch. He also sees three users have been stuck at the 25-job cap for over a week without converting — he flags them as candidates for a targeted nudge.

**Resolution**
He also receives an email from a user requesting a data export (GDPR). Through the admin panel he triggers a full export — all CV versions, job records, application snapshots — packaged as a ZIP and emailed to the user within the hour. The request is logged with timestamp for compliance.

**Capabilities revealed:** Admin dashboard with scraper health monitoring, per-source success rate tracking, user account management, GDPR-compliant data export, conversion funnel visibility (users stuck at cap).

---

### Journey Requirements Summary

| Capability | Journey |
|---|---|
| URL scraping with JSON-LD extraction | J1, J2a |
| Manual import fallback form | J2a |
| Vitality state engine (8 states, rule-based) | J1 |
| Health score with deterministic coaching action | J1 |
| CV version history + snapshot on application | J1 |
| Automatic status update via Gmail domain match | J1 (Pro) |
| Follow-up urgency detection | J1 |
| 25-listing freemium cap + upgrade prompt | J2b |
| Pro subscription flow | J2b |
| Admin dashboard — scraper health monitoring | J3 |
| Admin — user account management | J3 |
| Admin — GDPR data export | J3 |

## Domain-Specific Requirements

### Privacy & Data Handling

FollowCV stores sensitive personal data — CV files, employment history, application records. As a personal project, formal GDPR registration is not required at this stage, but privacy best practices apply throughout:

- **Data minimisation:** Collect only what is needed to operate the product. Do not store email content — only sender domain signals from Gmail integration.
- **Data retention:** User data is retained for the lifetime of the account. Inactive accounts (no login in 12 months) are flagged for auto-deletion with a 30-day warning email before deletion executes.
- **Right to erasure:** Users can delete their account and all associated data at any time from account settings. Deletion is permanent and immediate.
- **Data export:** Users can request a full export of their data (CV files, job records, application history) as a ZIP archive. Export completes within 24 hours.
- **Privacy policy:** A plain-language privacy policy must be in place at launch stating what data is collected, how it is used, and how long it is retained.

### Web Scraping — Risk Mitigation

- The primary scraping approach reads publicly available JSON-LD structured data (`@type: JobPosting`) from job board pages — lower-risk than aggressive crawling.
- The LinkedIn browser extension (Vision) reads the DOM client-side while the user is authenticated — no server-side scraping of LinkedIn is performed.
- Scraping is performed on-demand per user action (paste URL), not via automated batch crawling.
- **Risk:** Job boards may change their HTML/schema structure without notice, breaking the scraper. Mitigated by the manual fallback form and the admin scraper health dashboard.

### Gmail OAuth — Scope & Trust

- OAuth scope is read-only and minimal: the app checks for emails from matched company domains only. Email content is never read, stored, or transmitted.
- Scope must be explicitly declared in the OAuth consent screen: *"FollowCV checks whether you've received replies from companies you've applied to. It never reads email content."*
- OAuth tokens are stored securely server-side (encrypted at rest). Users can revoke Gmail access at any time from account settings without losing job data.

### Risk Summary

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scraper breaks due to job board HTML change | High (ongoing) | Admin health dashboard + manual fallback |
| User concern over Gmail access scope | Medium | Minimal OAuth scope + plain-language consent |
| User data loss on account deletion | Low | 30-day warning + export option before deletion executes |
| LinkedIn ToS exposure | Medium | Extension reads DOM client-side only, no server scraping (Vision only) |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Active Tracking System (Category Inversion)**
FollowCV challenges the foundational assumption of the job tracker category: that users maintain the board. Every competitor — Huntr, Teal, LinkedIn, spreadsheets — is a passive container. FollowCV is an active tracking system: posting vitality states are computed from real signals (posting age, URL health checks, Gmail domain matching, elapsed time since application), not entered by the user. The board is correct because the system watches, not because the user updates.

**2. Deterministic Coaching Score**
The Application Health Score collapses a multi-variable rule engine (5 indicators, weighted) into a single deterministic next action per zone. This is an uncommon UX pattern in consumer products — typically dashboards present data and leave interpretation to the user. The design constraint of one action per zone forces the product to take a position and reduces cognitive load at the moment users most need clarity.

**3. CV Version Control for Non-Technical Users**
Git-style version control applied to personal documents, abstracted for a non-developer audience. The snapshot-per-application pattern — an immutable file link attached at the moment of application — solves a real, universal pain point (which CV did they see?) that no current job tracker addresses.

### Validation Approach

| Innovation | Validation Signal | Fallback |
|---|---|---|
| Active tracking | Users open app after 5+ days and board has updated without their input | Vitality states can be manually overridden |
| Deterministic coaching | Health score zone changes correlate with user action taken within 48 hours | Show top 3 actions if single action feels too narrow |
| CV snapshots | Users cite knowing "which version they sent" as reducing anxiety | File link alone (no version history) if storage is a concern |

### Risk Mitigation

- **Active tracking depends on data quality:** If the scraper fails or Gmail isn't connected, the board degrades to a partially-manual tool. Mitigated by transparent staleness indicators and the manual fallback.
- **Deterministic coaching may frustrate power users** who want more control. Mitigated by allowing manual status overrides and making the preference profile editable.
- **CV versioning storage cost** grows over time per user. Mitigated by the configurable free cap and Pro tier for unlimited storage.

## Web Application Specific Requirements

### Project-Type Overview

FollowCV is built as a **Next.js application** (App Router) — a hybrid framework enabling server components for data-heavy views, client components for interactive board interactions, and API routes for backend logic. The app is primarily accessed behind authentication; public-facing pages are limited to the landing/marketing page and the optional public profile URL (Pro feature).

### Browser Support

- **Supported:** Chrome, Firefox, Safari, Edge — last 2 major versions (formalized in NFR-A4)
- **Not supported:** Internet Explorer, legacy mobile browsers

### Rendering Strategy

| Route | Rendering | Rationale |
|---|---|---|
| `/dashboard` (job board) | Client-side (CSR) | Interactive, user-specific, behind auth |
| `/jobs/[id]` (job detail) | Client-side (CSR) | Dynamic, user-specific |
| `/cv` (CV manager) | Client-side (CSR) | File interactions, behind auth |
| `/onboarding` | Client-side (CSR) | Form interactions |
| `/profile/[slug]` (public) | SSR | Public-facing, needs fresh data |
| `/` (landing page) | SSG | Static marketing content |

### State Computation

- Vitality states and health score are **computed on page load** — not real-time. The board reflects reality at the moment the user opens it.
- Background jobs (URL health checks, vitality state recalculation) run server-side via pg-boss job queue and persist computed state to the database — the client reads pre-computed values.
- No WebSockets or polling in MVP.

### Responsive Design

- **Primary target:** Desktop (1280px+) — deliberate job hunters work on desktop
- **Secondary:** Tablet (768px+) — usable but not optimised
- **Mobile:** Not a priority for MVP — the use case is desktop-first

### SEO

- No SEO optimisation required for the authenticated app
- Landing page: basic meta tags only (title, description, og:image)
- Public profile URL (Pro): basic meta tags for shareability

### Performance & Accessibility

Performance targets and accessibility requirements are formalized in NFR-P1–P5 and NFR-A1–A4. Summary:
- Core board initial load: **< 2 seconds** | API routes: **< 500ms** (95th percentile) | Job import: **< 5 seconds**
- Keyboard navigation for primary flows | Screen reader labels on all interactive elements | Vitality states carry label/icon in addition to colour

### Implementation Considerations

- **Authentication:** NextAuth.js (Auth.js) — supports OAuth providers and credentials
- **Deployment target:** Vercel — native Next.js hosting, zero-config
- **API layer:** Next.js API routes for all backend logic
- **File storage:** Cloud object storage (S3-compatible) for CV file uploads; served via time-limited signed URLs
- **Background jobs:** Durable job queue (pg-boss on Postgres) — cron triggers the queue; queue handles retries, concurrency, and dead-letter. Do not use raw Vercel cron as the sole runner.
- **Gmail OAuth:** NextAuth.js Google provider with custom read-only `gmail.readonly` scope — ships at MVP launch as a Pro Beta feature

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP — the minimum that delivers the complete core emotional promise: the board updates itself, the CV is versioned, the user focuses on applying. This is a full workflow for the deliberate job hunter, not a feature stub.

**Resource Requirements:** Small team (1–3 engineers). Next.js + Vercel minimises infrastructure overhead. No AI API dependency eliminates external cost risk. All intelligence is rule-based.

**Key Scoping Decisions (from cross-functional review):**
- Swipe-based onboarding replaced with a static preference form — swipe mechanic deferred to Growth alongside the Taste Engine that consumes it
- Gmail OAuth ships at MVP launch as a Pro Beta feature — auto-status updates are retention-critical and the OAuth flow is low-complexity
- Freemium cap is config-driven from day one (default: 25 listings) — adjustable without a deploy as usage data arrives
- URL scraper scoped to JSON-LD extraction + manual fallback only — bespoke per-domain extractors deferred to Growth when board data identifies which sources matter most

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- J1: Marcus — The Deliberate Job Hunter (full success path)
- J2: Marcus — Edge Cases (scraper fallback, freemium cap)
- J3: Platform Admin (scraper health observability, GDPR export)

**Must-Have Capabilities:**

| Feature | Notes |
|---|---|
| Secure multi-user authentication | NextAuth.js, credentials + OAuth providers |
| Smart Job Import — JSON-LD extraction + manual fallback | JSON-LD (`@type: JobPosting`) primary path; clean manual form fallback. No bespoke per-domain extractors in MVP. |
| Living Job Board — 8 computed vitality states (rule-based) | State transition logic must be fully specced as a truth table before implementation. Backed by pg-boss durable job queue, not raw cron. |
| Application Health Score — 5 indicators, 🟢/🟡/🔴 + 1 deterministic coaching action | Pure function implementation. Coaching copy is a content design workstream — spec separately before engineering. |
| CV Version History — timestamped, user-named snapshots | S3-compatible storage. Snapshot FK on `applications` table — not a live reference. |
| CV Snapshot per Application — immutable record at apply moment | Edge cases must be specced: user edits CV post-snapshot, selects non-current version to apply with, orphaned snapshots on CV deletion. |
| Preference Form Onboarding — structured preference capture | Static form: job function, seniority, locations, remote/hybrid/onsite, salary range. Produces `PreferenceProfile` with Vision-compatible data model. |
| Editable Preference Profile | Visible, user-controlled preference object. |
| Job listing search | Keyword search across title, company, and notes. |
| Notes per application | Free-text notes on any application or listing record. |
| Duplicate detection on URL import | System detects duplicate URLs and presents resolution choice. |
| Gmail OAuth — read-only, sender domain matching (Pro Beta) | Shipped at MVP launch as Pro tier Beta. Scope: sender domain → status rule only. Email content never read or stored. |
| Freemium cap — config-driven (default: 25 active listings) | Database-level count check before insert. UX surfaces cap progressively (at 80% and 90% of cap) — not as a hard wall. |

**Infrastructure (not user-facing features):**

| Item | Rationale |
|---|---|
| pg-boss durable job queue | Required for vitality recalculation and Gmail domain sync. Vercel cron alone is insufficient at scale. |
| Vitality state rule versioning | Audit log of state transitions required for debugging. |
| Structured scraper logging | Per-job logging (URL, status, error, duration) enables the admin dashboard as a read query, not a new system. |
| GDPR data export pipeline | Legal requirement. Async SQL dump → ZIP → email. Triggered via admin panel. |

### Growth Features (Phase 2 — Pro Tier Expansion)

| Feature | Value Driver |
|---|---|
| Unlimited job listings | Removes free-tier ceiling for power users |
| Unlimited CV versions + snapshots | Removes storage cap for career switchers |
| CV Strength Meter — intrinsic CV quality scoring | Standalone CV quality feedback independent of any specific job listing |
| Skill Gap Indicator — rule-based keyword matching | Helps users decide apply vs. tailor first |
| Public Profile URL — CV as shareable webpage | Requires caching strategy before shipping |
| Preference-driven swipe onboarding | Replaces form once Taste Engine data model is ready |
| Behavioral preference feedback | System detects drift between stated preferences and observed application behavior |
| In-app notification delivery | Surfaces async changes without requiring app to be open |
| Bespoke per-domain scraper extractors | Prioritised by actual MVP usage data |

### Vision (Phase 3 — Future)

| Feature | Dependency |
|---|---|
| AI Taste Engine — passive preference learning from implicit behavior | Sufficient user data + AI API budget |
| AI Assist Layer — match explanations, CV tailoring hints, industry-aware wait times | AI Taste Engine foundation |
| LinkedIn Browser Extension — DOM-based import | Separate release pipeline (Manifest v3, cross-browser matrix) |
| Additional email providers (Outlook, Apple Mail) | Post-Gmail validation |
| Mobile application | Desktop usage validated first |
| Contact/recruiter relationship tracking | Post-MVP usage patterns |
| CSV import from spreadsheets / competitors | Post-MVP usage patterns |

### Risk Mitigation Strategy

**Technical Risks:**
The vitality state background job system is the highest-complexity item in MVP. Mitigated by using pg-boss (durable queue with retries and dead-letter) rather than raw Vercel cron, and by requiring a complete state transition truth table as a pre-implementation spec artifact. URL scraper brittleness is an ongoing operational risk, mitigated by the structured scraper logging foundation and the manual fallback.

**Market Risks:**
The 25-job freemium cap is an unvalidated assumption. Making it config-driven means it can be adjusted without a deploy once the first cohort's usage distribution is known. Target validation signal: observe cap hit rate in the first 50 active users.

**Resource Risks:**
The CV snapshot edge-case flows and vitality state truth table must be fully specced before engineering starts — both are cheap to define and expensive to fix post-build.

## Functional Requirements

### User Account Management

- **FR1:** Users can register for an account with email/password or an OAuth provider
- **FR2:** Users can authenticate, maintain, and terminate their session securely
- **FR3:** New users complete a preference setup step during onboarding that pre-populates their preference profile
- **FR4:** Users can view and edit their preference profile (job function, seniority, location, work style, salary range) at any time
- **FR5:** Users can permanently and immediately delete their account and all associated data
- **FR6:** Users can request a full export of their data (CV files, job records, application history) as a downloadable archive; the export runs asynchronously and is delivered when ready
- **FR7:** Users can revoke connected OAuth integrations (Gmail) without losing any job or application data
- **FR8:** The system automatically anonymizes free tier accounts with no login activity for 24 months by replacing identifying data with hashed placeholders and soft-deleting job records; Pro accounts are exempt from automated cleanup
- **FR9:** Admins can authenticate and access administrative functions through a role-protected interface; admin accounts include Pro-tier feature access

### Job Import & Capture

- **FR10:** Users can import a job listing by pasting a URL, with fields auto-populated from structured data extracted from the page; the system captures company domain at import time for employer matching
- **FR11:** When a URL import is attempted for a listing already tracked by the user, the system detects the duplicate and presents a resolution choice before saving
- **FR12:** Users can import a job listing via a manual entry form when URL extraction is unavailable or returns incomplete data
- **FR13:** The system visually distinguishes auto-imported listings from manually entered ones
- **FR14:** Users can edit any field on a job listing after import
- **FR15 *(Vision):*** Users can capture job listings from login-walled sources using a browser extension that reads the page client-side

### Living Job Board

- **FR16:** Users can view all tracked job listings on a central board
- **FR17:** The system computes and displays a vitality state for each listing across 8 states (Hot, Active, Cooling, Cold, Deadline, Ghosting, In Dialogue, Closed) without requiring user input, per a pre-defined state machine specification
- **FR18:** The system recalculates vitality states on an automated background schedule; failed recalculation jobs are retried 3 times with exponential backoff and surfaced as errors in the admin interface after the final failure
- **FR19:** Users can manually override the computed vitality state of any listing; overrides persist until explicitly cleared and are visually distinguished from system-computed states
- **FR20:** Users can archive a listing to remove it from the active board
- **FR21:** Users can filter and sort the board by vitality state, company, date added, and application status; users can search listings by keyword across title, company, and notes

### Application Tracking

- **FR22:** Users can record an application against a job listing, capturing application date, the selected CV version, optional supporting documents (e.g., cover letter, certifications), and free-text notes; recording triggers an immutable CV snapshot attached to the application record (FR33)
- **FR23:** Users can manually update a listing's application status using a defined taxonomy: Applied, Interviewing, Offer Received, Rejected, Withdrawn, On Hold, Ghosted
- **FR24:** The system identifies listings in 'Applied' or 'In Dialogue' status with no recorded activity in the last 7 days and surfaces these as 'Follow-up due' items on the board; the follow-up window threshold is configurable
- **FR25:** Pro users can connect a Gmail account (read-only) to enable automatic status detection based on employer domain matching
- **FR26:** The system automatically updates a listing's vitality state when email activity from a matched employer domain is detected (Pro); matching uses the company domain captured at import (FR10)
- **FR27:** Users can view the exact CV version attached to any past application record; the system retrieves the point-in-time snapshot, not the current version; missing snapshot files are surfaced gracefully
- **FR28:** The system prevents modification of any CV snapshot after the application action is recorded
- **FR29:** Users can add, edit, and view free-text notes on any application or job listing record

### CV Management

- **FR30:** Users can upload a CV file and save it as a named, timestamped version
- **FR31:** Users can view the complete history of their saved CV versions
- **FR32:** Users can restore, duplicate, or rename any previous CV version; restoring a version creates a new version entry and checks the free tier cap before saving
- **FR33:** When recording an application, the system automatically snapshots and attaches the selected CV version to the application record as an immutable copy stored independently of the source version
- **FR34:** CV files are served via per-request authenticated access tokens that expire after use; public profile artifacts are stored and served separately; revoking public visibility (FR39) invalidates the public artifact
- **FR35:** Free tier users can store up to the configured maximum number of CV versions; Pro users have unlimited storage
- **FR36 *(Growth/Pro):*** Users can view an intrinsic quality score for their CV measuring completeness, measurable outcomes, keyword presence, and recency — with specific, actionable improvement recommendations (CV Strength Meter)
- **FR37 *(Growth/Pro):*** Users can view a keyword-match comparison between a job listing's stated requirements and their CV content (Skill Gap Indicator)
- **FR38 *(Pro):*** Users can generate a public URL that renders their current CV as a shareable web page
- **FR39 *(Pro):*** Users can control the visibility of their public profile URL

### Health Score & Coaching

- **FR40:** The system computes an Application Health Score from five rule-based indicators reflecting the user's pipeline state, per a pre-defined scoring formula and threshold specification
- **FR41:** The health score is displayed as one of three coaching zones (🟢 / 🟡 / 🔴), with zone boundaries defined in the scoring specification; status updates to application records trigger a cascading health score recalculation
- **FR42:** Each coaching zone surfaces a single deterministic next-action instruction from a pre-defined lookup table keyed by active indicator and zone
- **FR43:** The health score and coaching instruction update automatically when underlying application or listing data changes

### Subscription & Access Control

- **FR44:** Free tier users are capped at a configurable maximum number of active job listings (default: 25)
- **FR45:** The system surfaces the approaching cap progressively to users before the limit is reached (at 80% and 90% of cap)
- **FR46:** When a user reaches the listing cap, the system presents a contextual upgrade prompt before blocking the import
- **FR47:** Users can subscribe to, manage, and cancel the Pro tier from within the product
- **FR48:** The freemium cap and other configurable thresholds are stored in a runtime config system (database-backed) adjustable by an administrator without requiring a code deployment

### Platform Administration

- **FR49:** Admins can view scraper health metrics by source, including success rate and failure type over time, derived from structured per-job import logs
- **FR50:** Admins can view individual import failure logs (URL, error type, timestamp)
- **FR51:** Admins can view platform-level metrics (registered users, weekly active users, total CV storage used, free-to-Pro conversion rate) and manage individual user accounts — including account details, per-account usage stats (CV versions stored, listing count, last activity), tier adjustment, suspension, and deletion
- **FR52:** Admins can trigger a GDPR-compliant data export for any user; the export runs asynchronously, notifies the user on completion, and stores the artifact with a defined retention TTL
- **FR53:** The system logs all data export requests with timestamps for compliance
- **FR54:** Admins can identify users who have reached the freemium cap without converting
- **FR55:** The background job system (vitality recalculation, Gmail polling, data exports) retries failed jobs 3 times with exponential backoff; jobs exceeding the retry limit are routed to a dead-letter queue visible in the admin interface; each job type has a defined timeout
- **FR56 *(Growth):*** The system detects behavioral patterns in user application activity (e.g., consistently applying to remote roles despite a hybrid preference) and prompts users to review and update their preference profile when stated preferences diverge from observed behavior

**Deferred to Growth:** In-app notification delivery channel, CSV/spreadsheet import, behavioral preference feedback (FR56)
**Deferred to Vision:** Contact/recruiter relationship tracking, browser extension import (FR15)

## Non-Functional Requirements

### Performance

- **NFR-P1:** The job board dashboard loads within 2 seconds for a user with up to 100 active listings on a standard broadband connection
- **NFR-P2:** URL import (fetch, parse, and save) completes within 5 seconds under normal load; failures surface a user-facing error within the same window
- **NFR-P3:** Standard CRUD API routes (job listings, applications, CV versions) respond within 500ms at the 95th percentile
- **NFR-P4:** CV file uploads of up to 10MB complete without timeout or data truncation
- **NFR-P5:** Background vitality recalculation completes for all of a user's active listings within 1 hour of the scheduled trigger

### Security

- **NFR-S1:** All data is encrypted in transit (TLS 1.2 minimum) and at rest
- **NFR-S2:** CV files in object storage are accessible only via per-request authenticated access tokens that expire after use; direct storage bucket access is not exposed publicly
- **NFR-S3:** Gmail OAuth tokens are encrypted at rest and never exposed to the client
- **NFR-S4:** Authentication sessions expire after 24 hours of idle time and are invalidated immediately on explicit logout
- **NFR-S5:** All API routes enforce authentication; unauthenticated requests return 401 without exposing system detail
- **NFR-S6:** Admin routes enforce role-based access control; standard user credentials cannot access admin functions regardless of URL knowledge
- **NFR-S7:** Pro subscription payment processing is handled entirely by a PCI-compliant third-party provider (e.g., Stripe); card data never passes through or is stored by the application
- **NFR-S8:** Gmail OAuth scope is strictly read-only; the application never reads, stores, logs, or transmits the content of any email

### Scalability

- **NFR-SC1:** The system supports 5,000 registered users with 25% weekly active concurrency without infrastructure reconfiguration
- **NFR-SC2:** A single user's board with up to 100 listings meets the 2-second load target (NFR-P1)
- **NFR-SC3:** The background job queue processes vitality recalculation across 5,000 active users within a 1-hour window without manual intervention
- **NFR-SC4:** Object storage accommodates up to 100MB of files per user account; aggregate platform storage (estimated 500GB at 5,000 users) scales without manual infrastructure intervention

### Reliability

- **NFR-R1:** Zero tolerance for data loss on CV versions and application CV snapshots — these are immutable records and must survive any single infrastructure failure
- **NFR-R2:** Background job failures (vitality recalculation, Gmail polling, data exports) are retried 3 times with exponential backoff and routed to a dead-letter queue after the final failure; silent failure is not acceptable
- **NFR-R3:** A scraper failure for one user's import is fully isolated and does not affect any other user's import operations
- **NFR-R4:** Monthly application uptime target: 99.5% (approximately 3.6 hours downtime tolerance), excluding scheduled maintenance windows communicated in advance

### Accessibility

- **NFR-A1:** The primary user flows — job import, board view, apply action, CV upload — are fully navigable via keyboard without a mouse
- **NFR-A2:** All interactive elements carry accessible labels compatible with common screen readers
- **NFR-A3:** Vitality states are differentiated by label and/or icon in addition to colour; colour alone is not the sole signal for any state distinction
- **NFR-A4:** The product is functionally tested on Chrome, Firefox, Safari, and Edge (last 2 major versions each) prior to release
