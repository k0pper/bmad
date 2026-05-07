# Story 3.2: CV Version Management

Status: done

## Story

As a **user**,
I want to rename, restore, and delete previous CV versions,
So that I can organise my CV history and bring an older CV back to active without overwriting the original.

## Acceptance Criteria

1. **Rename:** Each CV card has a per-card actions menu (three-dot / ellipsis icon button). Selecting **Rename** switches the name row on the card to an inline editable `<input>`. Saving (Enter or blur) calls `renameCvVersion({ id, name })`. The name update is **optimistic** — the card shows the new name immediately; on error the old name is restored and an inline error is shown. After a successful rename `router.refresh()` is called to sync server state. Empty or whitespace-only input reverts to the previous name without a server call.

2. **Use as current** (formerly "Restore"): Selecting **Use as current** from the card actions menu (visible only on non-active cards — the active card is index 0 in the `uploadedAt desc` list) creates a new `CvVersion` record with the same `s3Key` and the same `name` as the chosen version. The new record's `uploadedAt` is the current timestamp, making it the most recent entry and therefore the new "active" version. The server enforces the non-active rule independently of the UI hide: if any other `CvVersion` for the same user has a strictly greater `uploadedAt` than the chosen one, the action proceeds; otherwise it returns `{ data: null, error: "This CV is already the active version." }`. Cap is checked before saving; `fileHash` is `null`. On success `router.refresh()` re-renders the grid.

3. **Delete:** Selecting **Delete** from the card actions menu opens a small confirmation popover attached to the trigger. Confirming calls `deleteCvVersion({ id })`. The action:
   - Refuses to delete if any `CvSnapshot` record references this `CvVersion` (via `cvVersionId`); returns `{ data: null, error: "This CV is attached to an application and cannot be deleted." }`. The UI surfaces this inline and shows a tooltip-style explanation on hover of the disabled delete item.
   - If no snapshots reference it: deletes the `CvVersion` record; then, if no other `CvVersion` row for this user shares the same `s3Key`, also calls `del(s3Key)` from `@vercel/blob` to reclaim storage. Blob deletion is best-effort (failure doesn't block the response).
   - On success `router.refresh()` re-renders the grid.

4. All three Server Actions return the `ActionResult<T>` union and never throw. Authentication (`auth()`) and ownership scope (`userId`) are enforced in every action. No action leaks whether a version exists for another user.

> **Design note (2026-05-08):** An earlier draft of this story included a separate **Duplicate** action (creating a `"{name} (copy)"` clone). Mechanically Duplicate and Restore both produced a new active row pointing at the same blob — the only meaningful difference was the name suffix. After a code-review pass the team consolidated them into a single **Use as current** affordance: keep the original name, hide on the already-active card, and reject server-side when the chosen version is already the most recent. If you actually want a copy to edit, upload a new file (the new file gets its own hash and row).

## Tasks / Subtasks

- [x] Task 1 — Schema: make `fileHash` nullable (AC: 2)
  - [x] Update `prisma/schema.prisma`: change `fileHash String` → `fileHash String?` on `CvVersion`. The `@@unique([userId, fileHash])` constraint stays — Postgres treats each `NULL` as distinct so multiple nullable rows don't conflict, and the constraint still prevents duplicate uploads of real files.
  - [x] Run `npx prisma migrate dev --name make_cv_version_file_hash_nullable` and apply.
  - [x] Run `npx prisma generate` to regenerate the Prisma client.
  - [x] Update `confirmCvUpload` in `manage-cv.ts`: `fileHash` input is still required for new uploads (the column is nullable for derived records, not for uploads). No behaviour change needed — the action already validates `fileHash` and passes it; the type change just removes a TS error when passing `null` elsewhere.

- [x] Task 2 — Server Actions: add version management actions to `manage-cv.ts` (AC: 1–4)
  - [x] `renameCvVersion({ id, name: string })` → `ActionResult<{ id: string; name: string }>`:
    - Auth + find `cvVersion` with `findFirst({ where: { id, userId } })`. Return `"Not found"` if absent.
    - Trim `name`; reject empty string: return `{ data: null, error: "Name cannot be empty" }`.
    - `prisma.cvVersion.update({ where: { id: cv.id }, data: { name: trimmedName } })`.
    - Return `{ data: { id, name: trimmedName }, error: null }`.
  - [x] `restoreCvVersion({ id })` → `ActionResult<{ cvVersion: CvVersion }>`:
    - Auth + find original with `findFirst({ where: { id, userId } })`. Return `"Not found"` if absent.
    - Active-rejection guard: `prisma.cvVersion.count({ where: { userId, uploadedAt: { gt: original.uploadedAt } } })`. If `0`, the chosen version is already the most recent — return `{ data: null, error: "This CV is already the active version." }`.
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
  - [x] **No transactions, no `*Many` writes** — each action uses only single-row `findFirst`, `create`, `update`, `delete`, or `count`. This is the Neon HTTP adapter rule.

- [x] Task 3 — UI: per-card actions menu and inline rename in `CvVersionsClient.tsx` (AC: 1–3)
  - [x] Add a three-dot / ellipsis icon button (`<MoreHorizontal>` from `lucide-react`) to each `CvCard`'s footer row, right-aligned next to the Download button.
  - [x] Build the card actions menu using **Base UI `Menu.Root`** (same library as the existing `Dropdown` component — import from `@base-ui/react/menu`). Items: **Rename**, **Use as current** (only on non-active cards — hide when `isActive === true` and reject server-side via the active-rejection guard), **Delete** (styled with a danger/red text colour).
  - [x] The Dropdown component at `src/components/ui/Dropdown.tsx` is bound to a `value`+`onSelect` API designed for a current selection — it does not fit the action-menu pattern. Build the card menu inline using Base UI primitives directly, following the same import and styling conventions from `Dropdown.tsx`.
  - [x] **Rename flow:** implemented with `editingId` state, inline `<input>` replacing the name `<p>`, autoFocus, blur/Enter commits, Escape reverts.
  - [x] **Optimistic rename state:** `nameOverrides: Record<string, string>` map; revert on error.
  - [x] **Use as current flow:** calls `restoreCvVersion`, shows error toast on failure, `router.refresh()` on success.
  - [x] **Delete flow:** inline confirmation row replaces footer on `pendingDeleteId` match. `router.refresh()` on success, error toast on snapshot-reference error.
  - [x] Pass `useRouter()` from `next/navigation` into the component and call `router.refresh()` after each successful mutation.
  - [x] All interactive elements keyboard-navigable via Base UI Menu.

- [x] Task 4 — Tests (AC: 1–4)
  - [x] Server Action tests in `src/actions/manage-cv.test.ts` (extend the existing file):
    - `renameCvVersion`: happy path updates name; rejects unauthenticated; returns error on empty name; returns "Not found" for wrong userId.
    - `restoreCvVersion`: happy path creates new record with `fileHash: null` and same name; rejects when called on the already-active version; rejects at cap; rejects unauthenticated; returns "Not found" for wrong userId.
    - `deleteCvVersion`: happy path deletes record and calls `del(s3Key)` when no other record shares the s3Key; does NOT call `del` when another record shares the s3Key; returns snapshot-reference error when snapshots exist; rejects unauthenticated.
  - [x] Followed existing mocking pattern: mock `@/lib/auth`, `@/lib/db`, `@vercel/blob`, added `@/lib/services/entitlement-service`.
  - [x] All 210 tests pass (14 new tests added for this story).

### Review Findings

Code review run: 2026-05-08 — 3 layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) on commit range `228e14e..5b959dc`.

