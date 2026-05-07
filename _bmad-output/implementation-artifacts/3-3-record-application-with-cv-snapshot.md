# Story 3.3: Record Application with CV Snapshot

Status: done

## Story

As a **user**,
I want to record an application against a listing with my chosen CV version automatically snapshotted,
So that I always know exactly which CV version a company received — even after I change the CV later.

## Acceptance Criteria

1. **Apply affordance on the Board.** Each non-archived `BoardRow` shows an inline **Apply** button alongside the existing actions (between the date and the import-source dot). Clicking the button opens an `ApplyRitualDialog` and **does not** navigate to the listing detail page (the row's parent `<Link>` must be suppressed via `e.preventDefault()` + `e.stopPropagation()`, mirroring the existing `VitalityOverrideMenu` and `BoardRowOverflowMenu` pattern). When an `Application` already exists for the listing, the button is replaced by a muted **"Applied"** indicator (clicking it is a no-op or links to the listing detail page).

2. **ApplyRitualDialog content.** Centred Base UI `Dialog`. Fields, in tab order:
   - **CV version** (required): a `CVVersionSelector` listing the user's `CvVersion[]` ordered `uploadedAt desc`; defaults to the most recent. If the user has zero CV versions, the dialog shows an inline empty state with a link to `/cv` ("Upload a CV first") and the **Apply** confirm button is disabled.
   - **Application date** (default: today, calendar input).
   - **Notes** (optional, multi-line text).
   - **Cancel** and **Apply** buttons (Apply is the default for `Enter`).
   - The dialog is keyboard-navigable end-to-end (Tab cycles through fields, Esc closes, Enter confirms).
   - The "supporting document upload" mentioned in the original epic AC is **deferred**; see Dev Notes → "Out of scope". The dialog does not show a doc-upload field for this story.

3. **`apply-to-job` Server Action — sequenced behaviour.** The action is invoked from the dialog with `{ jobListingId, cvVersionId, appliedAt, notes? }` and runs in this order, with the cleanup paths described:
   1. **Auth** + ownership-scope every read to `session.user.id`.
   2. Validate the listing: `prisma.jobListing.findFirst({ where: { id: jobListingId, userId, deletedAt: null }, include: { application: { select: { id: true } } } })`. Return `"Not found"` if absent. Return `"Cannot apply to an archived listing"` if `archived === true`. Return `"You have already applied to this listing."` if `application` is non-null (the `@unique` on `Application.jobListingId` is the safety net; the pre-check is for the friendly message).
   3. Validate the CV version: `prisma.cvVersion.findFirst({ where: { id: cvVersionId, userId } })`. Return `"CV version not found"` if absent.
   4. **Copy the CV blob into a fresh, immutable snapshot blob** via `cv-snapshot-service.createSnapshot()` — see Task 1 below. Returns `{ snapshotId, snapshotUrl }`.
   5. Create the `CvSnapshot` row: `prisma.cvSnapshot.create({ data: { id: snapshotId, cvVersionId, s3Key: snapshotUrl } })`. **On failure → `del(snapshotUrl)`** to avoid an orphan blob, then return a generic save error.
   6. Create the `Application` row: `prisma.application.create({ data: { id: <auto>, userId, jobListingId, cvSnapshotId: snapshotId, appliedAt, notes: notes ?? null, status: "APPLIED" } })`. **On failure → `del(snapshotUrl)` *and* `prisma.cvSnapshot.delete({ where: { id: snapshotId } })`**, then return the save error.
   7. Compute the new vitality state: build `VitalityInputs` from the listing + the just-created Application, call `computeVitalityState()`, and `prisma.jobListing.update({ where: { id: jobListingId }, data: { vitalityState: <computed>, lastComputedAt: new Date(), stateChangedAt: <new Date() if state changed> } })`. **On failure → swallow and return success anyway** — the Application is already created, the row is correct, and the next read or background recompute will heal vitality. Don't roll back successful application records over a vitality miss.

4. **Vitality transition.** The state machine returns `ACTIVE` for an APPLIED-status Application that isn't archived, in dialogue, deadlined, etc. (See `vitality-state-machine.ts` Rule 7.) Confirm via test that `applied at = now()` on a non-archived listing transitions to `ACTIVE` (no Gmail signal yet, no closing-date deadline, no override).

5. **Board updates after apply.** When the dialog confirms successfully, the dialog closes, fires a Toast (`Applied to {title} at {company} with "{cvName}" — version saved`), and the client calls `router.refresh()`. The Server Component re-fetches and the `BoardRow` re-renders showing the new vitality (`ACTIVE`) and the **Applied** indicator. This is the same `await action; if (success) router.refresh()` pattern used by `VitalityOverrideMenu`, `BoardRowOverflowMenu`, and `ImportDrawer` — the board has no `useOptimistic` layer today and this story should not introduce one. The refresh round-trip is fast enough that the transition feels immediate.

6. **Account deletion cleans up snapshot blobs.** `deleteAccount()` already cleans up `CvVersion` blobs; extend it to also collect every `CvSnapshot.s3Key` belonging to the user (joined via the user's Applications) and include them in the same `del()` call before the DB cascade.

7. **Schema cascade for CvSnapshot.** Add `onDelete: Cascade` to the `CvSnapshot.cvVersion` relation. Today the relation is `Restrict` by default, which means deleting a `CvVersion` (or a User, transitively via the existing Cascade on `CvVersion.user`) would fail when any `CvSnapshot` still references that `CvVersion`. Story 3.2 already refuses to delete a `CvVersion` whose snapshots are referenced by an Application; account deletion is the remaining path. Ship a tiny migration to add `ON DELETE CASCADE`. (See Dev Notes → "Schema cascade fix".)

8. **Server Action contract.** `apply-to-job` returns the `ActionResult<T>` union, never throws, auth-checks at entry, scopes every DB read to `session.user.id`, and never returns the snapshot's `s3Key` to the client. No transactions, no `*Many` writes — every DB call is single-row (Neon HTTP rule).

9. **No new browser-facing snapshot route in this story.** Reading the snapshot back ("View CV sent") is **Story 3.5**. Story 3.3 only writes snapshots; it does not add an API route to stream them.

## Tasks / Subtasks

- [ ] **Task 1 — `cv-snapshot-service.ts`: server-side CV → snapshot blob copy** (AC: 3, 8)
  - [ ] Create `src/lib/services/cv-snapshot-service.ts` with `export async function createSnapshot({ userId, cvVersion }: { userId: string; cvVersion: { s3Key: string } }): Promise<{ snapshotId: string; snapshotUrl: string }>`.
  - [ ] Generate `snapshotId` via `crypto.randomUUID()` (no new dependency; the value is used both as the `CvSnapshot.id` and to make the blob path unique). Build `pathname = \`cv/${userId}/${snapshotId}.pdf\``.
  - [ ] Read source bytes: `const source = await get(cvVersion.s3Key, { access: "private" })` — see Dev Notes for the v2 SDK shape (`source.body` is a `ReadableStream`; convert via `await new Response(source.body).arrayBuffer()`).
  - [ ] Write the snapshot: `const blob = await put(pathname, buffer, { access: "private", contentType: "application/pdf" })`.
  - [ ] Return `{ snapshotId, snapshotUrl: blob.url }`.
  - [ ] **The service does not write to the DB.** All DB writes happen in the action (Task 2) so that the action owns the cleanup ordering.
  - [ ] Throw on read-or-write failure with a clear message (`"Failed to read source CV"` / `"Failed to write snapshot"`); the action wraps this in a try/catch and returns the `ActionResult` error.

- [ ] **Task 2 — `apply-to-job.ts` Server Action** (AC: 3, 5, 8, 9)
  - [ ] Create `src/actions/apply-to-job.ts` with `"use server"`.
  - [ ] Implement `applyToJob(input: { jobListingId: string; cvVersionId: string; appliedAt: Date; notes?: string }): Promise<ActionResult<{ applicationId: string; vitalityState: VitalityState }>>`. The return shape is intentionally narrow — no blob URLs, no nested rows.
  - [ ] Sequence is exactly the seven steps in AC 3. Each step's failure path is wired up.
  - [ ] On success, build `VitalityInputs` from the listing + the just-created Application using `now: new Date()`. Use the listing's existing `gmailSignalAt` (find it via the listing fetch) — if there's no field for it today, pass `null` (the state machine handles this).
  - [ ] If `computeVitalityState()` returns `null` (archived guard), do not write the state. (We already rejected archived listings in step 2, so this should be unreachable, but handle defensively.)
  - [ ] When the new state differs from the listing's prior `vitalityState`, set `stateChangedAt: new Date()` in the update; otherwise leave it untouched. Always set `lastComputedAt`.
  - [ ] **No `revalidateTag`.** No tag invalidation. The dialog will call `router.refresh()` from the client after a successful action.

- [ ] **Task 3 — UI: `ApplyRitualDialog` and `CVVersionSelector`** (AC: 1, 2, 5)
  - [ ] Create `src/components/application/ApplyRitualDialog.tsx` — `"use client"`. Centred Base UI `Dialog` (`@base-ui/react/dialog`), same import paths as `CvUploadDialog.tsx`. Props: `open`, `onOpenChange`, `listing: { id: string; title: string; company: string }`, `versions: { id: string; name: string; uploadedAt: Date }[]`. Stages: `idle` → `submitting` → `error`. On success: closes, fires Toast.
  - [ ] Create `src/components/application/CVVersionSelector.tsx` — a thin wrapper around the existing **`src/components/ui/Dropdown.tsx`** component (which has the matching `value: string` + `onSelect: (value) => void` API for "current selection" UX). Map `CvVersion[]` to `DropdownItem[]` with `value: cv.id`, `label: cv.name`, and `rightHint: <relative uploadedAt>`. Default-selected = `versions[0].id`.
  - [ ] Pass the user's `CvVersion[]` as a prop from the Server Component (Task 4). **Do not** fetch from inside the dialog on open — the dialog is a thin form, and the parent already has the data. Use `getDisplayName(...)` only if needed.
  - [ ] On Apply submit: call `applyToJob({ jobListingId, cvVersionId, appliedAt, notes })`. On `error`, render inline error in the dialog footer (mirror `CvUploadDialog`'s `error` stage). On success, `setShowToast(true)`, `router.refresh()`, `onOpenChange(false)`.
  - [ ] The Apply button is disabled when `versions.length === 0` and the dialog renders an empty state pointing at `/cv`.

- [ ] **Task 4 — Wire Apply into the Board** (AC: 1, 5)
  - [ ] Update `src/app/(dashboard)/board/page.tsx` to additionally select `application: { select: { id: true, status: true } }` per listing and to load the user's `CvVersion[]` once for the page (newest first). Pass both into `BoardClient`.
  - [ ] Update `src/components/board/BoardClient.tsx`'s `BoardListing` type to include `applied: boolean` (or `applicationStatus: ApplicationStatus | null`) and accept `cvVersions` as a separate prop for the dialog. After a successful apply, call `router.refresh()` — same pattern as the existing override / archive flows (no `useOptimistic` layer; the board doesn't use one today).
  - [ ] Update `src/components/board/BoardRow.tsx` to add the **Apply** button (or **Applied** indicator) in the right-hand cluster, immediately before the import-source dot. Use a thin button-shaped element with `onClick` that calls `e.preventDefault()` + `e.stopPropagation()` then opens the parent-managed dialog. Mirror the focus-visible/hover treatment of `BoardRowOverflowMenu`.
  - [ ] The dialog renders **at the `BoardClient` level** (one dialog instance with `selectedListingId` state), not per row — keeps the DOM lighter and avoids creating dozens of portals.

- [ ] **Task 5 — Schema cascade fix + migration** (AC: 7)
  - [ ] Update `prisma/schema.prisma`: add `onDelete: Cascade` to `CvSnapshot.cvVersion` relation:
    ```
    cvVersion CvVersion @relation(fields: [cvVersionId], references: [id], onDelete: Cascade)
    ```
  - [ ] Run `npx prisma migrate dev --name cv_snapshot_cascade_from_cv_version`.
  - [ ] Run `npx prisma generate`.

- [ ] **Task 6 — Account deletion cleanup for snapshot blobs** (AC: 6)
  - [ ] Update `src/lib/account/service.ts → deleteAccount()`: add a second `findMany` for snapshots scoped to the user via the Application relation:
    ```ts
    const snapshots = await prisma.cvSnapshot.findMany({
      where: { application: { userId } },
      select: { s3Key: true },
    })
    const blobUrls = [
      ...cvVersions.map((cv) => cv.s3Key),
      ...snapshots.map((s) => s.s3Key),
    ]
    ```
  - [ ] One `del(blobUrls)` call covers both. Best-effort; failures still proceed to the DB delete (consistent with the existing comment).
  - [ ] Update `src/lib/account/service.test.ts` to assert the snapshot collection happens and snapshot blob URLs are included in the `del` batch.

- [ ] **Task 7 — Tests** (AC: 1–9)
  - [ ] **Server Action tests** in a new `src/actions/apply-to-job.test.ts`. Mirror the mock pattern from `manage-cv.test.ts`: mock `@/lib/auth`, `@/lib/db`, `@vercel/blob`, `@/lib/services/cv-snapshot-service`, `@/lib/services/vitality-state-machine`. Cover:
    - Happy path → snapshot row created, application row created, listing vitality updated to `ACTIVE`, return shape is `{ applicationId, vitalityState }`.
    - Rejects unauthenticated.
    - Returns `"Not found"` for a listing the user doesn't own.
    - Returns `"Cannot apply to an archived listing"` for an archived listing.
    - Returns `"You have already applied to this listing."` when an Application already exists.
    - Returns `"CV version not found"` when the cvVersionId belongs to another user.
    - Application-create failure → `mockDel` called with the snapshot URL **and** `cvSnapshot.delete` called with the snapshot id.
    - CvSnapshot-create failure → `mockDel` called with the snapshot URL; no `cvSnapshot.delete` call.
    - Vitality update failure → action still returns success (orphan vitality is acceptable per AC 3 step 7).
    - When the computed vitality state differs from the prior, `stateChangedAt` is included in the update; when it matches, only `lastComputedAt` is set.
  - [ ] **`cv-snapshot-service` unit test** in `src/lib/services/cv-snapshot-service.test.ts`. Mock `@vercel/blob`'s `get` (returning `{ body: ReadableStream }`) and `put` (returning `{ url: "..." }`). Assert path shape `cv/{userId}/{uuid}.pdf` and that `put` is called with `access: "private"` and `contentType: "application/pdf"`.
  - [ ] **Component tests** (light): `ApplyRitualDialog` rejects submit when no CV versions exist; default-selects the most recent version; renders inline error on action failure. No need to deeply test Base UI primitives.
  - [ ] **Vitality regression check**: extend (or add) a test that `computeVitalityState({ application: { status: "APPLIED", appliedAt: now }, isArchived: false, ... })` returns `"ACTIVE"`. (Already covered? Verify before adding a duplicate.)

## Dev Notes

### Schema is already in place — no new model

`Application` and `CvSnapshot` already exist in [prisma/schema.prisma:149-202](../../followcv/prisma/schema.prisma). All the relevant FKs are wired (`Application.cvSnapshotId @unique` ensures one snapshot per application; `Application.jobListingId @unique` ensures one application per listing). `ApplicationStatus` enum is complete. No new model is created in this story.

### Schema cascade fix — `CvSnapshot.cvVersion`

Today:

```prisma
model CvSnapshot {
  ...
  cvVersionId String
  cvVersion   CvVersion    @relation(fields: [cvVersionId], references: [id])
  application Application?
  ...
}
```

The missing `onDelete` defaults to `Restrict` in Prisma's relational behaviour. Combined with `User.cvVersions[] @relation(... onDelete: Cascade)` on `CvVersion`, account deletion can fail today: deleting a `User` cascades to `CvVersion`, which then refuses to delete because a `CvSnapshot` still references it. There's no flow that exercises this yet (Story 3.3 is what creates `CvSnapshot` rows in the first place), so it's a latent bug — fix it as part of this story so the cascade is correct from the moment snapshots can exist.

The migration is one line of SQL (`ALTER TABLE "cv_snapshots" ADD CONSTRAINT ... ON DELETE CASCADE`). Note that Story 3.2's `deleteCvVersion` action already refuses to delete a `CvVersion` whose snapshots are tied to an Application — that path is unchanged. The cascade only triggers via account deletion.

### Vercel Blob v2 — read-then-write copy pattern

Vercel Blob v2 does **not** expose a server-side `copy()` function. The supported pattern for an immutable snapshot is:

```ts
import { get, put } from "@vercel/blob"

// Read the source bytes (private blob, server-side auth via env token)
const source = await get(cvVersion.s3Key, { access: "private" })
const buffer = await new Response(source.body).arrayBuffer()

// Write the snapshot to a fresh, immutable key
const snapshotId = crypto.randomUUID()
const pathname = `cv/${userId}/${snapshotId}.pdf`
const blob = await put(pathname, buffer, {
  access: "private",
  contentType: "application/pdf",
})

// blob.url is the value to store in CvSnapshot.s3Key
```

Notes:
- `access: "private"` is mandatory (the store is private; "public" returns `bad_request: Cannot use public access on a private store`). See [followcv/project-context.md#Object storage — Vercel Blob](../../followcv/project-context.md).
- `crypto.randomUUID()` (built-in) is the right primitive for the path component; the project doesn't have `@paralleldrive/cuid2` installed, and adding a dep just for this would be wasteful. The `id` of the `CvSnapshot` row is set to the same UUID so the path and id stay aligned.
- Reading a 10MB PDF into a Node `ArrayBuffer` is fine — the Vercel function memory is well above this for the dialog flow.

### Sequencing & cleanup paths

Neon HTTP forbids transactions. The action's correctness comes from:

| Step | Failure → cleanup |
|---|---|
| 1. blob copy | (no DB write yet) → return error |
| 2. CvSnapshot row | `del(snapshotUrl)` |
| 3. Application row | `del(snapshotUrl)` + `prisma.cvSnapshot.delete({ where: { id } })` |
| 4. Vitality `JobListing.update` | swallow; return success |

Order matters: snapshot first, application second. The original epic AC says "atomic: if snapshot creation fails, Application not created" — by sequencing snapshot before application, that constraint is automatically satisfied. The reverse pathway (application created without a snapshot) cannot happen.

### "Already applied" — pre-check vs constraint

The DB enforces one application per listing via `@unique` on `Application.jobListingId`. But pre-checking `application` via the listing fetch in step 2 lets us return a friendly user-facing error ("You have already applied to this listing.") instead of relying on a Postgres unique-violation error string. Keep both: the pre-check for UX, and trust the constraint as the safety net for races.

### Board update pattern — `router.refresh()`, no optimistic layer

The board components do **not** use `useOptimistic`. The pattern across `VitalityOverrideMenu`, `BoardRowOverflowMenu`, and `ImportDrawer` is uniform:

```ts
const result = await someServerAction(...)
if (result.error === null) {
  router.refresh()
} else {
  // surface error inline
}
```

Apply rides the same pattern. Concretely:

1. Dialog confirms → `await applyToJob(...)`.
2. On success: dialog closes, Toast fires, `router.refresh()` re-fetches the Server Component data. The `BoardRow` then re-renders with `vitalityState: "ACTIVE"` and the **Applied** indicator.
3. On error: dialog stays open and shows the inline error (mirror `CvUploadDialog`'s `error` stage).

Don't introduce `useOptimistic` for this single feature — it would be inconsistent with the rest of the board surface. The refresh is fast enough that the transition feels immediate without it.

Reference for the existing pattern: [src/components/board/VitalityOverrideMenu.tsx:54](../../followcv/src/components/board/VitalityOverrideMenu.tsx).

### BoardRow nested-button pattern

`BoardRow` is rendered as `<Link href={\`/board/${id}\`}>...</Link>`. Any interactive descendant (the Apply button) must intercept its click:

```tsx
<button
  type="button"
  onClick={(e) => {
    e.preventDefault()
    e.stopPropagation()
    onApplyClick(id)
  }}
>
  Apply
</button>
```

This is exactly what `VitalityOverrideMenu` and `BoardRowOverflowMenu` already do. The Apply button gets the same treatment so middle-click / right-click on the row still navigate to `/board/[id]` as expected.

### CvSnapshot has no `userId` column — access is transitive

`CvSnapshot` does not store `userId`. Access is scoped via `CvSnapshot.application.userId` (or via `CvSnapshot.cvVersion.userId` for orphans, but during the action the snapshot is always linked to an Application before the function returns). Story 3.5 will use the same join. Account-deletion cleanup uses `where: { application: { userId } }`. Don't add a denormalised `userId` column — the join is cheap and the schema invariant (every snapshot is tied to a user via Application) is the source of truth.

### Out of scope for this story

- **Supporting document upload.** The original epic AC mentioned "optional supporting document upload" in the dialog. There is no `SupportingDocument` model in the schema, no UX precedent in the spec for *which document goes where*, and no Story-3.x story explicitly covers it. The Apply ritual works without it for the core "snapshot CV at apply time" outcome. Defer to a future story (Story 3.4 manages status + notes; a follow-up could model attachments). If the user disagrees, see "Questions before dev" below.
- **View CV sent.** That's Story 3.5. No browser-facing snapshot route in this story.
- **Status transitions.** Status starts at `APPLIED` and is not editable from this dialog. Story 3.4 adds the status selector.

### Constraints

- **No transactions, no `*Many` writes** (Neon HTTP rule).
- **`router.refresh()`, not `revalidateTag`.** Match every other mutation in this codebase.
- **`ActionResult<T>` contract:** never throw to the client, auth at entry, user-scoped reads.
- **Do not expose `s3Key` / blob URLs to the client.** The action returns only `{ applicationId, vitalityState }`.
- **`CvSnapshot` is write-once.** Once created, the row is never updated; the blob at that key is never overwritten. Story 3.5 will surface this with read-only behaviour.
- **PDF only** for the snapshot copy (matches Story 3.1's upload constraint). Don't infer or sniff content type — it's always PDF.

### Files to touch (reference)

- `followcv/prisma/schema.prisma` — UPDATE (add `onDelete: Cascade` on `CvSnapshot.cvVersion`)
- `followcv/prisma/migrations/<ts>_cv_snapshot_cascade_from_cv_version/` — NEW (generated)
- `followcv/src/lib/services/cv-snapshot-service.ts` — NEW (server-side blob copy)
- `followcv/src/lib/services/cv-snapshot-service.test.ts` — NEW
- `followcv/src/actions/apply-to-job.ts` — NEW
- `followcv/src/actions/apply-to-job.test.ts` — NEW
- `followcv/src/components/application/ApplyRitualDialog.tsx` — NEW
- `followcv/src/components/application/CVVersionSelector.tsx` — NEW
- `followcv/src/app/(dashboard)/board/page.tsx` — UPDATE (load applications + cv versions; pass into BoardClient)
- `followcv/src/components/board/BoardClient.tsx` — UPDATE (BoardListing type; one dialog instance; optimistic apply transition)
- `followcv/src/components/board/BoardRow.tsx` — UPDATE (Apply button / Applied indicator)
- `followcv/src/lib/account/service.ts` — UPDATE (extend `deleteAccount` to cover snapshot blobs)
- `followcv/src/lib/account/service.test.ts` — UPDATE (test the snapshot cleanup path)

### References

- Epic AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3]
- Previous story (full implementation): [Source: _bmad-output/implementation-artifacts/3-2-cv-version-management.md]
- Story 3.1 (upload, account-deletion blob cleanup, CvVersion patterns): [Source: _bmad-output/implementation-artifacts/3-1-cv-upload-and-version-history.md]
- Vitality state machine: [Source: followcv/src/lib/services/vitality-state-machine.ts]
- BoardClient & BoardRow: [Source: followcv/src/components/board/]
- Existing Server Action patterns: [Source: followcv/src/actions/manage-cv.ts]
- Account deletion cleanup pattern: [Source: followcv/src/lib/account/service.ts:20-37]
- Neon HTTP rule (no transactions): [Source: followcv/project-context.md#Database — Neon HTTP driver]
- Cache invalidation rule: [Source: followcv/project-context.md#Cache invalidation]
- Server Action contract: [Source: followcv/project-context.md#Server Action contract]
- Vercel Blob private store rules: [Source: followcv/project-context.md#Object storage — Vercel Blob]

## Questions before dev

If any of these don't match your intent, flag before kicking off implementation:

1. **Supporting document upload.** This story drops the optional supporting-doc field from the dialog (epic mentioned it; nothing in the schema models it; UX spec has no detail). Confirm: defer to a later story?
2. **Apply button vs. row link.** The plan: small inline **Apply** button on the BoardRow, click intercepts the row's `<Link>`. Alternatively, Apply could live only in the listing detail page and the BoardRow gets no new affordance. The dialog approach matches the UX spec ("the one modal in the product"); confirming the Board placement is the chosen surface.
3. **"Applied" indicator behaviour.** When already applied, the Apply slot becomes a muted "Applied" label. Click could (a) be a no-op, (b) navigate to the listing detail page, or (c) open a read-only view of the snapshot (which would be Story 3.5). Default plan: (a) no-op + tooltip showing the application's CV name and applied date.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

### Completion Notes List

- Schema cascade migration `20260507234839_cv_snapshot_cascade_from_cv_version` applied; `CvSnapshot.cvVersion` is now `ON DELETE CASCADE`.
- `cv-snapshot-service.ts`: server-side blob copy via `get()` → `arrayBuffer()` → `put()`. UUID for the path component; caller uses the same value as the row id. Service does not write to DB.
- `apply-to-job.ts`: full sequenced action with explicit cleanup paths (orphan blob + orphan snapshot row). Validates ownership, archived state, and "already applied"; checks CV version ownership; copies blob; creates snapshot row; creates application row; recomputes vitality. Returns only `{ applicationId, vitalityState }` — no `s3Key` leakage.
- UI: centred Base UI Dialog (`ApplyRitualDialog`) reuses the existing `Dropdown` for `CVVersionSelector`. Empty-state path when the user has no CV versions. Toast copy matches UX spec.
- Board integration: page selects `application: { id }` per listing and the user's CvVersion[]. BoardRow shows inline `Apply` button (intercepts `<Link>` via `e.preventDefault()`/`e.stopPropagation()`) or a muted `Applied` indicator. One dialog instance at BoardClient level.
- `deleteAccount()` extended to clean up `CvSnapshot.s3Key` blobs scoped via the Application relation.
- Validations: 227 tests pass (14 new tests for this story across `apply-to-job`, `cv-snapshot-service`, `account/service`); `tsc --noEmit` clean; `eslint` clean; `next build` clean.

### File List

- `followcv/prisma/schema.prisma` — modified (`CvSnapshot.cvVersion` now `onDelete: Cascade`)
- `followcv/prisma/migrations/20260507234839_cv_snapshot_cascade_from_cv_version/migration.sql` — created
- `followcv/src/lib/services/cv-snapshot-service.ts` — created
- `followcv/src/lib/services/cv-snapshot-service.test.ts` — created
- `followcv/src/actions/apply-to-job.ts` — created
- `followcv/src/actions/apply-to-job.test.ts` — created
- `followcv/src/components/application/ApplyRitualDialog.tsx` — created
- `followcv/src/components/application/CVVersionSelector.tsx` — created
- `followcv/src/app/(dashboard)/board/page.tsx` — modified (load `application` FK + `cvVersions`; pass into `BoardClient`)
- `followcv/src/components/board/BoardClient.tsx` — modified (`BoardListing.applied`, `cvVersions` prop, dialog wiring)
- `followcv/src/components/board/BoardClient.test.tsx` — modified (mock `ApplyRitualDialog`; `applied` default; `cvVersions={[]}`)
- `followcv/src/components/board/BoardRow.tsx` — modified (Apply button / Applied indicator; click interception)
- `followcv/src/lib/account/service.ts` — modified (collect snapshot blobs scoped via Application)
- `followcv/src/lib/account/service.test.ts` — modified (snapshot cleanup tests)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story created from epics.md Story 3.3 | bmad-create-story (claude-opus-4-7) |
| 2026-05-08 | All tasks implemented; 227 tests green; lint + types + build clean; status → done | claude-opus-4-7 |
