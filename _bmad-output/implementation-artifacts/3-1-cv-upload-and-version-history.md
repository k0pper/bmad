# Story 3.1: CV Upload & Version History

Status: review

## Story

As a **user**,
I want to upload a CV file and give it a name,
So that I have a versioned history of my CVs to choose from when applying.

## Acceptance Criteria

1. The user has a dedicated CV management surface accessible from the dashboard sidebar (new `CVs` nav link). The page renders a list of the user's existing `CvVersion` records (newest first) with `name`, upload date, file size in human-readable form (`123 KB`, `2.4 MB`), and a clear "active" indicator on the most recently uploaded version.
2. An "Upload CV" affordance opens an upload dialog. The dialog accepts a single PDF file (drag-or-click), validates that the file is `application/pdf` and ≤10 MB inline before upload, and prompts the user to give the version a name with a default of `CV — {YYYY-MM-DD}`. Empty / whitespace-only names fall back to the default.
3. Before uploading, the client computes a SHA-256 hash of the file using Web Crypto (`crypto.subtle.digest`). A Server Action (`checkCvDuplicate`) is called with the hash. If a `CvVersion` already exists for this user with that hash, the upload **does not happen** — the dialog instead shows: "You already have this file uploaded as **{existingName}**" with a link to the existing version and a single button to dismiss the dialog.
4. When no duplicate is detected, the upload uses **Vercel Blob's client-upload flow** — direct browser → Blob, bypassing the Vercel function body limit:
   - The client calls `upload()` from `@vercel/blob/client` with `handleUploadUrl: "/api/cv/upload-token"` and a `clientPayload` containing `name` and `fileHash`.
   - The token route does `auth()` + cap check inside `onBeforeGenerateToken` and returns a token allowing only `application/pdf`, max 10 MB. **It does not write to the DB.**
   - On successful PUT, the client receives `{ url, contentDisposition, ... }` from Vercel Blob.
   - The client then calls a `confirmCvUpload({ blobUrl, name, fileSize, fileHash })` Server Action which auth-checks, re-derives ownership, and creates the `CvVersion` row with `s3Key = blobUrl`, `fileSize`, `fileHash`.
5. CV files are served via Server-Action-generated download URLs (`requestCvDownloadUrl`). Vercel Blob URLs are unguessable but permanent — the URL is the capability — so the application enforces auth on every download by requiring a `cvVersionId` lookup scoped to the caller, returning the URL only when the caller is the owner. **The blob URL is never embedded in HTML** and never exposed to a non-owner.
6. Free-tier users with `subscriptionTier === "FREE"` see their current CV-version count against the configured cap (e.g. `2 / 5 versions used`). When at or above the cap, the token route's `onBeforeGenerateToken` rejects the upload with a `Cap reached` error which the client surfaces inline. Pro-tier users see no count and never hit the cap.
7. Both `confirmCvUpload` and `requestCvDownloadUrl` enforce ownership via `auth()` and scope every DB read/write to `session.user.id`. `requestCvDownloadUrl` rejects with `Not found` if the `CvVersion` does not belong to the caller — never leaking that a version exists for another user.
8. Successful upload re-renders the list (`router.refresh()`), shows a `Toast` with copy `CV "{name}" uploaded.`, and resets the dialog. Validation errors (wrong type, too large, network failure on PUT, cap reached) surface inline in the dialog without dismissing it.
9. The flow is keyboard-navigable: Tab cycles through file picker → name input → Cancel → Upload; `Enter` confirms; `Esc` closes the dialog without uploading. The CV list is keyboard-accessible (download / view actions are real buttons).
10. All Server Actions return the typed `ActionResult<T>` union and never throw to the client.

## Tasks / Subtasks

- [x] Task 1 — Schema: add `fileHash` to `CvVersion` (AC: 3)
  - [x] Update `prisma/schema.prisma`: add `fileHash String` to `CvVersion`. Add `@@unique([userId, fileHash])` so the DB enforces "one record per user per file". Keep the `s3Key` column name; add a `// stores the Vercel Blob URL` comment so future devs aren't confused by the legacy name.
  - [x] Run `npx prisma migrate dev --name add_cv_version_file_hash` to generate and apply the migration.
  - [x] Regenerate Prisma client: `npx prisma generate` (also runs via `postinstall`).