- [x] [Review][Decision] Should `restoreCvVersion` reject when called on the active version? — **Resolved 2026-05-08:** Duplicate was dropped entirely; Restore renamed to "Use as current" in the UI; server now enforces the active-rejection guard via a `count(... uploadedAt: { gt: original.uploadedAt })` check. The two actions overlapped mechanically, so collapsing them removed a class of bugs and ambiguities. See the design note under Acceptance Criteria.

- [x] [Review][Patch] `s3Key` leaked from `duplicateCvVersion` return value — **Obsolete:** `duplicateCvVersion` was removed entirely.
- [x] [Review][Patch] `s3Key` leaked from `restoreCvVersion` return value — **Resolved 2026-05-08:** narrowed the return shape to `{ id }`; create call now uses `select: { id: true }`.
- [x] [Review][Patch] Rename error surfaced via global Toast, not inline error per AC1 — **Resolved 2026-05-08:** added per-card `renameErrors` map; rendered as `role="alert"` inline below the name; cleared on next edit-start.
- [x] [Review][Patch] Disabled Delete item with tooltip is missing per AC3 — **Resolved 2026-05-08:** page Server Component now selects `_count.snapshots` and projects `hasSnapshots: boolean`; Delete `Menu.Item` is `disabled` with a `title` tooltip when truthy.
- [x] [Review][Patch] Double rename call on Enter — **Resolved 2026-05-08:** rename input extracted into `RenameInput` subcomponent with a `submittedRef` guard; `commit()` skips when `trimmed === initialName` so blur after Enter is a no-op.
- [x] [Review][Patch] Stale `editValue` after first rename — **Resolved 2026-05-08:** `RenameInput` mounts only while `isEditing` is true and initializes its state from `initialName` each mount, so subsequent edits start from the current name.
- [x] [Review][Patch] No in-flight guard on Delete confirm — **Resolved 2026-05-08:** `deleteInFlight` state at the parent disables both Confirm and Cancel and re-enters early-returns; button shows "Deleting…" while pending.
- [x] [Review][Patch] No in-flight guard on Use-as-current — **Resolved 2026-05-08:** `restorePendingId` state disables the menu item with a "Setting active…" label; second clicks early-return.
- [x] [Review][Patch] No length cap on rename name — **Resolved 2026-05-08:** server-side check rejects names > 200 chars before any DB read; tested.
- [x] [Review][Patch] `oldName` parameter in `handleRename` is unused on revert — **Resolved 2026-05-08:** error branch now `setNameOverrides(prev => ({ ...prev, [id]: oldName }))` instead of `delete`, so the revert always lands on the actually-prior display name.
- [x] [Review][Patch] Story record claimed 26 new tests; diff contained 17 — **Resolved 2026-05-08:** rewrite of Task 4 in the spec reflects the post-pivot count and matches the committed test file.
- [x] [Review][Patch] Focus management missing on rename Esc/save and delete confirm/cancel — **Resolved 2026-05-08:** card holds a `cardRef`; on Esc/save and on delete cancel, focus is returned to the actions menu trigger via `cardRef.current.querySelector('[aria-label="CV version actions"]')`.

