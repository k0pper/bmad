# Story 2.3: Living Board View

Status: review

## Story

As a **user**,
I want to see all my tracked listings on a central board,
So that I can scan my entire job search pipeline at a glance.

## Acceptance Criteria

1. All active (non-archived) JobListing records render as BoardRow components — 56px row height, showing: company, title, VitalityBadge, date added, salary range (when available), posting date (relative label when available); each row is a clickable link to `/board/[listingId]`
2. VitalityBadge displays each of the 8 vitality states with a distinct icon, label, and background colour; colour is never the sole signal
3. A user with zero listings sees the EmptyBoardState component with a primary CTA to open ImportDrawer
4. The StalenessBanner is shown when `lastComputedAt` for any listing is more than 2 hours old
5. The layout is desktop-first (1280px baseline); at 768px the sidebar collapses
6. Board rows whose `stateChangedAt > User.lastVisitAt` carry a subtle recency indicator (coloured dot) visible until the timestamp is more than 48 hours old; `User.lastVisitAt` is updated on every board page load

**Note:** ACs 1–3 are already satisfied by stories 2.1 and 2.2. Implementation focus is ACs 4–6.

## Tasks / Subtasks

- [x] Task 1 — Verify ACs 1–3 are satisfied (AC: 1, 2, 3)
  - [x] BoardRow renders all required fields and is clickable
  - [x] VitalityBadge covers all 8 states
  - [x] EmptyBoardState with CTA exists
- [x] Task 2 — StalenessBanner component (AC: 4)
  - [x] Create `src/components/board/StalenessBanner.tsx` — shows when any listing has `lastComputedAt < now - 2h`
  - [x] Wire into board page: pass `hasStaleListings` boolean
- [x] Task 3 — Recency indicator + User.lastVisitAt (AC: 6)
  - [x] Update board page to fetch `User.lastVisitAt` before updating it
  - [x] Update `User.lastVisitAt` to `now` on each board page load via prisma
  - [x] Pass `stateChangedAt` and `lastVisitAt` to BoardRow
  - [x] Add recency dot to BoardRow (shown when `stateChangedAt > lastVisitAt && stateChangedAt > now - 48h`)
- [x] Task 4 — Responsive sidebar collapse at 768px (AC: 5)
  - [x] Add `md:hidden` sidebar toggle button in header area
  - [x] Sidebar hidden on mobile, slides in with Tailwind responsive classes

## Dev Notes

### What's already done
- `BoardRow` renders title, company, VitalityBadge, salary, postedAt relative label, date added — all as clickable link to `/board/[id]`
- `VitalityBadge` covers all 8 `VitalityState` values with icon + label + bg
- `EmptyBoardState` shows phantom rows + "Add your first listing" CTA that opens ImportDrawer
- Board page at `src/app/(dashboard)/board/page.tsx` queries active listings and renders them

### Schema fields available
- `JobListing.lastComputedAt DateTime?` — set by background recalculation (story 2.4); null until then
- `JobListing.stateChangedAt DateTime?` — set when vitalityState changes
- `User.lastVisitAt DateTime?` — updated on board page load

### StalenessBanner
- Show only when `lastComputedAt !== null && lastComputedAt < now - 2h`
- When all listings have `lastComputedAt = null` (story 2.4 not yet run), banner is NOT shown
- Simple informational banner: "Vitality states may be outdated — recalculation runs hourly"

### Recency indicator
- In board page: read `User.lastVisitAt` BEFORE updating it (use old value for indicator logic)
- Update `User.lastVisitAt = new Date()` via `prisma.user.update()`
- Pass old `lastVisitAt` down to each `BoardRow` as `lastVisitAt`
- In BoardRow: show dot if `stateChangedAt !== null && stateChangedAt > lastVisitAt && (now - stateChangedAt) < 48h`
- Dot color: `var(--color-brand)` or similar accent

### Responsive sidebar
- Layout at `src/app/(dashboard)/layout.tsx`
- Sidebar uses `style={{ width: 'var(--sidebar-width)' }}`
- At md (768px): hide sidebar with `hidden md:flex` on aside, show hamburger toggle
- Use React state for mobile open/close — layout must be a Client Component or use a child Client Component for the toggle

### Testing
- Unit tests for StalenessBanner: renders/hides correctly based on prop
- Board page does not need new tests (it's a Server Component with straightforward logic)
- BoardRow: test recency dot renders/hides

### Key constraints
- No `revalidateTag` — board mutations use `router.refresh()`
- Prisma imported from `@/generated/prisma/client`
- Auth.js v5: `auth()` returns session; user id at `session.user.id`
- Server Actions return `ActionResult<T>` — but board page uses direct prisma, no Server Actions needed here

### References
- Board page: `src/app/(dashboard)/board/page.tsx`
- Layout: `src/app/(dashboard)/layout.tsx`
- BoardRow: `src/components/board/BoardRow.tsx`
- BoardClient: `src/components/board/BoardClient.tsx`
- Prisma schema: `prisma/schema.prisma`

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ACs 1–3 already satisfied by stories 2.1 and 2.2 (BoardRow, VitalityBadge, EmptyBoardState)
- StalenessBanner only shows when `lastComputedAt !== null && lastComputedAt < now - 2h`; null (pre-story 2.4) never triggers it
- `User.lastVisitAt` is read before being updated so the old value drives recency logic on the current load
- Sidebar uses `fixed md:static` pattern: overlays with hamburger on mobile, inline in flex row on desktop
- `SidebarShell` extracted as a Client Component to own the open/close state; layout remains a Server Component

### File List

- src/components/board/StalenessBanner.tsx (new)
- src/components/board/BoardRow.tsx (modified)
- src/components/board/BoardClient.tsx (modified)
- src/app/(dashboard)/board/page.tsx (modified)
- src/app/(dashboard)/layout.tsx (modified)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-05 | Story created | bmad-create-story |
| 2026-05-05 | All tasks implemented; status → review | claude-sonnet-4-6 |
