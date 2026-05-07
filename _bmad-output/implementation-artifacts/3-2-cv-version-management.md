# Story 3.2: CV Version Management

Status: review

## Story

As a **user**,
I want to rename, duplicate, and restore previous CV versions,
So that I can organise my CV history and build on past versions without overwriting them.

## Acceptance Criteria

1. **Rename:** Each CV card has a per-card actions menu (three-dot / ellipsis icon button). Selecting **Rename** switches the name row on the card to an inline editable `<input>`. Saving (Enter or blur) calls `renameCvVersion({ id, name })`. The name update is **optimistic** — the card shows the new name immediately; on error the old name is restored and an inline error is shown. After a successful rename `router.refresh()` is called to sync server state. Empty or whitespace-only input reverts to the previous name without a server call.

2. **Duplicate:** Selecting **Duplicate** from the card actions menu creates a new `CvVersion` record pointing to the same blob (`s3Key`) with name `"{original name} (copy)"`. The free-tier cap is checked server-side before creation; if the cap is reached the action returns an error surfaced as an inline toast. On success `router.refresh()` re-renders the grid. Because the duplicate shares the same underlying file, its `fileHash` is stored as `null` (see schema note below).

3. **Restore:** Selecting **Restore** from the card actions menu (visible only on non-active cards — the active card is index 0 in the `uploadedAt desc` list) creates a new `CvVersion` record with the same `s3Key` and the same `name`. The new record's `uploadedAt` is the current timestamp, making it the most recent entry and therefore the new "active" version. Cap is checked before saving; `fileHash` is `null`. On success `router.refresh()` re-renders the grid.

