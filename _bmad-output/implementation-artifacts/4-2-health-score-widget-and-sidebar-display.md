# Story 4.2: Health Score Widget & Sidebar Display

Status: done

## Story

As a **user**, I want to see my Health Score and coaching instruction in the sidebar at all times, so that I always know what to do next without navigating away from the board.

## Acceptance Criteria (from epics.md)

1. `HealthScoreWidget` is a Server Component rendered in the dashboard sidebar.
2. Shows the zone glyph (🟢 / 🟡 / 🔴) with a colour-matched background and the coaching instruction in full.
3. No client-side data fetch added to the board load path.
4. When no indicators are active: 🟢 "Your pipeline looks healthy — keep it up".
5. `OVERDUE_FOLLOWUPS` names the specific listing.
6. Legible at 256px sidebar width.

## Implementation

`src/components/health/HealthScoreWidget.tsx` — async Server Component:
1. `auth()` to get the user id.
2. `getHealthScoreForUser(userId)` from Story 4.1 engine.
3. Renders zone glyph + coaching instruction with zone-coloured background tokens (reusing the existing vitality and danger tokens — no new design tokens required).

Wired into `src/app/(dashboard)/layout.tsx` in the existing `data-testid="health-score-slot"` location, wrapped in `<Suspense>` so the rest of the sidebar (brand, nav, user menu) renders without waiting on the engine's DB query. The fallback keeps the existing testid so the snapshot/integration tests that look up the slot still pass.

### Cache strategy

Project-context binds: `router.refresh()`, not `revalidateTag`. Every Server-Action mutation in this codebase already calls `router.refresh()`, which causes the layout (and therefore the widget) to re-render. The widget queries Prisma directly each render — no cache layer. This is consistent with how `/board` and `/cv` work.

### Why no client-side fetch

The widget is a Server Component. It never ships JS. The sidebar continues to render with `<Suspense>` so the score doesn't block the rest of the layout. A first-time user sees the fallback for one paint, then the widget appears.

### Files

- `followcv/src/components/health/HealthScoreWidget.tsx` — created
- `followcv/src/app/(dashboard)/layout.tsx` — modified (mount widget under Suspense)

Suite: 280 tests; tsc/lint/build clean.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story implemented and shipped to main | claude-opus-4-7 |