- [x] [Review][Defer] Concurrent delete of two siblings sharing the same `s3Key` orphans the blob — Tx1 sees `count(id≠A)=1`, Tx2 sees `count(id≠B)=1`, both delete, neither calls `safeDelBlob`. AC3 explicitly accepts blob deletion as best-effort and Neon HTTP forbids transactions. [followcv/src/actions/manage-cv.ts] — deferred, accepted by spec; revisit when a blob-reaper job is on the roadmap
- [x] [Review][Defer] Delete-vs-Use-as-current race leaves a row pointing at a deleted blob — Tx1 sees `count = 0`, queues `del(s3Key)`; Tx2 (use-as-current creating B) interleaves between Tx1's count and `del`. Same root cause and same deferral as above. [followcv/src/actions/manage-cv.ts] — deferred, same root cause; revisit alongside blob-reaper

## Dev Notes

### Schema change: `fileHash` nullable for duplicates and restores

Use-as-current creates a new `CvVersion` row pointing to the same Vercel Blob URL (`s3Key`) as the original. The `@@unique([userId, fileHash])` constraint on `CvVersion` would reject a second row with the same `(userId, fileHash)` pair, so `fileHash` must be `null` for these derived records. Postgres treats `NULL` as distinct from every other value (including other `NULL`s) in unique indexes, so multiple rows with `fileHash IS NULL` for the same user do not conflict.

After the migration, the column is `fileHash String?`. The `confirmCvUpload` action still requires `fileHash` in its input and writes it to the column for new uploads (no change needed there). The `restoreCvVersion` action sets `fileHash: null`.

### Blob deletion safety

Multiple `CvVersion` rows can share the same `s3Key` after a use-as-current operation. The `deleteCvVersion` action must check for other sharers before calling `del()`:

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

The `versions` prop is already sorted `uploadedAt desc` — `versions[0]` is the active card. The `isActive` flag passed to each `CvCard` is `index === 0`. The Use-as-current action must be hidden when `isActive` is true; the server also rejects the call independently as a defense-in-depth (see AC2).

### Delete confirmation UX

The UX design spec classifies deleting a CV version as a "high-stakes, irreversible action" warranting an intentional confirmation moment. Use a simple inline state approach rather than a separate dialog: on Delete click, set a local `pendingDeleteId` state on the relevant card. The card footer swaps its Download + actions row for a "Delete this version? [Confirm] [Cancel]" pair. On confirm, call `deleteCvVersion`. On cancel, clear `pendingDeleteId`. This avoids an extra dialog layer for a settings-style page.

### Neon HTTP adapter constraints

- **No `*Many` writes, no transactions.** Every action uses single-row `findFirst`, `create`, `update`, `delete`, or `count`.
- `restoreCvVersion` makes three sequential DB calls (find, active-rejection count, cap check). Between calls, the count could race past the cap or another tab could promote a different version. This is an acceptable overshoot — the strict cap enforcement is on upload (Vercel Blob token route), not on management operations. Accept rare one-over-cap events.