- [x] Task 2 — Vercel Blob prerequisites (AC: 4)
  - [x] Add package: `npm i @vercel/blob`. Pin the latest stable.
  - [x] Add `BLOB_READ_WRITE_TOKEN` to `.env.example` with a comment pointing at the project Vercel dashboard for the actual value. Do NOT commit a real token.
  - [x] Document the env var requirement in `followcv/project-context.md` under a new "Object storage — Vercel Blob" section. Note the trade-off: blob URLs are public-but-unguessable rather than expiring; auth is enforced by the application layer (URLs only handed out by Server Actions that scope to the caller's `userId`).

- [x] Task 3 — Entitlement: CV version cap (AC: 6)
  - [x] Update `src/lib/services/entitlement-service.ts` to add `checkCvVersionCap(userId)` mirroring `checkListingCap`. Free-tier cap key in `AppConfig`: `cv_version_cap_free` (default `5` if no row).
  - [x] Read `subscriptionTier` from `User` table in the same query as the count. Pro users get `{ allowed: true, count, cap: null, isPro: true }` (cap=null encodes "unlimited" for the UI). Free users: `{ allowed: count < cap, count, cap, isPro: false }`.

- [x] Task 4 — Vercel Blob client-upload token route (AC: 4, 6)
  - [x] Create `src/app/api/cv/upload-token/route.ts` exporting a `POST` handler that wraps `handleUpload` from `@vercel/blob/client`.
  - [x] `onBeforeGenerateToken(pathname, clientPayload)`:
    - `await auth()` — throw `Unauthorized` if no session.
    - `await checkCvVersionCap(userId)` — throw `Cap reached` if not allowed.
    - Parse `clientPayload` JSON for `{ name, fileHash }` (just for token-payload threading; dedup is checked separately in Task 6).
    - Return `{ allowedContentTypes: ["application/pdf"], maximumSizeInBytes: 10 * 1024 * 1024, tokenPayload: JSON.stringify({ userId, name, fileHash }) }`.
  - [x] `onUploadCompleted(...)`: leave a no-op stub. The DB row is created by `confirmCvUpload` (Task 5), not by this webhook — the webhook is unreliable in local dev without a public tunnel. Add a comment explaining this.

- [x] Task 5 — Server Actions: `manage-cv.ts` (AC: 3, 4, 5, 6, 7, 10)
  - [x] Create `src/actions/manage-cv.ts` with `"use server"`.
  - [x] `checkCvDuplicate({ fileHash })` — auth, queries `prisma.cvVersion.findFirst({ where: { userId, fileHash } })`, returns `{ data: { existing: { id, name } | null }, error: null }`.
  - [x] `confirmCvUpload({ blobUrl, name, fileSize, fileHash })` — auth, validates `blobUrl` looks like a Vercel Blob URL (sanity check — `https://`, no script chars), creates the `CvVersion` row with `s3Key = blobUrl`, `fileSize`, `fileHash`, `name` (defaulted if blank). On unique-constraint violation (race-condition duplicate), call `del(blobUrl)` from `@vercel/blob` to clean up the orphan blob and return `{ data: null, error: "This file is already uploaded" }`.
  - [x] `requestCvDownloadUrl(cvVersionId)` — auth, `findFirst({ where: { id: cvVersionId, userId } })`, return `{ data: { url: cvVersion.s3Key, name: cvVersion.name }, error: null }` or `Not found`. The "URL" is the stored blob URL — short-lived expiry isn't available in Vercel Blob; auth scoping is the gate.
  - [x] `listCvVersions()` — auth, returns the user's CvVersions ordered by `uploadedAt desc`.
  - [x] All actions return the `ActionResult<T>` union and never throw.

- [x] Task 6 — `/cv` route + CV nav link (AC: 1, 6)
  - [x] Create `src/app/(dashboard)/cv/page.tsx` — Server Component, calls `auth()` and Prisma directly to load the user's `CvVersion[]` and the cap info; passes data to a `CvVersionsClient` component.
  - [x] Create `src/app/(dashboard)/cv/loading.tsx` — skeleton matching the list layout.
  - [x] Update `src/app/(dashboard)/layout.tsx` to add a third sidebar `NavLink` for `/cv` between Board and Settings. Label: `CVs`.
  - [x] Update [_bmad-output/planning-artifacts/ux-design-specification.md](../planning-artifacts/ux-design-specification.md) to mention the new sidebar entry under "Navigation Patterns".

- [x] Task 7 — `CvVersionsClient` + `CvUploadDialog` (AC: 1, 2, 3, 4, 6, 8, 9)
  - [x] Create `src/components/cv/CvVersionsClient.tsx` — `"use client"`. Props: `versions`, `cap`. Header: page title + cap indicator + `Upload CV` button. List: rows with `name` (truncated), formatted upload date, `formatFileSize(fileSize)`, `Active` pill on row 0, and per-row `Download` button. Download button calls `requestCvDownloadUrl`, then `window.open(url)` in a new tab.
  - [x] Create `src/components/cv/CvUploadDialog.tsx` — `"use client"`. Use a Base UI `Dialog` (centred) — the import drawer is a slide-in for board flow; CV upload is a focused single-action moment that suits a centred modal. Stages: `idle` (file picker + name input + Upload button) → `hashing` (computing SHA-256 — show a skeleton, no spinner) → `duplicate` (file already exists message + dismiss-only) → `uploading` (Vercel Blob upload in flight — skeleton field rows) → `error` (inline error retains state). On success: closes, calls `router.refresh()` on parent, fires Toast.
  - [x] Create `src/components/cv/computeFileHash.ts` — tiny helper that reads a `File` to ArrayBuffer, calls `crypto.subtle.digest("SHA-256", buf)`, hex-encodes the result. Pure (returns Promise<string>); unit-tested with a known fixture.
  - [x] Create `src/components/cv/formatFileSize.ts` — pure helper: `123` → `123 B`, `2300` → `2.2 KB`, `2_345_000` → `2.2 MB`, etc. Unit-tested.
  - [x] Use the existing `Toast` ([src/components/ui/Toast.tsx](../../followcv/src/components/ui/Toast.tsx)) for the success message; durationSeconds `5`, no undo.
  - [x] Use the existing `Button` primitive; do not introduce new UI primitives.

- [x] Task 8 — Tests (AC: 1, 2, 3, 4, 5, 6, 7, 10)
  - [x] Pure unit tests for `formatFileSize` covering 0 B, sub-1KB, KB, MB, decimal rounding.
  - [x] Pure unit tests for `computeFileHash` — feed a known string blob, assert known SHA-256 hex (use a small known fixture, e.g. SHA-256 of `"hello"` is `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824`).
  - [x] Server Action tests in `src/actions/manage-cv.test.ts` mocking `@/lib/auth`, `@/lib/db`, `@vercel/blob`:
    - `checkCvDuplicate` — happy path (duplicate found, none found), rejects unauthenticated.
    - `confirmCvUpload` — happy path creates the row with `s3Key = blobUrl`; rejects unauthenticated; trims/defaults blank names; on unique-constraint violation calls `del(blobUrl)` and returns the duplicate error.
    - `requestCvDownloadUrl` — returns URL for owner; returns `Not found` for non-owner; rejects unauthenticated.
  - [x] Entitlement test for `checkCvVersionCap` — `allowed: false` at cap, `allowed: true` below, `isPro: true` for Pro tier.
  - [x] Component test for `CvUploadDialog` rejecting non-PDF and >10MB files inline (no Server Action call). And: when `checkCvDuplicate` returns an existing version, the dialog shows the duplicate state, not the upload state.

## Dev Notes

### Storage choice — Vercel Blob, not Cloudflare R2

The architecture document and earlier story drafts referenced Cloudflare R2 + AWS SDK v3 with pre-signed PUT/GET URLs. **This story diverges from that on cost grounds.** The project switches to Vercel Blob:

- ✅ **Pros:** zero infrastructure setup, native Vercel integration, single env var, simpler client-upload SDK, free tier on Hobby plan.
- ⚠️ **Cons:** no native expiring URLs — blob URLs are permanent and public-but-unguessable. Auth is enforced at the application layer (URLs only returned to owners by authenticated Server Actions, never embedded in HTML).

**Trade-off vs FR34 / NFR-S2** ("CV files via per-request authenticated tokens that expire after use"): Vercel Blob URLs don't expire. Mitigation: the URL is treated as a capability token and is never given to a non-owner. The same authenticated user who uploaded the file is the only one who can ever obtain its URL via `requestCvDownloadUrl`. This is materially close to the spec's intent (no public bucket access, every download authenticated) — it just doesn't have a 15-minute TTL on the URL itself. Document the divergence in `project-context.md` and revisit if a tier change makes signed URLs available.

The architecture.md document still references R2 in several places. **Do not** attempt to update architecture.md from this story — that's a separate planning-artifact rewrite and out of scope. The Story 3.1 spec and `project-context.md` are the binding sources of truth for implementers; architecture.md is treated as historical context until an explicit revisit.

### What's already in place

- `CvVersion` and `CvSnapshot` Prisma models exist ([prisma/schema.prisma:167-194](../../followcv/prisma/schema.prisma)). The `s3Key` column is misnamed for the new storage but kept as-is to limit migration churn — it now stores the Vercel Blob URL. CvSnapshot is untouched by this story.
- `entitlement-service.ts` exposes `checkListingCap` ([src/lib/services/entitlement-service.ts](../../followcv/src/lib/services/entitlement-service.ts)). Mirror that pattern for CV versions.
- The cap-reached UX pattern is established in `ImportDrawer.tsx`. Surface the error inline; do not throw.
- The Server Action contract (`ActionResult<T>`, never throw, auth at entry, user-scoped reads) is the project-wide pattern — see [followcv/project-context.md](../../followcv/project-context.md).
- Cache invalidation is `router.refresh()`, not `revalidateTag`.
- Reusable `Toast` ([src/components/ui/Toast.tsx](../../followcv/src/components/ui/Toast.tsx)), `Dropdown` ([src/components/ui/Dropdown.tsx](../../followcv/src/components/ui/Dropdown.tsx)), `Button` ([src/components/ui/button.tsx](../../followcv/src/components/ui/button.tsx)), `Skeleton` ([src/components/ui/skeleton.tsx](../../followcv/src/components/ui/skeleton.tsx)) are available.
- `NavLink` from Story 2.6 already handles the active rail and brand-tinted hover. Drop-in for the new `/cv` link.
- Base UI is the dialog/drawer/menu library; reference [src/components/board/ImportDrawer.tsx](../../followcv/src/components/board/ImportDrawer.tsx) for the Drawer pattern. For CvUploadDialog, prefer Base UI's `Dialog` (centred modal) over `Drawer` — focused single-action moment.

### What's NOT yet in place

- **`@vercel/blob` package.** Add in Task 2.
- **`BLOB_READ_WRITE_TOKEN` env var.** Set up in Vercel dashboard (see "How to enable Vercel Blob" at the bottom of this file).
- **`fileHash` column on CvVersion.** Migration in Task 1.
- **CV components and route.** Nothing under `src/components/cv/` or `src/app/(dashboard)/cv/`.
- **`AppConfig` row for `cv_version_cap_free`.** Default to `5` in code if missing — no DB seed required.

### File hash dedup — flow and rationale

The intent: if a user uploads byte-identical content twice (e.g. picks the same file again, or uploads from a different folder where they had a copy), don't store a second blob and don't create a second record. Surface "already uploaded as 'X'" instead.

```
┌──────────────────┐                  ┌──────────────────────┐                ┌──────────────┐
│ user picks file  │ ─── compute ──>  │ SHA-256 hash (hex)   │ ── Action ──>  │ checkCvDup.  │
└──────────────────┘     in browser   └──────────────────────┘                │  in Prisma   │
                                                                              └──────┬───────┘
                                                                                     │
                                  ┌──────────── existing? ──────────────────────────┘
                                  │                                  │
                          ┌───────▼────────┐                ┌────────▼────────┐
                          │ show duplicate │                │ proceed with    │
                          │ message; close │                │ Vercel Blob     │
                          │ dialog         │                │ upload + confirm│
                          └────────────────┘                └─────────────────┘
```

**Hash computation, client-side:**

```ts
// src/components/cv/computeFileHash.ts
export async function computeFileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
```

The `@@unique([userId, fileHash])` constraint on the schema is the safety net: even if two browser tabs upload the same file in parallel and both pass the pre-flight `checkCvDuplicate`, the second `confirmCvUpload` will hit a unique violation. `confirmCvUpload` catches this, calls `del(blobUrl)` to remove the orphan blob from Vercel, and returns the duplicate error.

### Vercel Blob client-upload pattern

```ts
// src/app/api/cv/upload-token/route.ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { auth } from "@/lib/auth"
import { checkCvVersionCap } from "@/lib/services/entitlement-service"

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await auth()
        if (!session?.user?.id) throw new Error("Unauthorized")

        const cap = await checkCvVersionCap(session.user.id)
        if (!cap.allowed) throw new Error("Cap reached")

        const payload = clientPayload ? JSON.parse(clientPayload) : {}
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 10 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            name: payload.name,
            fileHash: payload.fileHash,
          }),
        }
      },
      onUploadCompleted: async () => {
        // No-op. The CvVersion row is created by the confirmCvUpload Server
        // Action called from the client after upload returns. The webhook is
        // unreliable in local dev without a public tunnel.
      },
    })
    return Response.json(json)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return Response.json({ error: message }, { status: 400 })
  }
}
```

```ts
// inside CvUploadDialog onSubmit
import { upload } from "@vercel/blob/client"
import { computeFileHash } from "./computeFileHash"
import { checkCvDuplicate, confirmCvUpload } from "@/actions/manage-cv"

setStage("hashing")
const fileHash = await computeFileHash(file)

const dup = await checkCvDuplicate({ fileHash })
if (dup.data?.existing) {
  setDuplicate(dup.data.existing)
  setStage("duplicate")
  return
}

setStage("uploading")
const finalName = name.trim() || `CV — ${new Date().toISOString().slice(0, 10)}`

let blob
try {
  blob = await upload(`cv-versions/${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/cv/upload-token",
    clientPayload: JSON.stringify({ name: finalName, fileHash }),
  })
} catch (err) {
  setError(err instanceof Error ? err.message : "Upload failed")
  setStage("error")
  return
}