4. **Delete:** Selecting **Delete** from the card actions menu opens a small confirmation popover attached to the trigger. Confirming calls `deleteCvVersion({ id })`. The action:
   - Refuses to delete if any `CvSnapshot` record references this `CvVersion` (via `cvVersionId`); returns `{ data: null, error: "This CV is attached to an application and cannot be deleted." }`. The UI surfaces this inline and shows a tooltip-style explanation on hover of the disabled delete item.
   - If no snapshots reference it: deletes the `CvVersion` record; then, if no other `CvVersion` row for this user shares the same `s3Key`, also calls `del(s3Key)` from `@vercel/blob` to reclaim storage. Blob deletion is best-effort (failure doesn't block the response).
   - On success `router.refresh()` re-renders the grid.

5. All four Server Actions return the `ActionResult<T>` union and never throw. Authentication (`auth()`) and ownership scope (`userId`) are enforced in every action. No action leaks whether a version exists for another user.

## Tasks / Subtasks

- [x] Task 1 — Schema: make `fileHash` nullable (AC: 2, 3)
  - [x] Update `prisma/schema.prisma`: change `fileHash String` → `fileHash String?` on `CvVersion`. The `@@unique([userId, fileHash])` constraint stays — Postgres treats each `NULL` as distinct so multiple nullable rows don't conflict, and the constraint still prevents duplicate uploads of real files.
  - [x] Run `npx prisma migrate dev --name make_cv_version_file_hash_nullable` and apply.
  - [x] Run `npx prisma generate` to regenerate the Prisma client.
  - [x] Update `confirmCvUpload` in `manage-cv.ts`: `fileHash` input is still required for new uploads (the column is nullable for duplicates, not for uploads). No behaviour change needed — the action already validates `fileHash` and passes it; the type change just removes a TS error when passing `null` elsewhere.

- [x] Task 2 — Server Actions: add version management actions to `manage-cv.ts` (AC: 1–5)
  - [x] `renameCvVersion({ id, name: string })` → `ActionResult<{ id: string; name: string }>`:
    - Auth + find `cvVersion` with `findFirst({ where: { id, userId } })`. Return `"Not found"` if absent.
    - Trim `name`; reject empty string: return `{ data: null, error: "Name cannot be empty" }`.
    - `prisma.cvVersion.update({ where: { id: cv.id }, data: { name: trimmedName } })`.
    - Return `{ data: { id, name: trimmedName }, error: null }`.
  - [x] `duplicateCvVersion({ id })` → `ActionResult<{ cvVersion: CvVersion }>`:
    - Auth + find original with `findFirst({ where: { id, userId } })`. Return `"Not found"` if absent.
    - `checkCvVersionCap(userId)` — return cap error if `!cap.allowed`.
    - `prisma.cvVersion.create({ data: { userId, name: \`${original.name} (copy)\`, s3Key: original.s3Key, fileSize: original.fileSize, fileHash: null } })`.
    - Return `{ data: { cvVersion }, error: null }`.
  - [x] `restoreCvVersion({ id })` → `ActionResult<{ cvVersion: CvVersion }>`:
    - Auth + find original with `findFirst({ where: { id, userId } })`. Return `"Not found"` if absent.
    - `checkCvVersionCap(userId)` — return cap error if `!cap.allowed`.
    - `prisma.cvVersion.create({ data: { userId, name: original.name, s3Key: original.s3Key, fileSize: original.fileSize, fileHash: null } })`.
    - Return `{ data: { cvVersion }, error: null }`.
  - [x] `deleteCvVersion({ id })` → `ActionResult<{ deleted: true }>`:
    - Auth + find with `findFirst({ where: { id, userId }, include: { snapshots: { take: 1 } } })`. Return `"Not found"` if absent.
    - If `cv.snapshots.length > 0` → return `{ data: null, error: "This CV is attached to an application and cannot be deleted." }`.
    - Count other versions sharing the same blob: `const otherCount = await prisma.cvVersion.count({ where: { userId, s3Key: cv.s3Key, id: { not: id } } })`.
    - `await prisma.cvVersion.delete({ where: { id: cv.id } })`.
    - If `otherCount === 0`: `await safeDelBlob(cv.s3Key)` (already exists in the file; best-effort).
    - Return `{ data: { deleted: true }, error: null }`.
  - [x] **No transactions, no `*Many` writes** — each action uses only single-row `findFirst`, `create`, `update`, or `delete`. This is the Neon HTTP adapter rule.

- [x] Task 3 — UI: per-card actions menu and inline rename in `CvVersionsClient.tsx` (AC: 1–4)
  - [x] Add a three-dot / ellipsis icon button (`<MoreHorizontal>` from `lucide-react`) to each `CvCard`'s footer row, right-aligned next to the Download button.
  - [x] Build the card actions menu using **Base UI `Menu.Root`** (same library as the existing `Dropdown` component — import from `@base-ui/react/menu`). Items: **Rename**, **Duplicate**, **Restore** (only on non-active cards — hide when `isActive === true`), **Delete** (styled with a danger/red text colour).
  - [x] The Dropdown component at `src/components/ui/Dropdown.tsx` is bound to a `value`+`onSelect` API designed for a current selection — it does not fit the action-menu pattern. Build the card menu inline using Base UI primitives directly, following the same import and styling conventions from `Dropdown.tsx`.
  - [x] **Rename flow:** implemented with `editingId` state, inline `<input>` replacing the name `<p>`, autoFocus, blur/Enter commits, Escape reverts.
  - [x] **Optimistic rename state:** `nameOverrides: Record<string, string>` map; revert on error.
  - [x] **Duplicate / Restore flow:** calls Server Action, shows error toast on failure, `router.refresh()` on success.
  - [x] **Delete flow:** inline confirmation row replaces footer on `pendingDeleteId` match. `router.refresh()` on success, error toast on snapshot-reference error.
  - [x] Pass `useRouter()` from `next/navigation` into the component and call `router.refresh()` after each successful mutation.
  - [x] All interactive elements keyboard-navigable via Base UI Menu.

- [x] Task 4 — Tests (AC: 1–5)
  - [x] Server Action tests in `src/actions/manage-cv.test.ts` (extend the existing file):
    - `renameCvVersion`: happy path updates name; rejects unauthenticated; returns error on empty name; returns "Not found" for wrong userId.
    - `duplicateCvVersion`: happy path creates new record with `fileHash: null` and name `"{original} (copy)"`; rejects at cap; rejects unauthenticated.
    - `restoreCvVersion`: happy path creates new record with `fileHash: null` and same name; rejects at cap; rejects unauthenticated.
    - `deleteCvVersion`: happy path deletes record and calls `del(s3Key)` when no other record shares the s3Key; does NOT call `del` when another record shares the s3Key; returns snapshot-reference error when snapshots exist; rejects unauthenticated.
  - [x] Followed existing mocking pattern: mock `@/lib/auth`, `@/lib/db`, `@vercel/blob`, added `@/lib/services/entitlement-service`.
  - [x] All 213 tests pass (26 new tests added for this story).

## Dev Notes

### Schema change: `fileHash` nullable for duplicates and restores

Duplicating or restoring a CV version creates a new `CvVersion` row pointing to the same Vercel Blob URL (`s3Key`) as the original. The `@@unique([userId, fileHash])` constraint on `CvVersion` would reject a second row with the same `(userId, fileHash)` pair, so `fileHash` must be `null` for these derived records. Postgres treats `NULL` as distinct from every other value (including other `NULL`s) in unique indexes, so multiple rows with `fileHash IS NULL` for the same user do not conflict.

After the migration, the column is `fileHash String?`. The `confirmCvUpload` action still requires `fileHash` in its input and writes it to the column for new uploads (no change needed there). The new `duplicateCvVersion` and `restoreCvVersion` actions set `fileHash: null`.

### Blob deletion safety

Multiple `CvVersion` rows can share the same `s3Key` after a duplicate or restore operation. The `deleteCvVersion` action must check for other sharers before calling `del()`:

```ts
const otherCount = await prisma.cvVersion.count({
  where: { userId, s3Key: cv.s3Key, id: { not: id } },
})
await prisma.cvVersion.delete({ where: { id: cv.id } })
if (otherCount === 0) {
  await safeDelBlob(cv.s3Key) // best-effort, already in the file
}
```

`CvSnapshot` records are NOT checked for blob deletion — CvSnapshots have their own `s3Key` (a separate immutable copy of the blob created at apply-time). The check is only for other `CvVersion` rows that share the source blob.

### Actions menu: use Base UI primitives directly

The existing `Dropdown` component at [src/components/ui/Dropdown.tsx](../../followcv/src/components/ui/Dropdown.tsx) uses Base UI `Menu.Root` but is built around a `value`/`onSelect` API for selection dropdowns (e.g., sort order). It is not suited for action menus with a trigger icon button. Build the card action menu inline using Base UI's `Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`, `Menu.Popup`, and `Menu.Item` directly in `CvVersionsClient.tsx` — following the exact same import path (`@base-ui/react/menu`) and CSS conventions as `Dropdown.tsx`. Do not modify `Dropdown.tsx`.

The trigger should be a small icon-only button (`<MoreHorizontal size={16} />` from `lucide-react`), matching the ghost-style hover of the Download anchor.

### Optimistic rename state

`CvVersionsClient` renders from props (a `versions` array from the Server Component). Optimistic rename is implemented by maintaining a local override map:

```ts
const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({})

// To read: nameOverrides[cv.id] ?? cv.name
// To apply optimistic update: setNameOverrides(prev => ({ ...prev, [id]: newName }))
// To revert: setNameOverrides(prev => { const n = {...prev}; delete n[id]; return n })
```

After a successful rename call `router.refresh()` to sync server state (same pattern used throughout this codebase — see project-context.md). After `router.refresh()`, the parent Server Component re-fetches and passes fresh `versions` props; the override map entry for that id can remain (it becomes a no-op once the prop value matches).

### "Active" card definition

The `versions` prop is already sorted `uploadedAt desc` — `versions[0]` is the active card. The `isActive` flag passed to each `CvCard` is `index === 0`. The Restore action must be hidden when `isActive` is true (restoring the already-active version would just add a redundant duplicate).

### Delete confirmation UX

The UX design spec classifies deleting a CV version as a "high-stakes, irreversible action" warranting an intentional confirmation moment. Use a simple inline state approach rather than a separate dialog: on Delete click, set a local `pendingDeleteId` state on the relevant card. The card footer swaps its Download + actions row for a "Delete this version? [Confirm] [Cancel]" pair. On confirm, call `deleteCvVersion`. On cancel, clear `pendingDeleteId`. This avoids an extra dialog layer for a settings-style page.

### Neon HTTP adapter constraints

- **No `*Many` writes, no transactions.** Every action uses single-row `findFirst`, `create`, `update`, or `delete`.
- `checkCvVersionCap` and `duplicateCvVersion`/`restoreCvVersion` each make two sequential DB calls (cap check, then create). Between the two calls, the count could race past the cap (two concurrent tabs). This is an acceptable overshoot — the strict cap enforcement is on upload (Vercel Blob token route), not on management operations. Accept rare one-over-cap events.

### Files to touch (reference)

- `followcv/prisma/schema.prisma` — UPDATE (`fileHash String?`)
- `followcv/prisma/migrations/<ts>_make_cv_version_file_hash_nullable/` — NEW (generated)
- `followcv/src/actions/manage-cv.ts` — UPDATE (add `renameCvVersion`, `duplicateCvVersion`, `restoreCvVersion`, `deleteCvVersion`)
- `followcv/src/actions/manage-cv.test.ts` — UPDATE (extend tests for all four new actions)
- `followcv/src/components/cv/CvVersionsClient.tsx` — UPDATE (card actions menu, inline rename, optimistic state, delete confirmation)

### Constraints

- **No transactions, no `*Many` writes** (Neon HTTP rule).
- **Cache invalidation: `router.refresh()`, not `revalidateTag`** — matches every other mutation in this codebase.
- **Server Action contract:** `ActionResult<T>`, never throw, auth at entry, user-scoped reads.
- **Do not expose `s3Key` to the client.** All blob interactions stay server-side.
- **`fileHash` remains required for new uploads** (`confirmCvUpload` still validates the 64-char hex string). It is `null` only for derived records (duplicate, restore).
- **Do not rename `CvVersion.s3Key`.** Keeps migration small — it stores the Vercel Blob URL (legacy name from R2 draft).

### References

- Epic AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- Previous story (full implementation): [Source: _bmad-output/implementation-artifacts/3-1-cv-upload-and-version-history.md]
- Neon HTTP rule (no transactions): [Source: followcv/project-context.md#Database — Neon HTTP driver]
- Cache invalidation rule: [Source: followcv/project-context.md#Cache invalidation]
- Server Action contract: [Source: followcv/project-context.md#Server Action contract]
- Vercel Blob private store rules: [Source: followcv/project-context.md#Object storage — Vercel Blob]
- Entitlement service: [Source: followcv/src/lib/services/entitlement-service.ts]
- Existing Server Actions: [Source: followcv/src/actions/manage-cv.ts]
- CvVersionsClient (card grid): [Source: followcv/src/components/cv/CvVersionsClient.tsx]
- Dropdown Base UI pattern: [Source: followcv/src/components/ui/Dropdown.tsx]
- Toast component: [Source: followcv/src/components/ui/Toast.tsx]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Schema migration `20260506142758_make_cv_version_file_hash_nullable` applied; `fileHash` is now `String?`. The `@@unique([userId, fileHash])` constraint is preserved — Postgres treats NULL values as distinct so duplicate/restore records don't conflict.
- Added four Server Actions to `manage-cv.ts`: `renameCvVersion`, `duplicateCvVersion`, `restoreCvVersion`, `deleteCvVersion`. All follow the `ActionResult<T>` contract, auth at entry, user-scoped reads. No transactions or `*Many` writes (Neon HTTP rule).
- `duplicateCvVersion` and `restoreCvVersion` set `fileHash: null` and check the cap before creating.
- `deleteCvVersion` guards against snapshot references, checks for shared s3Key before deleting the blob, uses `safeDelBlob` (best-effort, pre-existing helper).
- `CvVersionsClient.tsx` rewritten to add: `CardActionsMenu` (Base UI `Menu.Root`, `MoreHorizontal` trigger), inline rename with `nameOverrides` optimistic state, inline delete confirmation row, `pendingDeleteId` state. Toast errors shown via `toast: string | null` state + `<Toast>` render (consistent with `CvUploadDialog`).
- 26 new tests across `renameCvVersion`, `duplicateCvVersion`, `restoreCvVersion`, `deleteCvVersion`. All 213 tests pass. `tsc --noEmit` and `eslint` both clean.

### File List

- `followcv/prisma/schema.prisma` — modified (`fileHash String?`, comment updated)
- `followcv/prisma/migrations/20260506142758_make_cv_version_file_hash_nullable/migration.sql` — created
- `followcv/src/actions/manage-cv.ts` — modified (added 4 new actions, `checkCvVersionCap` import)
- `followcv/src/actions/manage-cv.test.ts` — modified (26 new tests, added mocks for `update`, `delete`, `count`, `checkCvVersionCap`)
- `followcv/src/components/cv/CvVersionsClient.tsx` — modified (card actions menu, inline rename, delete confirmation)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-06 | Story created from epics.md Story 3.2 | bmad-create-story |
| 2026-05-06 | All tasks implemented; schema migrated; 213 tests green; lint + types clean; status → review | claude-sonnet-4-6 |
