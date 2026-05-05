---
title: Application Health Score Specification
version: 1.0
status: approved
created: 2026-05-05
---

# Application Health Score Specification

This document defines the formula, zone thresholds, and deterministic coaching instruction lookup table for the Application Health Score. The score is computed by `health-score-service.ts` and exposed through the `HealthScoreWidget` component.

---

## 1. Purpose

The health score answers the question: **"How well is my job search campaign being managed right now?"** It is a coaching instrument, not a grade. The output is a single integer (0–100) and one coaching instruction. The instruction names specific listings wherever possible.

---

## 2. Zone Thresholds

| Zone | Score range | Emoji | Sidebar treatment |
|---|---|---|---|
| GREEN | ≥ 70 | 🟢 | Subdued — good posture, no urgent action |
| YELLOW | 40–69 | 🟡 | Prominent — one coaching instruction surfaced |
| RED | < 40 | 🔴 | High-contrast — coaching instruction with CTA button |

---

## 3. The Five Indicators

The score is the **weighted sum** of 5 indicators, each returning 0–100 before weighting.

| # | Indicator | Weight | Measures |
|---|---|---|---|
| I1 | Pipeline freshness | 25% | Are listings being added regularly? |
| I2 | Follow-up discipline | 25% | Are overdue follow-ups being cleared? |
| I3 | Active application ratio | 20% | Is the pipeline weighted toward active states? |
| I4 | Deadline awareness | 15% | Are DEADLINE listings being acted on? |
| I5 | Ghosting control | 15% | Is the ghosting backlog growing unchecked? |

**Formula:**
```
score = round(I1 × 0.25 + I2 × 0.25 + I3 × 0.20 + I4 × 0.15 + I5 × 0.15)
```

---

## 4. Indicator Definitions

### I1 — Pipeline Freshness (25%)

Measures whether the user has added listings within the last 7 days.

| Condition | Score |
|---|---|
| ≥3 listings added in last 7 days | 100 |
| 1–2 listings added in last 7 days | 60 |
| Last listing added 8–14 days ago | 30 |
| Last listing added >14 days ago OR 0 total active listings | 0 |

---

### I2 — Follow-up Discipline (25%)

Measures the ratio of cleared follow-up items to total follow-up items due.

Let `due` = count of listings with `followUpDue = true`.
Let `total` = count of active (non-archived) listings.

| Condition | Score |
|---|---|
| `due = 0` | 100 |
| `due / total ≤ 0.10` (≤10% of pipeline is overdue) | 80 |
| `due / total ≤ 0.25` | 50 |
| `due / total ≤ 0.50` | 20 |
| `due / total > 0.50` | 0 |

If `total = 0`, I2 = 100 (no active listings means no overdue items).

---

### I3 — Active Application Ratio (20%)

Measures whether the pipeline has a healthy proportion of applied listings.

Let `applied` = count of listings with `application` record and `status` in `{Applied, Interviewing, On Hold, Offer Received}`.
Let `total` = count of active (non-archived) listings.

| Condition | Score |
|---|---|
| `total = 0` | 0 (no pipeline at all) |
| `applied / total ≥ 0.40` | 100 |
| `applied / total ≥ 0.20` | 70 |
| `applied / total ≥ 0.10` | 40 |
| `applied / total < 0.10` | 10 |

---

### I4 — Deadline Awareness (15%)

Measures whether listings in `DEADLINE` state have been acted on or acknowledged.

Let `unactioned_deadlines` = count of listings where `vitalityState = DEADLINE` AND `application` is null (no apply action taken).

| Condition | Score |
|---|---|
| `unactioned_deadlines = 0` | 100 |
| `unactioned_deadlines = 1` | 40 |
| `unactioned_deadlines ≥ 2` | 0 |

---

### I5 — Ghosting Control (15%)

Measures whether the user is managing or ignoring their ghosting backlog.

Let `ghosting` = count of listings with `vitalityState = GHOSTING`.
Let `total` = count of active (non-archived) listings.

| Condition | Score |
|---|---|
| `total = 0` | 100 |
| `ghosting = 0` | 100 |
| `ghosting / total ≤ 0.15` | 70 |
| `ghosting / total ≤ 0.30` | 30 |
| `ghosting / total > 0.30` | 0 |

---

## 5. Coaching Instruction Lookup Table

The coaching instruction is selected deterministically by finding the **lowest-scoring indicator** and returning the matching instruction. If two indicators tie for lowest, use the one with the higher weight. If weights also tie, use the lower indicator number.

| Lowest indicator | Zone | Instruction template |
|---|---|---|
| I1 (freshness) | YELLOW | "Add a few new listings — your pipeline is running low on fresh opportunities." |
| I1 (freshness) | RED | "Your pipeline has stalled. Add listings now to keep opportunities in play." |
| I2 (follow-up) | YELLOW | "You have {due} follow-up{s} overdue. Chase {first listing name} first." |
| I2 (follow-up) | RED | "{due} applications are waiting for follow-up — act today before they go cold." |
| I3 (active ratio) | YELLOW | "Most of your listings haven't been applied to yet. Pick one and apply today." |
| I3 (active ratio) | RED | "Your pipeline has very few active applications. Apply to at least one listing this week." |
| I4 (deadline) | YELLOW | "{listing name} closes soon — review and decide whether to apply." |
| I4 (deadline) | RED | "{count} listing{s} with imminent deadlines need a decision now." |
| I5 (ghosting) | YELLOW | "{listing name} has gone quiet. Consider a follow-up or close it out." |
| I5 (ghosting) | RED | "Too many applications have gone silent. Review your ghosting listings and decide next steps." |

When a **GREEN** zone is reached (score ≥ 70), the instruction is always:
> "Your search is on track. Keep adding listings and following up regularly."

Template variable rules:
- `{first listing name}` = the oldest overdue follow-up listing's company + title (e.g. "Stripe — Senior Engineer").
- `{due}` = integer count; `{s}` = `"s"` if count > 1, else `""`.
- `{listing name}` = company + title of the first matching listing, sorted by `closingDate ASC` for I4, `appliedAt ASC` for I5.
- `{count}` = integer count.

---

## 6. Computation Timing

- Recomputed as part of the `vitality-recalculate` pg-boss job that runs on the Vercel Cron schedule.
- Result stored in `AppConfig` keyed per-user (or a dedicated `HealthScore` table if query performance requires it — implementation decision for Story 4.1).
- `last_computed_at` on the health score record is used by the dashboard to determine staleness.

---

## 7. Edge Cases

| Situation | Behaviour |
|---|---|
| 0 active listings | Score = 0, zone = RED, instruction = "Add your first listing to get started." |
| All listings archived | Score = 0, zone = RED, instruction = "You have no active listings. Add some to resume tracking." |
| `postedAt` null on all listings | I1 evaluated based on `createdAt` (import date) as proxy |
| Score lands exactly on 70 | GREEN zone |
| Score lands exactly on 40 | YELLOW zone |