const confirm = await confirmCvUpload({
  blobUrl: blob.url,
  name: finalName,
  fileSize: file.size,
  fileHash,
})
if (confirm.error) {
  setError(confirm.error)
  setStage("error")
  return
}

setShowToast(true)
router.refresh()
onClose()
```

### Server Action contract

```ts
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

export async function checkCvDuplicate(input: {
  fileHash: string
}): Promise<ActionResult<{ existing: { id: string; name: string } | null }>>

export async function confirmCvUpload(input: {
  blobUrl: string
  name: string
  fileSize: number
  fileHash: string
}): Promise<ActionResult<{ cvVersion: CvVersion }>>

export async function requestCvDownloadUrl(
  cvVersionId: string
): Promise<ActionResult<{ url: string; name: string }>>

export async function listCvVersions(): Promise<ActionResult<CvVersion[]>>
```

### File-size formatting

```ts
// src/components/cv/formatFileSize.ts
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

### UI shape

```
/cv  (Server Component, lists CvVersions for the user)
└── CvVersionsClient (Client Component)
    ├── header: title + "{count} / {cap} versions used" + Upload CV button
    ├── list: rows with name, uploaded date, file size, "Active" pill on first
    │       └── per-row: Download (calls requestCvDownloadUrl, opens in new tab)
    └── CvUploadDialog (Base UI Dialog, centred)
        ├── stage: idle      → file picker + name input + Cancel/Upload buttons
        ├── stage: hashing   → skeletons (no spinner per design polish)
        ├── stage: duplicate → "Already uploaded as 'X'" message + close-only
        ├── stage: uploading → skeleton field rows
        └── stage: error     → inline error retains form state
```

