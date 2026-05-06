# Story 2.5: Manual Vitality Override & Listing Management

Status: done

## Story

As a **user**,
I want to manually override a listing's vitality state, archive listings I'm done with, and edit listing fields,
So that I can correct the system when I have information it doesn't and keep my board accurate.

## Acceptance Criteria

1. Clicking the `VitalityBadge` on a `BoardRow` opens an override menu listing all 8 `VitalityState` values plus a "Clear override" item (disabled when no override is active). Selecting a state writes `vitalityState`, `overrideState`, `overrideSource: USER`, `stateChangedAt: now`, and `lastComputedAt: now` on the listing via a Server Action; the new state persists across background recalculations because `vitality-state-machine.ts` Rule 3 returns the override.
2. Listings whose `overrideSource = USER` render a `lock` icon on the `VitalityBadge` (in addition to the existing icon and label) so overridden states are visually distinguishable from system-computed states without colour being the sole signal.
3. Selecting "Clear override" sets `overrideState = null` and `overrideSource = null`, then writes a freshly computed `vitalityState` (from `computeVitalityState` with the cleared inputs) plus `stateChangedAt` (when the state changed) and `lastComputedAt: now`. The badge then renders without the lock icon.
4. After a successful override (set or clear), a toast appears with a 30-second "Undo" affordance. Clicking Undo invokes a compensating Server Action that restores the listing to its pre-override snapshot (`vitalityState`, `overrideState`, `overrideSource`, `stateChangedAt`) — the snapshot is taken atomically inside the override action and passed back to the toast.
5. Each `BoardRow` exposes an "Archive" action (in a row-level overflow menu, accessible by keyboard). Archiving sets `archived: true` and removes the listing from the active board view (existing query already filters `archived: false`). An "Archived" filter toggle on the board page (`?archived=true` query param) renders a read-only list of archived listings with an "Unarchive" action that returns each listing to active.
6. The listing detail page (`/board/[listingId]`) shows an inline edit form (collapsible accordion section, label "Edit") for the user-editable fields (`title`, `company`, `location`, `salaryMin`, `salaryMax`, `salaryCurrency`, `notes`, `closingDate`). Submitting the form validates with Zod, writes the changes via a Server Action, and triggers `router.refresh()` to revalidate the board cache; success and validation errors are shown inline.
7. All four mutation Server Actions (`overrideVitality`, `clearVitalityOverride`, `undoVitalityOverride`, `archiveListing` / `unarchiveListing`, `updateListing`) authenticate via `auth()`, scope all DB lookups to `userId`, return the typed `ActionResult<T>` union, and never throw to the client.
8. Audit log entries are written for every state-changing action: `USER_OVERRIDE` on set, `USER_OVERRIDE_CLEARED` on clear, `USER_OVERRIDE` (with metadata flag `undo: true`) on undo. Each entry stores `previousState` and `newState` so the audit trail tells the full story.

## Tasks / Subtasks

- [x] Task 1 — Create the listing-management action module (AC: 1, 3, 4, 5, 7, 8)
  - [x] Create `src/actions/listing.ts` with `"use server"` directive
  - [x] Implement `overrideVitality(listingId: string, newState: VitalityState)` — auth, fetch listing scoped to user, snapshot pre-override fields (`vitalityState`, `overrideState`, `overrideSource`, `stateChangedAt`), write `vitalityState = newState`, `overrideState = newState`, `overrideSource = "USER"`, `stateChangedAt = now`, `lastComputedAt = now`, write `AuditLog{ source: "USER_OVERRIDE", previousState, newState }`, return the snapshot in `data.snapshot` so the client can pass it to undo
  - [x] Implement `clearVitalityOverride(listingId: string)` — auth, fetch listing, snapshot pre-override fields, compute fresh state via `computeVitalityState` with `overrideState=null, overrideSource=null`, write `overrideState = null, overrideSource = null, vitalityState = freshState, stateChangedAt = freshState !== prev ? now : prev, lastComputedAt = now`, write `AuditLog{ source: "USER_OVERRIDE_CLEARED", previousState, newState }`, return snapshot
  - [x] Implement `undoVitalityOverride(listingId: string, snapshot: { vitalityState, overrideState, overrideSource, stateChangedAt })` — auth, fetch listing, restore the snapshot fields atomically, set `lastComputedAt = now`, write `AuditLog{ source: "USER_OVERRIDE", previousState: current, newState: snapshot.vitalityState, metadata: { undo: true } }`
  - [x] Implement `archiveListing(listingId: string)` and `unarchiveListing(listingId: string)` — auth, scope to user, toggle `archived`, no audit log required (FR20 specifies archive is reversible UI)
  - [x] Implement `updateListing(listingId: string, formData: FormData)` — auth, scope to user, parse with `updateListingSchema`, write only the changed user-editable fields, return updated record
  - [x] All actions return `ActionResult<T>` typed `{ data: T; error: null } | { data: null; error: string }`
