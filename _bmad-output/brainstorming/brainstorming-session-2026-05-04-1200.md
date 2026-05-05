---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Personal multi-user CV and Job Application Management Tool'
session_goals: 'Feature ideas, target audience definition, differentiators vs existing tools, monetization models'
selected_approach: 'AI-Recommended Techniques'
techniques_used: ['Cross-Pollination', 'SCAMPER Method', 'Role Playing', 'What If Scenarios']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Alex
**Date:** 2026-05-04

## Session Overview

**Topic:** Personal multi-user CV and Job Application Management Tool
**Goals:** Generate feature ideas, define target audience, explore differentiators vs. existing tools (Huntr, Teal, LinkedIn), brainstorm monetization models

### Session Setup

AI-Recommended Techniques selected. Focus on divergent ideation across features, audience segments, competitive differentiation, and business models.

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Personal multi-user CV & Job Application Management Tool with focus on feature ideation, target audience, differentiators, and monetization.

**Recommended Techniques:**

- **Cross-Pollination:** Transfer solutions from other industries to spark breakthrough feature and differentiation ideas; breaks past obvious "LinkedIn clone" thinking
- **SCAMPER Method:** Systematically apply 7 lenses to existing tools to generate concrete, logic-backed feature list
- **Role Playing:** Explore multiple stakeholder perspectives to define audience segments and match features to pain points
- **What If Scenarios:** Remove radical constraints to unlock non-obvious monetization models

**AI Rationale:** Multi-phase sequence moves from divergent creative exploration → structured refinement → audience anchoring → business model innovation. Balances wild ideation with actionable output.

---

## Phase 1: Cross-Pollination Results