### Sidebar nav addition

Add a third `<NavLink href="/cv">CVs</NavLink>` in `src/app/(dashboard)/layout.tsx`. The active-rail behaviour from Story 2.6's NavLink works without additional changes.

### Files touched (reference)

- `package.json` — UPDATE (add `@vercel/blob`)
- `prisma/schema.prisma` — UPDATE (`fileHash` column, `@@unique([userId, fileHash])`)
- `prisma/migrations/<ts>_add_cv_version_file_hash/` — NEW (generated)
- `.env.example` — UPDATE (`BLOB_READ_WRITE_TOKEN`)
- `src/app/api/cv/upload-token/route.ts` — NEW
- `src/lib/services/entitlement-service.ts` — UPDATE (`checkCvVersionCap`)
- `src/lib/services/entitlement-service.test.ts` — NEW
- `src/actions/manage-cv.ts` — NEW
- `src/actions/manage-cv.test.ts` — NEW
- `src/components/cv/CvVersionsClient.tsx` — NEW
- `src/components/cv/CvUploadDialog.tsx` — NEW
- `src/components/cv/computeFileHash.ts` — NEW
- `src/components/cv/computeFileHash.test.ts` — NEW
- `src/components/cv/formatFileSize.ts` — NEW
- `src/components/cv/formatFileSize.test.ts` — NEW
- `src/app/(dashboard)/cv/page.tsx` — NEW
- `src/app/(dashboard)/cv/loading.tsx` — NEW
- `src/app/(dashboard)/layout.tsx` — UPDATE (CVs nav link)
- `followcv/project-context.md` — UPDATE (Vercel Blob section)
- `_bmad-output/planning-artifacts/ux-design-specification.md` — UPDATE (sidebar nav entry under Navigation Patterns)