### Files to touch (reference)

- `followcv/prisma/schema.prisma` — UPDATE (`fileHash String?`)
- `followcv/prisma/migrations/<ts>_make_cv_version_file_hash_nullable/` — NEW (generated)
- `followcv/src/actions/manage-cv.ts` — UPDATE (add `renameCvVersion`, `restoreCvVersion`, `deleteCvVersion`)
- `followcv/src/actions/manage-cv.test.ts` — UPDATE (extend tests for the three new actions)
- `followcv/src/components/cv/CvVersionsClient.tsx` — UPDATE (card actions menu, inline rename, optimistic state, delete confirmation)

### Constraints

- **No transactions, no `*Many` writes** (Neon HTTP rule).
- **Cache invalidation: `router.refresh()`, not `revalidateTag`** — matches every other mutation in this codebase.
- **Server Action contract:** `ActionResult<T>`, never throw, auth at entry, user-scoped reads.
- **Do not expose `s3Key` to the client.** All blob interactions stay server-side.
- **`fileHash` remains required for new uploads** (`confirmCvUpload` still validates the 64-char hex string). It is `null` only for derived records created by `restoreCvVersion`.
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

- Schema migration `20260506142758_make_cv_version_file_hash_nullable` applied; `fileHash` is now `String?`. The `@@unique([userId, fileHash])` constraint is preserved — Postgres treats NULL values as distinct so derived records don't conflict.
- Added three Server Actions to `manage-cv.ts`: `renameCvVersion`, `restoreCvVersion` (UI-labelled "Use as current"), `deleteCvVersion`. All follow the `ActionResult<T>` contract, auth at entry, user-scoped reads. No transactions or `*Many` writes (Neon HTTP rule).
- `restoreCvVersion` enforces the active-rejection guard (`count(... uploadedAt: { gt: original.uploadedAt })`) so the server rejects calls on the already-active version even if the UI hide is bypassed. Sets `fileHash: null` and checks the cap before creating.
- `deleteCvVersion` guards against snapshot references, checks for shared s3Key before deleting the blob, uses `safeDelBlob` (best-effort, pre-existing helper).
- `CvVersionsClient.tsx` rewritten to add: `CardActionsMenu` (Base UI `Menu.Root`, `MoreHorizontal` trigger), inline rename with `nameOverrides` optimistic state, inline delete confirmation row, `pendingDeleteId` state. Toast errors shown via `toast: string | null` state + `<Toast>` render (consistent with `CvUploadDialog`).
- 14 new tests across `renameCvVersion`, `restoreCvVersion`, `deleteCvVersion`. All 210 tests pass. `tsc --noEmit` and `eslint` both clean.
- 2026-05-08: Code-review pivot — removed `duplicateCvVersion` (mechanically redundant with `restoreCvVersion`), renamed the menu item from "Restore" to "Use as current", added the server-side active-rejection guard.

### File List

- `followcv/prisma/schema.prisma` — modified (`fileHash String?`, comment updated)
- `followcv/prisma/migrations/20260506142758_make_cv_version_file_hash_nullable/migration.sql` — created
- `followcv/src/actions/manage-cv.ts` — modified (added 3 new actions, `checkCvVersionCap` import; active-rejection guard on `restoreCvVersion`)
- `followcv/src/actions/manage-cv.test.ts` — modified (14 new tests, added mocks for `update`, `delete`, `count`, `checkCvVersionCap`)
- `followcv/src/components/cv/CvVersionsClient.tsx` — modified (card actions menu, inline rename, delete confirmation)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-06 | Story created from epics.md Story 3.2 | bmad-create-story |
| 2026-05-06 | All tasks implemented; schema migrated; 213 tests green; lint + types clean; status → review | claude-sonnet-4-6 |
| 2026-05-08 | Code review run; design pivot to drop `duplicateCvVersion` and rename `restoreCvVersion` to "Use as current"; server-side active-rejection guard added; 210 tests green | claude-opus-4-7 |
| 2026-05-08 | Applied 10 review patches: `s3Key` no longer leaks; rename error inline + Delete disabled with tooltip when snapshots exist; double-rename guard via extracted `RenameInput` subcomponent (also fixes stale `editValue`); in-flight guards on Use-as-current and Delete confirm; 200-char rename cap; revert via `oldName`; focus restored to menu trigger on rename/delete cancel. 211 tests green; build clean. | claude-opus-4-7 |