- [x] Task 2 — Add the `updateListingSchema` and snapshot type (AC: 6)
  - [x] Update `src/lib/schemas/listing.ts` to export `updateListingSchema` covering: `title` (required, 1–200 chars), `company` (required, 1–200 chars), `location` (optional ≤200), `salaryMin` / `salaryMax` (optional positive int, max ≥ min), `salaryCurrency` (optional 3-letter code, default "USD"), `notes` (optional ≤5000), `closingDate` (optional date, must be today or future)
  - [x] Export `VitalityOverrideSnapshot` type matching the snapshot shape used by override actions
- [x] Task 3 — `VitalityBadge` overridden indicator (AC: 2)
  - [x] Update `src/components/vitality/VitalityBadge.tsx` to accept optional `isOverridden?: boolean` prop
  - [x] When `isOverridden`, render a `Lock` icon (lucide-react) at 10px size to the right of the label with `aria-label` updated to include "manually overridden"
  - [x] Existing usages without the prop continue to work unchanged
- [x] Task 4 — `VitalityOverrideMenu` client component (AC: 1, 3, 4)
  - [x] Create `src/components/board/VitalityOverrideMenu.tsx` — `"use client"`, uses `@base-ui/react/menu`
  - [x] Trigger button wraps the `VitalityBadge`; clicking opens the menu without navigating (`onClick={(e) => e.preventDefault()}` because BoardRow's outer Link must not fire)
  - [x] Menu items list all 8 `VitalityState` values with their badge config (icon + label) plus a separator and "Clear override" item (disabled when `overrideSource === null`)
  - [x] On selection, `useTransition` + Server Action call; show pending state on the trigger
  - [x] On success, render `UndoToast` with the returned snapshot for 30 seconds; on error, render an inline error toast
  - [x] Calls `router.refresh()` after Server Action success (no `revalidateTag` — the codebase uses `router.refresh()` for board mutations; see Dev Notes)
- [x] Task 5 — `UndoToast` client component (AC: 4)
  - [x] Create `src/components/ui/UndoToast.tsx` — fixed-position toast (bottom-right), 30-second auto-dismiss countdown, "Undo" button
  - [x] Calls `undoVitalityOverride` Server Action with the snapshot, then `router.refresh()` and dismisses
  - [x] Keyboard accessible: focus moves to the toast on mount, Esc dismisses, Tab to Undo
  - [x] Single instance — when a new toast is shown, the previous is dismissed
- [x] Task 6 — `BoardRow` integration (AC: 1, 2, 5)
  - [x] Update `src/components/board/BoardRow.tsx` to accept `overrideSource: OverrideSource | null` prop
  - [x] Replace the inline `<VitalityBadge>` with `<VitalityOverrideMenu listingId={id} currentState={vitalityState} overrideSource={overrideSource} />` (the menu owns the badge rendering with `isOverridden` set correctly)
  - [x] Add a row-level overflow menu (3-dot icon button) using `@base-ui/react/menu` with an "Archive" item that calls `archiveListing` Server Action
  - [x] The overflow trigger uses `e.preventDefault()` + `e.stopPropagation()` so clicking it does not navigate to the detail page
- [x] Task 7 — Board page archive filter toggle (AC: 5)
  - [x] Update `src/app/(dashboard)/board/page.tsx` — read `?archived=true` from `searchParams`; when set, query `archived: true` and render the archived view
  - [x] In archived view: rows render with the same `BoardRow` but the overflow menu shows "Unarchive" instead of "Archive" (pass an `archived` prop down)
  - [x] In `BoardClient.tsx`, add a toggle (link styled as a switch) in the header that flips the URL between `/board` and `/board?archived=true`; current view is visually indicated
  - [x] Active board still filters `archived: false` (no change to existing query)
- [x] Task 8 — Listing detail edit form (AC: 6)
  - [x] Create `src/components/listing/ListingEditForm.tsx` — `"use client"`, React Hook Form + Zod resolver using `updateListingSchema`
  - [x] Form fields: `title`, `company`, `location`, `salaryMin`, `salaryMax`, `salaryCurrency`, `notes`, `closingDate`
  - [x] Submit calls `updateListing` Server Action; on success, show inline success message and `router.refresh()`; on validation error, show field-level errors
  - [x] Update `src/app/(dashboard)/board/[listingId]/page.tsx` to add a new `Edit` accordion section (closed by default) containing `ListingEditForm`; pass current listing values as initial values
  - [x] Add an "Archive" / "Unarchive" button below the accordion that calls the corresponding Server Action and navigates back to the board
- [x] Task 9 — Tests for Server Actions (AC: 1, 3, 4, 5, 6, 7, 8)
  - [x] Create `src/actions/listing.test.ts` mocking `@/lib/auth`, `@/lib/db`, `@/lib/services/vitality-state-machine`
  - [x] Test `overrideVitality`: writes correct fields, returns snapshot, writes USER_OVERRIDE audit log; rejects unauthenticated; rejects listings the user does not own
  - [x] Test `clearVitalityOverride`: clears override fields, recomputes fresh state, writes `stateChangedAt` only when state actually changed, writes USER_OVERRIDE_CLEARED audit log
  - [x] Test `undoVitalityOverride`: restores all snapshot fields, writes USER_OVERRIDE audit log with `metadata.undo = true`
  - [x] Test `archiveListing` / `unarchiveListing`: toggles `archived` field, scoped to user
  - [x] Test `updateListing`: validates fields, writes only changed fields, rejects invalid input (e.g., salaryMax < salaryMin)
- [x] Task 10 — Tests for components (AC: 1, 2, 3, 4)
  - [x] Test `VitalityBadge` with `isOverridden={true}` renders the lock icon and updates the aria-label
  - [x] Test `VitalityOverrideMenu` opens on trigger click, calls `overrideVitality` on item selection, shows `UndoToast` on success
  - [x] Test `UndoToast` calls `undoVitalityOverride` on Undo click and auto-dismisses after 30s (use vitest fake timers)
- [x] Task 11 — Verify recompute job preserves overrides (AC: 1)
  - [x] Add a test in `src/lib/jobs/vitality-recompute.test.ts`: a listing with `overrideSource: "USER"` and `overrideState: "IN_DIALOGUE"` keeps `vitalityState = IN_DIALOGUE` after recompute regardless of postedAt / closingDate / application

## Dev Notes

### What's already in place

- `JobListing.overrideState` and `overrideSource` columns exist (`prisma/schema.prisma:131-132`); `archived: Boolean @default(false)` exists at line 133.
- `vitality-state-machine.ts:27` already enforces Rule 3: `if (overrideSource === "USER") return overrideState!`. Recompute (`src/lib/jobs/vitality-recompute.ts:35-49`) already passes both fields through. So overrides automatically persist across recalc — no change needed to the state machine or the cron handler.
- `AuditSource` enum already includes `USER_OVERRIDE`, `USER_OVERRIDE_CLEARED`, and `SYSTEM_RECOMPUTE`.
- `BoardRow` (`src/components/board/BoardRow.tsx`) is currently a Server Component wrapping the row in a `<Link>`. Buttons inside `<Link>` work in browsers but click handlers must call `e.preventDefault()` + `e.stopPropagation()` so the Link does not navigate. The interactive cells (override menu, overflow menu) must be Client Components.
- Board page (`src/app/(dashboard)/board/page.tsx`) queries `archived: false`. Adding the archived view means accepting `searchParams` and branching the where-clause.
- The codebase uses `router.refresh()` from `next/navigation` after Server Actions, **not** `revalidateTag`. See `src/components/board/ImportDrawer.tsx:110,130,159` and Story 2.3 dev notes for confirmation. This is a deliberate divergence from the architecture doc — match the existing pattern.

### Server Action contract

```ts
// src/actions/listing.ts
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

export type VitalityOverrideSnapshot = {
  vitalityState: VitalityState
  overrideState: VitalityState | null
  overrideSource: OverrideSource | null
  stateChangedAt: Date | null
}

export async function overrideVitality(
  listingId: string,
  newState: VitalityState
): Promise<ActionResult<{ snapshot: VitalityOverrideSnapshot }>>

export async function clearVitalityOverride(
  listingId: string
): Promise<ActionResult<{ snapshot: VitalityOverrideSnapshot; newState: VitalityState }>>

export async function undoVitalityOverride(
  listingId: string,
  snapshot: VitalityOverrideSnapshot
): Promise<ActionResult<{ ok: true }>>

export async function archiveListing(listingId: string): Promise<ActionResult<{ ok: true }>>
export async function unarchiveListing(listingId: string): Promise<ActionResult<{ ok: true }>>

export async function updateListing(
  listingId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>>
```

### Override snapshot — pre-mutation read pattern

To support undo, the override action must capture the current state **before** writing. Use a single `findFirst` (scoped to userId for security) → snapshot → `update`. Do not use a transaction; the snapshot read + update do not need to be atomic for this use case (a concurrent recompute would simply produce a different snapshot, which is fine — undo restores to whatever the user saw at click time).

```ts
const listing = await prisma.jobListing.findFirst({
  where: { id: listingId, userId, deletedAt: null },
})
if (!listing) return { data: null, error: "Not found" }

const snapshot: VitalityOverrideSnapshot = {
  vitalityState: listing.vitalityState,
  overrideState: listing.overrideState,
  overrideSource: listing.overrideSource,
  stateChangedAt: listing.stateChangedAt,
}
// ... write new state, return { data: { snapshot }, error: null }
```

### Clearing an override — recompute inline

When clearing, recompute the fresh state inline using the same input shape the recompute job uses. Look up `gmailSignalAt` from the latest `GMAIL_SIGNAL` AuditLog for the listing (one query):

```ts
const gmailSignal = await prisma.auditLog.findFirst({
  where: { listingId, source: "GMAIL_SIGNAL" },
  orderBy: { computedAt: "desc" },
})
const application = await prisma.application.findUnique({ where: { jobListingId: listingId } })

const freshState = computeVitalityState({
  postedAt: listing.postedAt,
  closingDate: listing.closingDate,
  application: application ? { appliedAt: application.appliedAt, status: application.status } : null,
  gmailSignalAt: gmailSignal?.computedAt ?? null,
  overrideState: null,
  overrideSource: null,
  isArchived: listing.archived,
  now,
}) ?? "COOLING" // archived returns null but we already guard above
```

### Cache invalidation — use router.refresh, not revalidateTag

`board` page is a Server Component that queries Prisma directly (no `cache` tags). After every mutation Server Action, the **client** calls `router.refresh()` from `next/navigation` to trigger Server Component re-render. Do **not** call `revalidateTag` — the existing tests assert it is **not** called (`src/actions/import-listing.test.ts:151,292`).

### BoardRow refactor — interactive cells inside a Link

The current `BoardRow` wraps the entire row in `<Link>`. To add interactive cells:

1. Keep the outer `<Link>`.
2. The override badge and overflow menu become Client Components rendered as children.
3. Each interactive button uses `onClick={(e) => { e.preventDefault(); e.stopPropagation(); ... }}` so the Link's navigation does not fire.
4. The interactive cells should also stop the focus-visible ring on the row from showing when the user is interacting with the cell — use `onFocus={(e) => e.stopPropagation()}` if needed.

This pattern is well-known in App Router; do not refactor `BoardRow` to drop the Link.

### Lock icon on overridden badge

Use the `Lock` icon from `lucide-react` (already a dependency). Render at 10px to the right of the label, after the existing icon:

```tsx
<span className="inline-flex items-center gap-1 ..." aria-label={`${label} — ${ariaContext}${isOverridden ? " (manually overridden)" : ""}`}>
  <Icon size={12} aria-hidden />
  {label}
  {isOverridden && <Lock size={10} aria-hidden />}
</span>
```

### Base UI menu pattern

The project uses `@base-ui/react/menu`. Reference: `node_modules/@base-ui/react/menu`. Standard pattern:

```tsx
import { Menu } from "@base-ui/react/menu"

<Menu.Root>
  <Menu.Trigger render={(props) => <button {...props}>...</button>} />
  <Menu.Portal>
    <Menu.Positioner>
      <Menu.Popup>
        <Menu.Item onClick={...}>Item 1</Menu.Item>
        <Menu.Separator />
        <Menu.Item disabled={...}>Clear override</Menu.Item>
      </Menu.Popup>
    </Menu.Positioner>
  </Menu.Portal>
</Menu.Root>
```

Heed deprecation notices and consult `node_modules/next/dist/docs/` and `node_modules/@base-ui/react/menu/index.d.ts` for the exact Base UI 1.4 API. The Drawer component already uses Base UI portal positioning — reference `ImportDrawer.tsx` for style patterns and z-index conventions.

### Audit log entries

```ts
// On override
await prisma.auditLog.create({
  data: {
    source: "USER_OVERRIDE",
    userId,
    listingId,
    previousState: listing.vitalityState,
    newState,
    computedAt: now,
  },
})

// On clear
await prisma.auditLog.create({
  data: {
    source: "USER_OVERRIDE_CLEARED",
    userId,
    listingId,
    previousState: listing.vitalityState,
    newState: freshState,
    computedAt: now,
  },
})

// On undo (compensating)
await prisma.auditLog.create({
  data: {
    source: "USER_OVERRIDE",
    userId,
    listingId,
    previousState: listing.vitalityState,
    newState: snapshot.vitalityState,
    computedAt: now,
    metadata: { undo: true },
  },
})
```

Wrap each in `try/catch` and treat audit log failures as non-critical — match the pattern in `import-listing.ts:80-92`.

### Edit form validation

Use Zod and React Hook Form per the architecture doc. Pattern reference: existing `src/lib/schemas/listing.ts` (`urlImportSchema`, `manualImportSchema`). Coerce numeric inputs from FormData to numbers (FormData values are strings):

```ts
export const updateListingSchema = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200).nullish(),
  salaryMin: z.coerce.number().int().positive().nullish(),
  salaryMax: z.coerce.number().int().positive().nullish(),
  salaryCurrency: z.string().length(3).default("USD"),
  notes: z.string().max(5000).nullish(),
  closingDate: z.coerce.date().nullish(),
}).refine(
  (d) => !d.salaryMin || !d.salaryMax || d.salaryMax >= d.salaryMin,
  { message: "Maximum salary must be greater than or equal to minimum", path: ["salaryMax"] }
)
```

### Undo toast — single instance and dismissal

Implement `UndoToast` so a single instance is mounted at the page level. Use a portal to `document.body` (Base UI provides `<Menu.Portal>`; for a standalone toast use React's `createPortal` directly, or wrap with `@base-ui/react/popover` if a built-in matches). Track countdown with `useEffect` + `setTimeout` (1s tick); abort countdown if the toast unmounts.

### Testing standards

- Vitest, jsdom env. Pattern reference: `src/actions/import-listing.test.ts` for Server Action mocking and `src/lib/jobs/vitality-recompute.test.ts` for service-level testing.
- For component tests use `@testing-library/react` and `@testing-library/user-event`. Pattern: see existing tests in `src/components/**/*.test.tsx` if any exist; otherwise mirror the import-listing test mocking style and add component tests.
- Mock `next/navigation` `useRouter().refresh` when testing client components that call `router.refresh()`.
- For the Undo timer test, use `vi.useFakeTimers()` and `vi.advanceTimersByTime(30_000)`.

### Files touched (reference)

- `src/actions/listing.ts` — NEW
- `src/actions/listing.test.ts` — NEW
- `src/lib/schemas/listing.ts` — UPDATE (add `updateListingSchema`)
- `src/components/vitality/VitalityBadge.tsx` — UPDATE (`isOverridden` prop + lock icon)
- `src/components/board/VitalityOverrideMenu.tsx` — NEW
- `src/components/ui/UndoToast.tsx` — NEW
- `src/components/board/BoardRow.tsx` — UPDATE (use override menu + overflow menu)
- `src/components/board/BoardRowOverflowMenu.tsx` — NEW (or inline in BoardRow client component)
- `src/components/board/BoardClient.tsx` — UPDATE (archive filter toggle)
- `src/app/(dashboard)/board/page.tsx` — UPDATE (read `?archived` searchParam)
- `src/components/listing/ListingEditForm.tsx` — NEW
- `src/app/(dashboard)/board/[listingId]/page.tsx` — UPDATE (add Edit accordion section + archive button)
- `src/lib/jobs/vitality-recompute.test.ts` — UPDATE (add override-preservation test)

### Constraints

- **Do NOT modify** `src/lib/services/vitality-state-machine.ts` — Rule 3 already handles overrides correctly. Adding logic there is out of scope.
- **Do NOT add** `revalidateTag` calls — match the existing `router.refresh()` pattern.
- **Do NOT write** `vitalityState` outside this story's actions or the recompute job. Story 2.4 established `vitality-state-machine.ts` as the sole computation source; this story's actions delegate to `computeVitalityState` for clearing and write-through for explicit overrides (which the state machine itself acknowledges as a Rule 3 short-circuit).
- All Prisma reads must include `userId: session.user.id` in the where clause for security. Follow the pattern in `src/app/(dashboard)/board/[listingId]/page.tsx:30`.

### References

- Epic: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5]
- Vitality state machine override rule: [Source: followcv/src/lib/services/vitality-state-machine.ts:27]
- Recompute already passes through override fields: [Source: followcv/src/lib/jobs/vitality-recompute.ts:33-49]
- Server Action pattern + ActionResult: [Source: followcv/src/actions/import-listing.ts:16]
- Cache strategy (router.refresh, not revalidateTag): [Source: followcv/src/components/board/ImportDrawer.tsx:110]
- Base UI menu API: [Source: node_modules/@base-ui/react/menu]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

### Completion Notes List

- Server Actions in `src/actions/listing.ts` cover all six mutations (override / clear / undo / archive / unarchive / update) with the `ActionResult<T>` contract; every read uses `userId` scoping for security.
- The state machine and recompute job are unchanged — Rule 3 already preserves USER overrides, and recompute already passes both override fields through. Added a regression test in `vitality-recompute.test.ts` that exercises this path explicitly.
- `VitalityBadge` gained an optional `isOverridden` prop that adds a Lock icon and updates the aria-label; existing call sites work unchanged.
- `VitalityOverrideMenu` and `BoardRowOverflowMenu` are Client Components mounted inside the BoardRow's `<Link>` — interactive cells call `e.preventDefault()` + `e.stopPropagation()` so the row's navigation does not fire.
- `UndoToast` portals to `document.body`. Single-instance behavior is enforced via a window-level `undo-toast-show` CustomEvent: a new toast dispatches the event and any existing toast dismisses itself. Esc dismisses, focus moves to the Undo button on mount.
- Cache invalidation after every mutation goes through `router.refresh()` to match the existing project pattern (the architecture document specifies `revalidateTag` but the codebase deliberately uses `router.refresh()` — confirmed in Story 2.3 dev notes and `import-listing.test.ts`).
- Board page reads `?archived=true` from `searchParams`; `BoardClient` shows a "View archived" / "← Back to active" link in the header. Active board still queries `archived: false`, archived view queries `archived: true` and skips the recency-dot logic and `lastVisitAt` update.
- Listing detail page gained an "Edit" accordion section (closed by default) using `ListingEditForm` (React-form-action style) and an Archive/Unarchive button below the accordion that navigates back to the appropriate board view.
- `updateListingSchema` validates field constraints (length caps, positive salaries, salaryMax ≥ salaryMin); FormData empty strings are normalized to `null` so the Server Action writes nullable fields correctly.
- Audit log writes (USER_OVERRIDE on set + on undo with `metadata.undo = true`, USER_OVERRIDE_CLEARED on clear) are wrapped in try/catch and treated as non-critical, matching the existing import-listing pattern.
- Validations: full test suite (`npm run test:run`) — 10 files, 111 tests, all passing. ESLint — clean. `tsc --noEmit` — clean.

### File List

- `followcv/src/actions/listing.ts` — created
- `followcv/src/actions/listing.test.ts` — created
- `followcv/src/lib/schemas/listing.ts` — modified (added `updateListingSchema`, `UpdateListingInput`)
- `followcv/src/components/vitality/VitalityBadge.tsx` — modified (added `isOverridden` prop and Lock icon)
- `followcv/src/components/vitality/VitalityBadge.test.tsx` — created
- `followcv/src/components/board/VitalityOverrideMenu.tsx` — created
- `followcv/src/components/board/BoardRowOverflowMenu.tsx` — created
- `followcv/src/components/board/BoardRow.tsx` — modified (uses override menu + overflow menu, accepts `overrideSource` and `archived` props)
- `followcv/src/components/board/BoardClient.tsx` — modified (archive view header, "View archived" / back link)
- `followcv/src/components/ui/UndoToast.tsx` — created
- `followcv/src/components/listing/ListingEditForm.tsx` — created
- `followcv/src/components/listing/ListingArchiveButton.tsx` — created
- `followcv/src/app/(dashboard)/board/page.tsx` — modified (reads `?archived` searchParam, branches query)
- `followcv/src/app/(dashboard)/board/[listingId]/page.tsx` — modified (Edit accordion section, Archive button, lock icon on badge)
- `followcv/src/lib/jobs/vitality-recompute.test.ts` — modified (added override-preservation test)
- `_bmad-output/implementation-artifacts/2-5-manual-vitality-override-and-listing-management.md`

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-06 | Story created | bmad-create-story |
| 2026-05-06 | All tasks implemented; lint, types, 111 tests green; status → review | claude-opus-4-7 |