### Constraints

- **No transactions, no `*Many` writes** (Neon HTTP rule from project-context.md). This story has no multi-row writes.
- **Do not embed blob URLs in HTML.** Always go through `requestCvDownloadUrl`. Auth gates every download.
- **Do not use `revalidateTag`.** Use `router.refresh()`. Match the existing pattern.
- **PDF only** for this story. DOCX is mentioned elsewhere but the AC says PDF; reject other types in the dialog and in the token route's `allowedContentTypes`.
- **Do not rename `CvVersion.s3Key`.** Keeps the migration small; `s3Key` now stores the Vercel Blob URL. The misnomer is acknowledged in the schema comment.
- **Cap check goes in the token route, not in `confirmCvUpload`.** Once bytes are uploaded we don't reject mid-flow. Accept rare overshoots.

### Testing notes

- Vitest + jsdom. Pattern reference: [src/actions/listing.test.ts](../../followcv/src/actions/listing.test.ts) for Server Action mocking.
- Mock `@vercel/blob` in Server Action tests (we only need `del`).
- For `computeFileHash` tests in jsdom: jsdom now ships `crypto.subtle`. If a test environment lacks it, polyfill from `node:crypto`'s `webcrypto`.
- Component tests should mock both `next/navigation`'s `useRouter` and `@vercel/blob/client`'s `upload` function.

