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

## Object storage — Vercel Blob (not Cloudflare R2)

CV files are stored in **Vercel Blob**, not Cloudflare R2. The architecture document (`_bmad-output/planning-artifacts/architecture.md`) still mentions R2; it's historical context. The binding decision is in [`_bmad-output/implementation-artifacts/3-1-cv-upload-and-version-history.md`](../_bmad-output/implementation-artifacts/3-1-cv-upload-and-version-history.md).

**Why:** zero infra setup, native Vercel integration, single env var, free tier on Hobby plan. R2's egress-free pricing was attractive but the operational simplicity won.

**Trade-offs to know about:**

- Vercel Blob URLs are **public-but-unguessable and permanent** — there is no native "expiring URL" feature. Auth is enforced at the application layer: the URL is never embedded in HTML and is only returned to the owner via authenticated Server Actions (`requestCvDownloadUrl`). The URL is treated as a capability token.
- This is a deliberate, documented divergence from FR34 ("per-request authenticated access tokens that expire after use"). Materially close to the spec's intent (no public bucket, every download authenticated) but lacks a TTL on the URL itself.

**Env vars:**

- `BLOB_READ_WRITE_TOKEN` — Vercel-injected when a Blob store is connected to the project. Pull locally with `vercel env pull .env.local`. **Never commit.**

**Pattern for new code:**

- Server Actions that need to issue a download URL: `findFirst` scoped to `session.user.id`, return `cvVersion.s3Key` (which holds the blob URL) only when ownership matches.
- Direct client uploads use `@vercel/blob/client`'s `upload()` with `handleUploadUrl` pointing at an API route that wraps `handleUpload({ onBeforeGenerateToken })` for auth + cap checks.
- The `CvVersion.s3Key` column name is a misnomer (legacy from the R2 draft) — it stores the Vercel Blob URL. Don't rename without a coordinated migration.

## Schema columns that mean something different than they look

- `CvVersion.s3Key` — stores the Vercel Blob URL, not an S3 key. See "Object storage" above.
