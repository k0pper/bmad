# FollowCV — project context for AI agents

Project-specific constraints and conventions that aren't obvious from reading the code. Read this before writing or modifying server-side code.

## Database — Neon HTTP driver, no transactions

The Prisma client is wired through the Neon HTTP adapter (`@prisma/adapter-neon`). The HTTP driver **does not support transactions**.

**Therefore, never use:**

- `prisma.<model>.updateMany(...)` — wraps in an implicit transaction at runtime
- `prisma.<model>.deleteMany(...)` — same
- `prisma.<model>.createMany(...)` with multiple rows — same
- `prisma.$transaction(...)` — explicitly fails

The runtime error you'll see if you do is: `Transactions are not supported in HTTP mode`.

**Pattern to use instead** for ownership-scoped mutations:

```ts
const owned = await prisma.jobListing.findFirst({
  where: { id: listingId, userId, deletedAt: null },
  select: { id: true },
})
if (!owned) return { data: null, error: "Not found" }

await prisma.jobListing.update({
  where: { id: owned.id },
  data: { /* ... */ },
})
```

References: [src/actions/listing.ts](src/actions/listing.ts), [src/actions/import-listing.ts](src/actions/import-listing.ts), [src/app/(dashboard)/board/[listingId]/page.tsx](src/app/(dashboard)/board/[listingId]/page.tsx).

## Cache invalidation — `router.refresh()`, not `revalidateTag`

Despite what `_bmad-output/planning-artifacts/architecture.md` says, this codebase uses `router.refresh()` from `next/navigation` after Server Action mutations, **not** `revalidateTag`. The board page is a Server Component that queries Prisma directly and has no cache tags. Tests assert that `revalidateTag` is **not** called (see [src/actions/import-listing.test.ts:151,292](src/actions/import-listing.test.ts)).

When adding new Server Actions, call `router.refresh()` from the calling Client Component on success.

## Server Action contract

All Server Actions return the typed union `ActionResult<T> = { data: T; error: null } | { data: null; error: string }` and **never throw**. Authentication via `auth()` is mandatory; every DB read/write must be scoped to the authenticated user's `id`.

## Object storage — Vercel Blob (private store, not Cloudflare R2)

CV files are stored in **Vercel Blob**, configured as a **private** store. The architecture document (`_bmad-output/planning-artifacts/architecture.md`) still mentions R2; it's historical context. The binding decision is in [`_bmad-output/implementation-artifacts/3-1-cv-upload-and-version-history.md`](../_bmad-output/implementation-artifacts/3-1-cv-upload-and-version-history.md).

**Why Vercel Blob:** zero infra setup, native Vercel integration, single env var, free tier on Hobby plan.

**Why private (not public):** the store is configured private in the Vercel dashboard. Private blobs are not publicly fetchable — every request is authenticated by a short-lived signature minted by the SDK with the server-side `BLOB_READ_WRITE_TOKEN`. This is meaningfully closer to FR34's "per-request authenticated access tokens that expire after use" intent than the original public-blob plan.

**Operational rules:**

- **Upload:** SDK call must declare `access: "private"` to match the store. Calling `access: "public"` returns `bad_request: Cannot use public access on a private store`.
- **Download:** the URL returned at upload-time carries a signature with a TTL. **Do not** store and re-serve it indefinitely — it expires. Instead, mint a fresh signed URL on every request via `head(stored_blob_url)` from `@vercel/blob`. `head()` accepts either a full URL or a pathname; auth comes from the env-side token, not from any signature on the input.
- The implementation pattern lives in [`requestCvDownloadUrl`](../followcv/src/actions/manage-cv.ts).

**Env vars:**

- `BLOB_READ_WRITE_TOKEN` — Vercel-injected when a Blob store is connected to the project. Pull locally with `vercel env pull .env.local`. **Never commit.**

**Local-dev gotcha — `onUploadCompleted` webhook:**

Do **NOT** pass `onUploadCompleted` to `handleUpload` in the upload-token API route, even as a no-op. Providing the property — empty body or not — makes the SDK try to set up a webhook callback after the PUT, and in local dev there's no publicly-reachable callback URL, so the upload hangs forever after the bytes land. The CV row is created from the client by calling `confirmCvUpload` synchronously after `upload()` resolves; the webhook is unnecessary.

**Pattern for new code:**

- Direct client uploads use `@vercel/blob/client`'s `upload()` with `handleUploadUrl` pointing at an API route that wraps `handleUpload({ onBeforeGenerateToken })` for auth + cap checks. Omit `onUploadCompleted`.
- Server Actions that need to issue a download URL: `findFirst` scoped to `session.user.id`, then `head(cvVersion.s3Key)` and return `meta.url`. Browser navigation (download click → `window.open(url)`) is not subject to CORS, so this works for the download flow.
- **Browser-side `fetch()` of private blob URLs is blocked by CORS**, so any flow that XHRs the bytes (PDF preview rendering, image thumbnailing, etc.) must go through a same-origin proxy route. The pattern is in [`src/app/api/cv/[id]/file/route.ts`](../followcv/src/app/api/cv/[id]/file/route.ts): auth + ownership check, then `get(cv.s3Key, { access: 'private' })` and stream the result back. Don't expose blob URLs to client-side `fetch`.
- The `CvVersion.s3Key` column name is a misnomer (legacy from the R2 draft) — it stores the Vercel Blob URL. Don't rename without a coordinated migration.

**Account deletion must clean up blobs.** `prisma.user.delete()` cascades the DB rows but doesn't touch Vercel Blob storage. [`deleteAccount()`](../followcv/src/lib/account/service.ts) collects every `cvVersion.s3Key` for the user and calls `del(urls)` from `@vercel/blob` before the DB cascade. Any new schema model that owns blob URLs must extend this cleanup or implement an equivalent — orphaned blobs are a privacy and storage-cost concern.

## Schema columns that mean something different than they look

- `CvVersion.s3Key` — stores the Vercel Blob URL, not an S3 key. See "Object storage" above.