**[Foundation #1]: Authentication**
_Concept:_ Secure multi-user auth is the bedrock the entire product sits on. Standard implementation.
_Novelty:_ Table stakes, not a differentiator — but non-negotiable.

**[Constraint #1]: MVP = No AI Dependency**
_Concept:_ All core features (vitality statuses, health score, tracking, matching) are rule-based. No external model API required. AI layer is explicitly post-MVP.
_Novelty:_ Product works fully without any AI API key.

**[Feature #1]: Taste Engine** *(Post-MVP)*
_Concept:_ System passively builds a job preference model from browsing behavior — dwell time, saved/ignored roles, what the user edits their CV for. Gets smarter over time.
_Novelty:_ No explicit preference-setting needed; infers taste like Spotify, not LinkedIn's checkbox filters.

**[Feature #2]: Living Job Radar**
_Concept:_ Jobs pulse and decay on the board — hot leads glow, old listings fade, applied roles archive automatically. The board always reflects reality without manual cleanup.
_Novelty:_ Most trackers turn into graveyards; this one stays alive and honest about pipeline state.

**[Feature #3]: Application Health Score**
_Concept:_ A single dashboard score reflecting the overall job hunt state — active leads, overdue follow-ups, response rates, pipeline diversity. Updates automatically.
_Novelty:_ Treats job hunting like a sales pipeline with a health metric. Tells you what to do, not just what happened.

**[Feature #4]: Posting Vitality Status**
_Concept:_ Every saved job carries a computed live status — 🔥 Hot / ✅ Active / 🌡️ Cooling / 🧊 Cold / ⏰ Deadline / 👻 Ghosting / 💬 In Dialogue / 🪦 Closed. Status is rule-based, not manually set.
_Novelty:_ The board is always truthful without the user touching it. Health score is derived from aggregate vitality statuses.

**[Feature #5]: AI Assist Layer** *(Post-MVP — explicitly out of scope)*
_Concept:_ AI on top of rule-based core — recommendations, match explanations, CV tailoring hints, industry-aware wait times. Premium layer.
_Novelty:_ AI enhances rather than replaces the system.

**[Feature #6]: CV Strength Meter**
_Concept:_ Rule-based checklist scoring the CV across concrete dimensions — completeness, measurable outcomes, keywords present, recency. Actionable and specific.
_Novelty:_ Not a vague "67% complete" — tells you exactly what's missing and why it matters.

**[Feature #7]: Taste Calibration Onboarding**
_Concept:_ On first login, user swipes through 10–15 sample job cards (curated archetypes). Swipes extract preference signals: industry, seniority, company size, location, work style. Stored as structured preference profile.
_Novelty:_ Tinder/Spotify-style onboarding — fast, visual, no form fields. Produces a real preference model immediately.

**[Feature #8]: Preference Profile (Editable)**
_Concept:_ Taste profile is a visible, editable object. User can see why a job was recommended ("matches 4 of 6 preferences") and tweak weights. Rule-based pattern detection prompts updates: "You've applied to 5 remote roles and ignored 8 hybrid — want to update your preference?"
_Novelty:_ The opposite of a black-box algorithm. Transparent, user-controlled, no AI needed.

---

## Phase 2: SCAMPER Results

**[Feature #9]: Smart Job Import**
_Concept:_ Paste a URL → app fetches structured JobPosting schema (JSON-LD) from the page, auto-fills all fields. Falls back to Open Graph tags. Browser extension handles LinkedIn and login-walled sites. Manual fallback if all else fails.
_Novelty:_ One-click capture, zero manual entry for 80%+ of sources. Scraper-first → extension fallback → manual fallback.

**[Feature #10]: CV Snapshot per Application**
_Concept:_ When marking a job as "Applied", the current CV version is automatically snapshotted and attached to that application record. Immutable history of what each employer received.
_Novelty:_ Solves the silent pain of multi-version CV chaos — every application has its own receipt.

**[Feature #11]: Skill Gap Indicator**
_Concept:_ Rule-based keyword matching between job description requirements and CV skills/experience sections. Shows matched and missing keywords as a simple visual indicator on each job card.
_Novelty:_ No AI — just text comparison. Helps the user decide whether to apply or tailor first.

**[Feature #12]: CV Version History**
_Concept:_ Every CV save creates a versioned snapshot with timestamp. User can name ("FAANG version"), restore, or duplicate any version. Applications always link to the exact version sent.
_Novelty:_ Full version control for the CV — like Git for your career profile.

**[Feature #16]: Public Profile Link**
_Concept:_ Optional public URL rendering the CV as a clean webpage. User controls visibility. Shareable instead of attaching a PDF.
_Novelty:_ CV-as-URL. Always up to date, no design skills needed.

**[Feature #17]: Zero-Manual-Status Updates**
_Concept:_ Status transitions triggered automatically: Apply action → Applied; Gmail OAuth domain matching → In Dialogue; timer → Ghosting; URL health check → Closed. User only taps once to confirm ambiguous transitions (interview vs. rejection).
_Novelty:_ No drag-and-drop. Board reflects reality via signals, not manual maintenance. Gmail first, OAuth read-only (sender domain only).

**[Constraint #2]: Email Integration — Gmail OAuth First**
Gmail via OAuth read-only. Simple connect flow (few clicks). Sender domain matching only — app never reads email content. Other providers post-MVP.

---

## Phase 3: Role Playing Results

**[Target Audience #1]: The Active Job Seeker**
Primary user. Mid-level professional, 10–20 simultaneous applications, currently using spreadsheets or nothing. Needs clarity, momentum, and zero admin overhead. All core features map directly to this persona.

**[Target Audience #2]: The Career Switcher**
Sub-segment of active job seeker. Heavier CV versioning needs, higher usage of skill gap indicator and taste calibration. Maintains 3–4 fundamentally different CV variants simultaneously.

**[Target Audience #3]: The Recently Laid Off**
Sub-segment of active job seeker. High urgency, high volume, high emotional stakes. Validates health score and vitality system as core priority — job hunting is their full-time job.

---

## Phase 4: What If Scenarios — Monetization

**[Monetization #1]: Freemium — User Pays**
_Concept:_ Free tier covers the full core loop. Pro unlocks automation, power CV management, and LinkedIn import. Monthly subscription, user-facing.
_Novelty:_ Paywall sits exactly where casual users stop and serious job seekers begin — natural upgrade moment at 25-job limit or first Gmail connect.

**Free Forever (Core Value):**
- Job board up to 25 active listings
- Basic vitality statuses + health score
- CV management with 3 saved versions
- Smart Job Import (URL scraping)
- Taste calibration onboarding + preference profile
- Manual status updates

**Pro Tier (Monthly Fee):**
- Gmail OAuth / Zero-Manual-Status Updates
- Unlimited job listings
- Unlimited CV versions + Snapshots per application
- Public Profile Link
- Skill Gap Indicator
- Browser Extension (LinkedIn import)

---

## Idea Organization and Prioritization

### Thematic Clusters

**Theme 1: Intelligent Job Discovery**
- Feature #7 — Taste Calibration Onboarding
- Feature #8 — Preference Profile (Editable)
- Feature #9 — Smart Job Import ⭐ MVP CORE

**Theme 2: Living Job Board**
- Feature #2 — Living Job Radar ⭐ MVP CORE
- Feature #4 — Posting Vitality Status (8 computed states) ⭐ MVP CORE
- Feature #3 — Application Health Score (derived from vitality, low-cost add)

**Theme 3: Automatic Tracking**
- Feature #17 — Zero-Manual-Status Updates (Pro tier)
- Constraint: Gmail OAuth first, read-only

**Theme 4: CV Management**
- Feature #12 — CV Version History ⭐ MVP CORE
- Feature #10 — CV Snapshot per Application ⭐ MVP CORE
- Feature #11 — Skill Gap Indicator (Pro tier)
- Feature #6 — CV Strength Meter
- Feature #16 — Public Profile Link (Pro tier)

**Post-MVP (AI-dependent)**
- Feature #1 — Taste Engine
- Feature #5 — AI Assist Layer

### MVP Core Features (Confirmed)

1. **Smart Job Import (#9)** — Gateway feature. Removes entry friction. Adoption lives or dies here.
2. **Posting Vitality Status + Living Board (#4 + #2)** — The core differentiator. What makes this not a spreadsheet.
3. **CV Version History + Snapshot per Application (#12 + #10)** — Second product pillar. Completes the tool's identity.

*Health Score (#3) included as a near-free addition derived from vitality statuses.*

### Quick Win (Low effort, high value)
- Application Health Score — computed from existing vitality data, minimal additional work

### Pro Tier Roadmap
- Gmail OAuth / Zero-Manual-Status Updates
- Unlimited job listings (free cap: 25)
- Unlimited CV versions (free cap: 3)
- Skill Gap Indicator
- Public Profile Link
- Browser Extension (LinkedIn import)

## Session Summary

**Product Identity:** A self-maintaining job hunt + CV management tool for active job seekers. The board stays honest without manual upkeep. The CV is versioned like code.

**Primary User:** Active job seeker — mid-level professional running 10–20 simultaneous applications, frustrated by spreadsheets and the invisible chaos of job hunting.

**Core Insight:** The product's differentiator is not features — it's *zero maintenance overhead*. The board updates itself. The CV history saves itself. The user focuses on job hunting, not tool management.

**Business Model:** Freemium. Free tier delivers full core value. Pro unlocks automation and power features at the moment users are most engaged.

**Technical Constraints:**
- No AI dependency for MVP
- Gmail OAuth (read-only, sender domain only) for Pro automation
- Rule-based vitality + health score (no model needed)
