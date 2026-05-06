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
