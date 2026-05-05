---
title: Vitality State Machine Specification
version: 1.0
status: approved
created: 2026-05-05
---

# Vitality State Machine Specification

This document is the single source of truth for `vitality-state-machine.ts`. All state transition logic, priority ordering, and override behaviour must match this spec exactly. No other file may write to `JobListing.vitalityState`.

---

## 1. States

| State | Label | Meaning |
|---|---|---|
| `HOT` | 🔥 Hot | Listing posted ≤7 days ago, no application recorded |
| `ACTIVE` | ✅ Active | Application submitted, awaiting employer response |
| `COOLING` | 🧊 Cooling | Listing posted 8–21 days ago, no application recorded |
| `COLD` | ❄️ Cold | Listing posted >21 days ago, no application recorded |
| `DEADLINE` | ⏰ Deadline | Closing date is within 48 hours |
| `GHOSTING` | 👻 Ghosting | Application submitted >14 days ago, no response detected |
| `IN_DIALOGUE` | 💬 In Dialogue | Email reply detected from employer domain, or user has set manually |
| `CLOSED` | 🚫 Closed | Listing removed/expired, or user manually closed |

---

## 2. Input Fields (read by the state machine on each evaluation)

| Field | Source | Notes |
|---|---|---|
| `postedAt` | `JobListing.postedAt` | Date listing was published; null if unavailable |
| `closingDate` | `JobListing.closingDate` | Employer-stated deadline; null if not present |
| `application` | `Application` (joined) | Null if no application recorded |
| `application.appliedAt` | `Application.appliedAt` | Timestamp of apply action |
| `application.status` | `Application.status` | `Applied`, `Interviewing`, `Offer Received`, `Rejected`, `Withdrawn`, `On Hold`, `Ghosted` |
| `gmailSignalAt` | `AuditLog` (latest `GMAIL_SIGNAL` for listing) | Null if no Gmail signal received |
| `overrideState` | `JobListing.overrideState` | Non-null when user has manually set a state |
| `overrideSource` | `JobListing.overrideSource` | `USER` or null |
| `isArchived` | `JobListing.archived` | Archived listings skip state computation |
| `now` | Runtime | Current UTC timestamp |

---

## 3. Evaluation Order (Priority — highest first)

The machine evaluates rules top-to-bottom and applies the **first matching rule**. Rules below a match are not evaluated.

| Priority | Rule | Resulting State |
|---|---|---|
| 1 | `isArchived = true` | Skip — do not update `vitalityState`; do not update `stateChangedAt` |
| 2 | `application.status` is one of: `Rejected`, `Withdrawn` | `CLOSED` |
| 3 | `overrideSource = USER` | `overrideState` (preserve user override — no further evaluation) |
| 4 | `closingDate` is non-null AND `(closingDate - now) ≤ 48h` AND `(closingDate - now) > 0` | `DEADLINE` |
| 5 | `application` is non-null AND `gmailSignalAt` is non-null AND `gmailSignalAt > application.appliedAt` | `IN_DIALOGUE` |
| 6 | `application` is non-null AND `(now - application.appliedAt) > 14 days` AND `application.status = Applied` | `GHOSTING` |
| 7 | `application` is non-null AND `application.status` is one of: `Applied`, `Interviewing`, `On Hold` | `ACTIVE` |
| 8 | `postedAt` is non-null AND `(now - postedAt) ≤ 7 days` | `HOT` |
| 9 | `postedAt` is non-null AND `(now - postedAt)` is between 8 and 21 days (inclusive) | `COOLING` |
| 10 | `postedAt` is non-null AND `(now - postedAt) > 21 days` | `COLD` |
| 11 | `postedAt` is null (no date available) | `COOLING` (conservative fallback — treat as age-uncertain) |

> **Note on DEADLINE + application**: Rule 4 fires for any listing with a closing date within 48 hours, regardless of whether an application exists. A listing can be `DEADLINE` even after applying — this correctly surfaces deadline pressure on an already-applied listing. If the user has set an override (Rule 3), `DEADLINE` does not fire.

> **Note on CLOSED**: A listing is set to `CLOSED` by the machine only on status `Rejected` or `Withdrawn`. The user can also manually close a listing via the override menu, which sets `overrideState: CLOSED, overrideSource: USER`.

---

## 4. Side Effects on Transition

When `vitalityState` changes (previous value ≠ computed value):

1. Set `JobListing.vitalityState` to the new state.
2. Set `JobListing.stateChangedAt` to `now`.
3. Set `JobListing.last_computed_at` to `now` (regardless of whether state changed).
4. Write an `AuditLog` record: `{ source: SYSTEM_RECOMPUTE, listingId, previousState, newState, computedAt: now }`.

When state does **not** change:

1. Set `JobListing.last_computed_at` to `now` (keep the staleness clock fresh).
2. Do **not** write an `AuditLog` record.

---

## 5. Override Behaviour

### Setting an override (user action)
- `vitality-state-machine.ts` exposes `applyUserOverride(listingId, newState)`.
- Sets `overrideState = newState`, `overrideSource = USER`, `vitalityState = newState`, `stateChangedAt = now`.
- Writes `AuditLog`: `{ source: USER_OVERRIDE, listingId, previousState, newState }`.

### Clearing an override (user action)
- `vitality-state-machine.ts` exposes `clearUserOverride(listingId)`.
- Sets `overrideState = null`, `overrideSource = null`.
- Immediately re-evaluates the listing using the standard rule table and applies the computed state.
- Writes `AuditLog`: `{ source: USER_OVERRIDE_CLEARED, listingId, computedState }`.

### Override persistence across background recalculation
- When a background recalculation runs and `overrideSource = USER` is detected (Rule 3), the machine sets `last_computed_at = now` but does **not** change `vitalityState` or write an `AuditLog` record.

### 30-second undo window (Story 2.5)
- The calling Server Action (not the state machine) is responsible for the undo toast.
- Undo calls `applyUserOverride(listingId, previousState)` with the pre-override value.
- If >30 seconds have passed, the undo endpoint returns `{ error: "Undo window expired" }`.

---

## 6. Gmail Signal Integration

- `gmail-signal-processor.ts` calls `vitality-state-machine.ts` directly; it never writes to `vitalityState` itself.
- When a domain match is found, the processor calls `applyGmailSignal(listingId)`.
- `applyGmailSignal` re-evaluates using the rule table; if the current state is `ACTIVE`, `COOLING`, `COLD`, or `GHOSTING` (and no user override is active), Rule 5 fires and state becomes `IN_DIALOGUE`.
- The function writes `AuditLog`: `{ source: GMAIL_SIGNAL, listingId, previousState, newState: IN_DIALOGUE }`.

---

## 7. Prohibited Patterns

- **No direct Prisma writes to `vitalityState` outside this module.** All paths must go through `vitality-state-machine.ts`.
- **No hard-coded thresholds outside this spec.** HOT ≤7 days, COOLING 8–21 days, COLD >21 days, DEADLINE ≤48h, GHOSTING >14 days must match exactly. If any threshold changes, update this spec first, then the code.
- **No state machine invocation on archived listings.** Rule 1 enforces this; any code path that could invoke the machine on an archived listing is a bug.