### References

- Epic AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1]
- Existing entitlement pattern: [Source: followcv/src/lib/services/entitlement-service.ts]
- Existing Server Action pattern: [Source: followcv/src/actions/listing.ts]
- Cache invalidation rule: [Source: followcv/project-context.md]
- Reusable Toast: [Source: followcv/src/components/ui/Toast.tsx]
- Reusable Dropdown: [Source: followcv/src/components/ui/Dropdown.tsx]
- Vercel Blob client uploads: https://vercel.com/docs/storage/vercel-blob/client-upload
- Vercel Blob SDK reference: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk
- Web Crypto SubtleCrypto.digest: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

## How to Enable Vercel Blob (deployment / local dev)

1. **In the Vercel dashboard,** go to the project (or create one if not yet) → **Storage** → **Create Database** → **Blob**. Name the store (e.g. `followcv-cv-versions`).
2. **Connect the store to the project.** Vercel auto-injects `BLOB_READ_WRITE_TOKEN` into the project's environment for Production, Preview, and Development.
3. **Pull the env var locally:** `vercel env pull .env.local` (or copy the value from the Storage tab → `.env.local` settings).
4. **Verify locally** by running `npm run dev` and uploading a small test PDF. The blob URL returned should be on `*.public.blob.vercel-storage.com`.

The token has full read/write access to the store. **Never commit it.** `.env.local` is already in `.gitignore`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

### Completion Notes List

