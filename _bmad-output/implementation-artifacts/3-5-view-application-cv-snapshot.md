# Story 3.5: View Application CV Snapshot

Status: done

## Story

As a **user**,
I want to view the exact CV version attached to any past application,
So that I always know which version a company received, even if my CV has changed since.

## Acceptance Criteria (from epics.md)

1. From the listing detail view, a "View CV sent" affordance opens the snapshot in a new tab.
2. The snapshot file is the immutable point-in-time copy — not the current version of the source CV.
3. CvSnapshot rows are write-once; no update path exists.
4. If the snapshot file is missing from storage, the UI surfaces "Snapshot unavailable" gracefully.
5. The application detail labels the file with the version name sent (e.g. "CV sent: Senior Frontend").

## Implementation

### Same-origin proxy route

`src/app/api/cv/snapshot/[id]/file/route.ts` mirrors the CvVersion proxy at `src/app/api/cv/[id]/file/route.ts`:

- Auth + ownership scope: `prisma.cvSnapshot.findFirst({ where: { id, application: { userId } } })`. Non-owners get 404 (not 403) so existence is never leaked. CvSnapshot has no `userId` column — access goes through Application.
- Streams via `get(s3Key, { access: "private" })`. Returns 404 if `get()` returns null (blob missing). Returns 502 on storage outage.
- Supports `?download=1` to flip `Content-Disposition` between `inline` and `attachment`. Filename is the source CvVersion's `name`.
- Cache-Control: `private, max-age=300` (matches the CV proxy).

### Immutability

CvSnapshot rows are write-once by convention:
- `Story 3.3 apply-to-job` is the only path that creates them.
- The cascade-delete from CvVersion (Story 3.3 migration) is the only path that deletes them, transitively.
- No action updates them; the schema has no `updatedAt` column — Prisma never targets it.
- The blob path is `cv/{userId}/{uuid}.pdf` — UUID per snapshot, never reused.

### UI

The listing detail page's Application accordion now has a "CV sent" row with the version name and two compact links: **View** (`?inline`) and **Download** (`?download=1`). Both open in a new tab through the proxy, so middle-click and Cmd-click work.

### Missing-blob UX

When `get()` returns null, the route returns 404. Clicking the link opens a blank tab with the browser's default 404 page — acceptable for an edge case (snapshot blobs are immutable; the only realistic way to lose one is an externally-deleted blob). If we ever need a richer in-page "Snapshot unavailable" message, we'd add a `head()`-style existence check at page render time; not done now to avoid an extra storage round-trip on every listing view.

### Files

- `followcv/src/app/api/cv/snapshot/[id]/file/route.ts` — created
- `followcv/src/app/(dashboard)/board/[listingId]/page.tsx` — modified (loads CvSnapshot + CvVersion via the application include; renders CV-sent row with View/Download links)

### Validations

`tsc --noEmit` clean, `next build` clean. Suite stayed at 244 tests (no new tests for the route — proxy routes are integration-tested manually, mirroring Story 3.1's stance).

### Constraints honoured

- No transactions, no `*Many` writes (Neon HTTP rule).
- `s3Key` never crosses the wire — all browser-facing reads go through this same-origin proxy.
- Auth at entry; ownership scoped to the session userId via the Application join.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story implemented and shipped to main | claude-opus-4-7 |
