# Story 2.6: Board Filtering, Sorting & Search

Status: review

## Story

As a **user**,
I want to filter, sort, and search my board,
So that I can quickly find specific listings and focus on what needs attention.

## Acceptance Criteria

1. A `FilterChipBar` renders above the board listing rows with one chip per `VitalityState` (8 chips: Hot, Active, Cooling, Cold, Deadline, Ghosting, In Dialogue, Closed) plus a leading "All" chip. "All" is selected by default; clicking an individual chip deselects "All" and toggles that state on/off; multiple chips can be active simultaneously with **OR** semantics (a listing matches the filter if its state appears in any selected chip). Clicking "All" clears all individual selections. No "Apply" button — selections are reactive.
2. Each chip shows a count in parentheses computed from the **full** listing set for the current view (active or archived), not the post-filter set — so counts remain stable as the user toggles chips. Example: `Cooling (3)` always shows 3 even if Cooling is currently deselected.
3. A sort control next to the chip bar offers three options with these semantics:
   - **Date added (newest first)** — default; orders by `createdAt desc` (matches today's behaviour).
   - **Company (A–Z)** — case-insensitive ascending sort by `company`; ties broken by `createdAt desc`.
   - **Deadline (soonest first)** — ascending sort by `closingDate`, with `null` values pushed to the bottom regardless of direction; ties broken by `createdAt desc`.
4. A keyword search input sits to the right of the chip row. As the user types, the visible board filters in **real time** (no debounce required at the AC level, but a small debounce is acceptable) across `title`, `company`, and `notes` — case-insensitive substring match on any of the three fields. Empty query disables the search filter.
5. A "Clear all" control appears whenever any filter, sort change, or search query is active. Clicking it returns the board to the default view (All / Date added / empty query) and removes the corresponding URL params.
6. Filter, sort, and search state is reflected in the URL query string so that filtered views are shareable and back/forward navigation works:
   - `?status=cooling,cold` — comma-separated, lowercase, snake-cased VitalityState values (e.g. `in_dialogue`).
   - `?q=google` — URL-encoded keyword.
   - `?sort=date-added` (default, omitted from URL) | `sort=company` | `sort=deadline`.
   - URL updates **must not trigger a server round-trip** — use `window.history.replaceState({}, "", newUrl)` so the Next.js Server Component does not re-execute on each keystroke or chip toggle.
7. The active filter set is visually indicated: selected chips render with the brand-tinted active style; the search input shows a subtle "filter active" affordance when non-empty; the sort control reflects the current option.
8. When the combined filter / sort / search yields zero rows (but the user has listings on this view), an inline empty state appears in the rows region — copy: "No listings match these filters." plus a `Clear filters` action — distinct from the existing zero-listings `EmptyBoardState` (which keeps showing when the user has zero listings overall).
9. The archived view (`?archived=true`) supports the same filter / sort / search controls; URL state is preserved across the `archived` flag (toggling between active and archived does not clear the chips).
10. Initial page load with filter params in the URL renders the filtered board on the first paint — no flash of unfiltered content. The Client Component reads `useSearchParams()` synchronously on first render to seed its filter state.

## Tasks / Subtasks

- [x] Task 1 — Create `FilterChipBar` Client Component (AC: 1, 2, 7)
  - [x] Create `src/components/board/FilterChipBar.tsx` with `"use client"`.
  - [x] Props: `selectedStates: VitalityState[]`, `counts: Record<VitalityState, number>`, `onToggle: (state: VitalityState) => void`, `onClearAll: () => void`.
  - [x] Render an "All" chip (highlighted when `selectedStates.length === 0`) followed by 8 state chips. Each state chip uses the same icon + colour pair as `VitalityBadge` so the language is consistent.
  - [x] Active chip styling: `bg-brand-subtle text-brand` + 1px brand border; idle: `bg-background text-text-secondary` + `border-border` + hover `bg-brand-subtle/60 text-brand`.
  - [x] Count rendered as ` (n)` suffix in `text-text-tertiary`.
  - [x] Keyboard: chips are real `<button>`s (not divs); `Tab` cycles through them; `Space`/`Enter` toggles. Group has `role="group"` + `aria-label="Filter by vitality state"`.

- [x] Task 2 — Sort dropdown + search input (AC: 3, 4, 7)
  - [x] Inline within `FilterChipBar` (or a sibling component — implementer's call) on the same row, right-aligned.
  - [x] Sort: a `Menu`-based dropdown trigger labelled by the current option (e.g. "Sort: Date added"). Options: `date-added` (default), `company`, `deadline`. Use `@base-ui/react/menu` (same pattern as `VitalityOverrideMenu`).
  - [x] Search: `<input type="search">` with `placeholder="Search title, company, notes…"`, `aria-label="Search listings"`, idle `border-border`, focused `ring-brand/40`. Add a clear-x button inside when value non-empty.

- [x] Task 3 — URL state hook (AC: 6, 10)
  - [x] Create `src/components/board/useBoardFilters.ts` (or inline in `BoardClient`) — a custom hook that:
    - Reads `useSearchParams()` from `next/navigation` for initial state on mount (keys: `status`, `q`, `sort`).
    - Holds `selectedStates`, `query`, `sort` in `useState`.
    - On any change, recomputes the URL query string and calls `window.history.replaceState({}, "", url.toString())` — **never** `router.push` / `router.replace`, which would trigger an RSC re-fetch.
    - Preserves any unrelated params (notably `archived=true`) via `URLSearchParams` round-tripping.
  - [x] Encoding: states are lowercased with underscores (e.g. `in_dialogue`); decode handles both `,` and `%2C`.
  - [x] On `popstate` (browser back/forward), re-read the URL and update local state so the UI matches the URL.

- [x] Task 4 — `BoardClient` refactor (AC: 1, 2, 3, 4, 5, 8, 9)
  - [x] Update `src/components/board/BoardClient.tsx` to receive `listings` (full data) instead of pre-rendered children. Drop the existing `children` prop.
  - [x] Wire the filters hook from Task 3.
  - [x] Compute `filteredListings` in a `useMemo`:
    1. Apply state filter — if `selectedStates.length > 0`, keep listings whose `vitalityState` is in the set (OR semantics).
    2. Apply search — `query.trim().toLowerCase()` and substring-match against `title`, `company`, and `notes` (each lowercased; null `notes` skipped).
    3. Apply sort — the three options from AC 3.
  - [x] Compute `counts` in a separate `useMemo` from the **unfiltered** `listings` (so counts don't shift as chips toggle).
  - [x] Render the existing header (title + "View archived" link + "Add listing" button) → then `FilterChipBar` → then either the filtered rows, the filter-empty-state, or the existing `EmptyBoardState`.
  - [x] Filter-empty-state: visible only when `listings.length > 0 && filteredListings.length === 0`. Copy and CTA per AC 8.
  - [x] Render rows by mapping `filteredListings` to `<BoardRow ... />`. Row renderer (currently in `board/page.tsx`) moves into `BoardClient`.

- [x] Task 5 — Make `BoardRow` a Client Component (AC: 1)
  - [x] Add `"use client"` to `src/components/board/BoardRow.tsx` (it's now rendered from a Client Component).
  - [x] Verify the existing recency-dot logic still works — pass `previousVisitAt` and `nowMs` (or pre-computed `isRecent`) from the Server Component into `BoardClient` so the staleness math runs server-side once and is passed as props.
  - [x] No JSX changes; only the directive and any minor type adjustments if the data shape passed to `BoardClient` changes.

- [x] Task 6 — `board/page.tsx` server-side adjustments (AC: 9, 10)
  - [x] Update `src/app/(dashboard)/board/page.tsx` so the Server Component selects the columns the client will need: add `notes`, `closingDate` to the data shape passed to `BoardClient` (currently `postedAt`, `createdAt`, etc.). Continue to query `findMany({ where: { userId, archived, deletedAt: null } })` — **do not** filter by status/query/sort on the server. Filtering is purely client-side per AC 6.
  - [x] Recency math (`isRecent` per row, `hasStaleListings`) stays server-side. Pass an `isRecent: boolean` field on each listing to `BoardClient`.
  - [x] Keep the `?archived` searchParam handling — that one **does** need a server round-trip (it changes which set of listings is fetched).

- [x] Task 7 — Tests (AC: 1, 2, 3, 4, 5, 6, 8, 9)
  - [x] Pure logic tests — extract the filter/sort/search reducer into a pure function (e.g. `applyBoardFilters(listings, { selectedStates, query, sort })`) and unit-test it in `src/components/board/applyBoardFilters.test.ts`:
    - state filter: empty set → no filtering; one state → matching only; multi-state → OR.
    - search: case-insensitive; matches title / company / notes; null notes are skipped, not crashed.
    - sort: each of the three options, plus the null-`closingDate` push-to-bottom rule.
    - counts: derived from full set, not filtered set.
  - [x] URL hook test — render the hook in a JSDOM test, mutate state, assert `window.history.replaceState` was called with the right URL and that `router.push`/`router.replace` were **not** called. Also test the `popstate` round-trip.
  - [x] Component test — render `FilterChipBar`, click a chip, assert the toggle callback fired with the right state; click "All" with chips active, assert clear-all fired.
  - [x] Integration test — render `BoardClient` with a mock listings array; toggle chips and search input; assert visible rows match expectations.

## Dev Notes

### What's already in place

- Server Component `src/app/(dashboard)/board/page.tsx` queries Prisma and renders `BoardRow` children passed into `BoardClient`. The `archived` searchParam is already supported (Story 2.5).
- `BoardClient` is a thin Client Component wrapping the rows, the empty state, and the import drawer.
- `VitalityBadge` already exposes the icon+colour pair used by the chips. Reuse the same colour tokens (`--color-vitality-*`) so chips and badges read as the same visual language.
- `JobListing` already has `notes` (nullable string) and `closingDate` (nullable date) — no schema change needed.
- Loading skeleton at `src/app/(dashboard)/board/loading.tsx` is server-side; filter changes don't navigate, so no skeleton needed for filter interactions.
- The codebase uses `router.refresh()` (not `revalidateTag`) after **mutations**. This story has **no mutations** — filtering is read-only client state — so neither `refresh` nor `revalidateTag` should appear in the new code.

### URL state without server round-trip — the canonical pattern

The AC explicitly forbids round-tripping the server on filter changes. In the Next.js App Router, calling `router.push` or `router.replace` re-runs the Server Component for the new URL even when only query params changed. To sync URL and client state without that:

```ts
const url = new URL(window.location.href)
const params = new URLSearchParams(url.search)

// preserve unrelated params (e.g. ?archived=true)
if (selectedStates.length === 0) params.delete("status")
else params.set("status", selectedStates.map(s => s.toLowerCase()).join(","))

if (query.trim().length === 0) params.delete("q")
else params.set("q", query)

if (sort === "date-added") params.delete("sort")
else params.set("sort", sort)

const next = `${url.pathname}${params.toString() ? `?${params}` : ""}`
window.history.replaceState({}, "", next)
```

Next.js detects `window.history.*` calls and treats them as no-op routing — see [Next.js App Router docs §window.history](https://nextjs.org/docs/app/api-reference/functions/use-router#using-the-native-history-api). `useSearchParams()` doesn't react to `replaceState` (it's tied to the Next router), so the Client Component must hold its own state.

For browser back/forward to work, attach a `popstate` listener that re-parses the URL into local state.

### Filter / sort / search are PURELY client-side

The Server Component fetches all of the user's listings for the current archived view (typically ≤25 on free tier, ≤100 per the perf target — both trivially small for in-memory filtering). Do **not** push the filter into the Prisma where clause — that would force a server round-trip on every chip toggle and keystroke, contradicting AC 6.

Two consequences worth being explicit about:

1. **Counts come from the full set, not the filtered set.** If the user has 8 Cooling listings and toggles the Cooling chip off, the chip still reads "Cooling (8)". This is intentional — the counts answer "how many of each type do I have?", not "how many am I currently looking at?".
2. **`?archived=true` is the exception.** Toggling between active and archived does change the underlying query, so it's the only filter param that's a real navigation (handled by the existing "View archived" `<Link>`). All other filter params live in the client and never hit the server.

### Sort semantics — the null edge case

For `sort=deadline`, listings with `closingDate === null` are pushed to the bottom regardless of sort direction. Algorithm: split into `withDeadline` and `noDeadline`, sort `withDeadline` ascending by `closingDate`, then concatenate with `noDeadline` (sorted by `createdAt desc` for stability).

For `sort=company`, use `localeCompare(b.company, undefined, { sensitivity: "base" })` so umlauts / case differences sort alphabetically.

### Filter-empty-state vs. zero-listings-state

There are now **two** empty states on the board, and they must not be confused:

- **Zero listings overall** (`listings.length === 0`) → existing `EmptyBoardState` with the "Add your first listing" CTA + import drawer trigger. Unchanged.
- **Filters yield zero** (`listings.length > 0 && filteredListings.length === 0`) → new inline message: "No listings match these filters." with a "Clear filters" button that calls the same `onClearAll` as the chip bar.

The new state is rendered inside the rows container (where rows would otherwise be), not full-bleed. Skeleton-shaped placeholder rows are NOT used here — the user knows there's data, they just filtered it out.

### Component structure

```
BoardClient (Client Component, owns filter state + URL sync)
├── header row (title, View archived link, Add listing button)
├── FilterChipBar (chips + sort dropdown + search input)
├── filter-empty-state | EmptyBoardState | rows
│   └── BoardRow (Client Component now — was Server Component before)
└── ImportDrawer
```

`BoardRow` adds `"use client"` because it's now rendered from a Client Component. Its existing children (`VitalityOverrideMenu`, `BoardRowOverflowMenu`) are already Client Components, so the change is essentially a directive flip.

### Search input — debounce decision

A 100–200ms debounce on the search input is reasonable but not required by the AC. With ≤100 listings the in-memory filter is sub-millisecond; the only reason to debounce is to reduce `window.history.replaceState` thrash. Either approach passes AC. Keep it simple — no debounce — unless React DevTools shows pathological re-renders.

### Performance — useMemo dependencies

`filteredListings` depends on `listings, selectedStates, query, sort`. `counts` depends only on `listings`. Memoise both. The whole pipeline is sub-millisecond at AC scale; no need for virtualisation.

### State shape and types

```ts
type SortOption = "date-added" | "company" | "deadline"

type BoardFilterState = {
  selectedStates: VitalityState[]
  query: string
  sort: SortOption
}

// Pure function — testable independently of React.
function applyBoardFilters(
  listings: BoardListing[],
  state: BoardFilterState
): BoardListing[]
```

Where `BoardListing` is the shape `BoardClient` receives from the Server Component — extend it now to include `notes: string | null` and `closingDate: Date | null` (currently absent).

### URL encoding details

- States in URL are lowercased and use the underscore form already on the enum (`in_dialogue` not `in dialogue` not `inDialogue`). Decode by uppercasing and matching the `VitalityState` enum; ignore unknown values rather than throwing.
- `q` is URL-encoded; `URLSearchParams` handles this automatically.
- `sort` is omitted entirely when equal to the default (`date-added`) so default URLs stay clean.

### Files touched (reference)

- `src/components/board/FilterChipBar.tsx` — NEW
- `src/components/board/applyBoardFilters.ts` — NEW (pure filter/sort function)
- `src/components/board/applyBoardFilters.test.ts` — NEW
- `src/components/board/useBoardFilters.ts` — NEW (or inline in BoardClient)
- `src/components/board/BoardClient.tsx` — UPDATE (data-driven rendering, filter wiring, URL sync)
- `src/components/board/BoardRow.tsx` — UPDATE (add `"use client"`; minor prop adjustment if `isRecent` moves to props)
- `src/app/(dashboard)/board/page.tsx` — UPDATE (pass listings as data not children; expand fields; pre-compute `isRecent` per row)

### Constraints

- **No server-side filtering.** The Prisma query stays as it is for the active board / archived board: `findMany({ where: { userId, archived, deletedAt: null } })`. AC 6's "no full server round-trip" is the binding constraint.
- **Do not call `router.refresh` / `router.push` / `router.replace`** in the new filter code. Use `window.history.replaceState` only. `router.refresh` is reserved for mutation-driven cache invalidation in this codebase and has no role in filtering.
- **Do not violate the Neon HTTP transaction rules.** This story has no mutations, so `*Many` and `$transaction` should not appear at all. See [followcv/project-context.md](../../followcv/project-context.md).
- **Do not push a debounce dependency.** If a debounce is needed, write a small `useDebouncedValue` hook inline; don't add `lodash.debounce` or similar.
- **Do not break Story 2.5's interactive cells.** The override menu and overflow menu currently `e.preventDefault() + e.stopPropagation()` to keep the row's outer `<Link>` from navigating. That contract is independent of filtering and must keep working after the BoardRow client-isation.

### References

- Epic AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6]
- UX filtering pattern: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Filtering Patterns]
- Existing board page: [Source: followcv/src/app/(dashboard)/board/page.tsx]
- Existing BoardClient: [Source: followcv/src/components/board/BoardClient.tsx]
- Cache strategy (router.refresh, not revalidateTag — relevant only by exclusion): [Source: followcv/project-context.md]
- Base UI menu pattern (for the sort dropdown): [Source: followcv/src/components/board/VitalityOverrideMenu.tsx]
- Vitality state colour tokens (for chip styling): [Source: followcv/src/app/globals.css#vitality-state-badge-system]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

### Completion Notes List

- `applyBoardFilters` is a pure function in `src/components/board/applyBoardFilters.ts` with a generic over a structural `FilterableListing` type. The board's full row type extends it. State filter, search (case-insensitive substring across title + company + notes, null notes safe), and the three sort orders are all implemented; the `deadline` sort splits into with-deadline (asc by `closingDate`) and no-deadline (sorted by `createdAt desc`) and concatenates so nulls land at the bottom regardless of direction.
- `countByVitalityState` runs once per render of the unfiltered list (memoised in `BoardClient`) so chip counts stay stable as chips toggle.
- `useBoardFilters` reads `useSearchParams()` only for change-detection re-subscription; URL writes go exclusively through `window.history.replaceState`. The hook never calls `router.push`/`replace`/`refresh` — the test suite asserts this explicitly. A `popstate` listener round-trips browser back/forward into local state.
- URL encoding: states comma-joined and lowercased (e.g. `cooling,cold`); `q` URL-encoded by `URLSearchParams`; `sort=date-added` is omitted from the URL so default views stay clean. Unknown values in the `status` param are dropped quietly rather than throwing.
- `FilterChipBar` reuses `VITALITY_BADGE_CONFIG` (newly exported from `VitalityBadge.tsx`) so chip icon + colour are the same single source of truth as the badges. Active state-chips render with the badge's own background colour to keep the visual language coherent. The "All" chip is highlighted only when no individual state chips are active and clears all when clicked while any state is active.
- The sort dropdown uses `@base-ui/react/menu` (same pattern as `VitalityOverrideMenu`). Search uses `<input type="search">` with an inline clear-x that appears only when non-empty.
- `BoardClient` was rewritten to be data-driven: it now receives `listings` (data) instead of pre-rendered children. The Server Component (`board/page.tsx`) now pre-computes `isRecent` per row and passes the listings as `BoardListing[]`, keeping the recency math server-side (depends on `User.lastVisitAt`).
- `BoardRow` gained the `"use client"` directive since it's now rendered from a Client Component. JSX and prop shape are otherwise unchanged.
- Two distinct empty states coexist: the existing `EmptyBoardState` for zero-listings, and a new inline `FilterEmptyState` rendered inside the rows region when filters narrow to zero. Both stay visually distinct.
- Tests: 4 new files, 38 new tests — `applyBoardFilters.test.ts` (14), `useBoardFilters.test.ts` (9), `FilterChipBar.test.tsx` (9), `BoardClient.test.tsx` (6). The hook tests assert that `router.push`/`replace`/`refresh` are NEVER called (only `window.history.replaceState`).
- Validations: `tsc --noEmit` clean, `eslint src` clean, `npm run test:run` — 14 files, 149 tests, all green.

### File List

- `followcv/src/components/board/applyBoardFilters.ts` — created
- `followcv/src/components/board/applyBoardFilters.test.ts` — created
- `followcv/src/components/board/useBoardFilters.ts` — created
- `followcv/src/components/board/useBoardFilters.test.ts` — created
- `followcv/src/components/board/FilterChipBar.tsx` — created
- `followcv/src/components/board/FilterChipBar.test.tsx` — created
- `followcv/src/components/board/BoardClient.tsx` — modified (data-driven rendering + filter pipeline + URL sync wiring)
- `followcv/src/components/board/BoardClient.test.tsx` — created
- `followcv/src/components/board/BoardRow.tsx` — modified (added `"use client"`)
- `followcv/src/components/vitality/VitalityBadge.tsx` — modified (exported `VITALITY_BADGE_CONFIG`)
- `followcv/src/app/(dashboard)/board/page.tsx` — modified (passes listings as data; pre-computes `isRecent` per row; expanded fields to include `notes`, `closingDate`)
- `_bmad-output/implementation-artifacts/2-6-board-filtering-sorting-search.md`

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-06 | Story created | bmad-create-story |
| 2026-05-06 | All tasks implemented; lint, types, 149 tests green; status → review | claude-opus-4-7 |