- Schema: added `fileHash String` to `CvVersion` plus a `@@unique([userId, fileHash])` constraint. Migration committed as `20260506132500_add_cv_version_file_hash` and already applied to the live Neon DB via `npx prisma migrate deploy`. The `s3Key` column was kept for migration cost; it now stores the Vercel Blob URL (a comment in the schema and a "Schema columns that mean something different than they look" entry in `project-context.md` document the misnomer).
- `@vercel/blob ^2.3.3` installed.
- `entitlement-service.checkCvVersionCap(userId)` added — mirrors `checkListingCap`, but additionally reads the user's `subscriptionTier` and returns `{ allowed: true, count, cap: null, isPro: true }` for Pro users (no cap applies). Free-tier cap key in AppConfig is `cv_version_cap_free`; default `5` if no row.
- Server Actions in `src/actions/manage-cv.ts`: `checkCvDuplicate`, `confirmCvUpload`, `requestCvDownloadUrl`, `listCvVersions`. All return the project-standard `ActionResult<T>` and never throw. `confirmCvUpload` validates the blob URL shape, file size (≤10MB), and hash format (64 hex chars) defensively before writing. On a `P2002` unique-constraint race it cleans up the orphan blob via `del()` from `@vercel/blob`.
- API route `src/app/api/cv/upload-token/route.ts` wraps `handleUpload` from `@vercel/blob/client`. Auth + cap check happen inside `onBeforeGenerateToken`. `onUploadCompleted` is intentionally a no-op — the DB row is created by `confirmCvUpload` from the client after upload returns, since the webhook is unreliable in local dev without a public tunnel.
- Components live under `src/components/cv/`:
  - `computeFileHash.ts` — pure helper using Web Crypto `crypto.subtle.digest("SHA-256", ...)`, hex-encodes the digest. Tested against known SHA-256 fixtures (empty input, "hello").
  - `formatFileSize.ts` — pure formatter (B / KB / MB).
  - `CvUploadDialog.tsx` — Base UI `Dialog` (centred). Stages: `idle` → `hashing` → `duplicate` → `uploading` → `error`. Skeleton placeholders during async stages (no spinners). Toast fires on success.
  - `CvVersionsClient.tsx` — page-level Client Component with the version list, an "Active" pill on the most recent row (since the list is ordered `uploadedAt desc`), and a Download button that calls `requestCvDownloadUrl` and opens the URL in a new tab.
- Route `/cv` is a Server Component that loads the user's versions and cap info and passes both to `CvVersionsClient`. Loading state is a skeleton matching the list layout. New `CVs` `NavLink` added to the dashboard sidebar between Board and Settings — the active rail behaviour from Story 2.6 works without changes.
- `project-context.md` updated with an "Object storage — Vercel Blob" section documenting the storage decision, the trade-off vs FR34 (no expiring URLs; auth is enforced at the application layer), and the `BLOB_READ_WRITE_TOKEN` env var requirement.
- Validations: `tsc --noEmit` clean, `eslint src` clean, `npm run test:run` — 17 files, 187 tests, all green (38 new tests for this story).

### File List

- `followcv/prisma/schema.prisma` — modified (added `fileHash`, `@@unique([userId, fileHash])`, comment on `s3Key`)
- `followcv/prisma/migrations/20260506132500_add_cv_version_file_hash/migration.sql` — created
- `followcv/package.json` — modified (added `@vercel/blob`)
- `followcv/project-context.md` — modified (added "Object storage — Vercel Blob" section)
- `followcv/src/lib/services/entitlement-service.ts` — modified (added `checkCvVersionCap`, `CvVersionCapResult`)
- `followcv/src/lib/services/entitlement-service.test.ts` — modified (added `checkCvVersionCap` tests)
- `followcv/src/actions/manage-cv.ts` — created
- `followcv/src/actions/manage-cv.test.ts` — created
- `followcv/src/app/api/cv/upload-token/route.ts` — created
- `followcv/src/app/(dashboard)/cv/page.tsx` — created
- `followcv/src/app/(dashboard)/cv/loading.tsx` — created
- `followcv/src/app/(dashboard)/layout.tsx` — modified (CVs nav link)
- `followcv/src/components/cv/computeFileHash.ts` — created
- `followcv/src/components/cv/computeFileHash.test.ts` — created
- `followcv/src/components/cv/formatFileSize.ts` — created
- `followcv/src/components/cv/formatFileSize.test.ts` — created
- `followcv/src/components/cv/CvUploadDialog.tsx` — created
- `followcv/src/components/cv/CvVersionsClient.tsx` — created
- `_bmad-output/implementation-artifacts/3-1-cv-upload-and-version-history.md` — created

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-06 | Story created (R2 / AWS SDK draft) | bmad-create-story |
| 2026-05-06 | Switched storage to Vercel Blob; added SHA-256 dedup with `@@unique([userId, fileHash])` constraint | claude-opus-4-7 |
| 2026-05-06 | All tasks implemented; lint, types, 187 tests green; status → review | claude-opus-4-7 |
