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
- **Download / preview:** Vercel Blob v2 does **not** expose a "generate signed download URL" function for private blobs. The URL `head()` returns is auth'd by the env-side `BLOB_READ_WRITE_TOKEN`, not by anything attached to the URL — opening it directly from a browser returns 403 forbidden. The only way to deliver a private blob to the browser is to **proxy the bytes through a same-origin route** that calls `get(s3Key, { access: "private" })` server-side and streams the result back. The reference implementation lives in [`src/app/api/cv/[id]/file/route.ts`](../followcv/src/app/api/cv/[id]/file/route.ts) and supports a `?download=1` query param to flip between `Content-Disposition: inline` (preview) and `attachment` (download).

**Env vars:**

- `BLOB_READ_WRITE_TOKEN` — Vercel-injected when a Blob store is connected to the project. Pull locally with `vercel env pull .env.local`. **Never commit.**

**Local-dev gotcha — `onUploadCompleted` webhook:**

Do **NOT** pass `onUploadCompleted` to `handleUpload` in the upload-token API route, even as a no-op. Providing the property — empty body or not — makes the SDK try to set up a webhook callback after the PUT, and in local dev there's no publicly-reachable callback URL, so the upload hangs forever after the bytes land. The CV row is created from the client by calling `confirmCvUpload` synchronously after `upload()` resolves; the webhook is unnecessary.

**Pattern for new code:**

- Direct client uploads use `@vercel/blob/client`'s `upload()` with `handleUploadUrl` pointing at an API route that wraps `handleUpload({ onBeforeGenerateToken })` for auth + cap checks. Omit `onUploadCompleted`.
- **All browser-facing reads — preview, download, thumbnail — go through a same-origin proxy route.** Direct browser navigation to a private blob URL returns 403; XHR is also blocked by CORS. The proxy auth-checks and ownership-checks, then streams via `get(s3Key, { access: 'private' })`. Use a query param (or separate routes) to flip `Content-Disposition` between `inline` and `attachment`.
- The blob URL never leaves the server. Don't expose `s3Key` to the client and don't write Server Actions that return it.
- The `CvVersion.s3Key` column name is a misnomer (legacy from the R2 draft) — it stores the Vercel Blob URL. Don't rename without a coordinated migration.

**Account deletion must clean up blobs.** `prisma.user.delete()` cascades the DB rows but doesn't touch Vercel Blob storage. [`deleteAccount()`](../followcv/src/lib/account/service.ts) collects every `cvVersion.s3Key` for the user and calls `del(urls)` from `@vercel/blob` before the DB cascade. Any new schema model that owns blob URLs must extend this cleanup or implement an equivalent — orphaned blobs are a privacy and storage-cost concern.

## Schema columns that mean something different than they look

- `CvVersion.s3Key` — stores the Vercel Blob URL, not an S3 key. See "Object storage" above.
- `GmailToken.refreshToken` — stores **AES-256-GCM ciphertext** (base64 of `iv || ciphertext || authTag`), not the plaintext refresh token. See "Gmail OAuth" below.

## Gmail OAuth — separate flow from Auth.js login

Auth.js v5 owns the user's *login* OAuth dance (Google `openid email profile` scopes). Gmail-readonly is a **separate** Google OAuth 2.0 authorization-code flow (see `_bmad-output/planning-artifacts/architecture.md` lines 47, 168–173 — "separate Gmail OAuth scope for email access"):

- **Start:** Server Action `startGmailOauth` in [`src/actions/connect-gmail.ts`](../followcv/src/actions/connect-gmail.ts) generates a CSRF state, stashes it in an HTTP-only cookie scoped to `/api/oauth/gmail`, then `redirect()`s to `https://accounts.google.com/o/oauth2/v2/auth` with scope `https://www.googleapis.com/auth/gmail.readonly` and `prompt=consent` (forces refresh-token return).
- **Callback:** Route Handler at [`src/app/api/oauth/gmail/route.ts`](../followcv/src/app/api/oauth/gmail/route.ts). Validates state → exchanges code at `https://oauth2.googleapis.com/token` → reads connected email from `https://gmail.googleapis.com/gmail/v1/users/me/profile` → writes the `GmailToken` row → calls `unstable_update({ user: { gmailConnected: true } })` to refresh the JWT → redirects to `/settings/gmail?connected=1`.
- **No new dependency.** Reuses native `fetch` + Node `crypto`. The `googleapis` SDK is intentionally not added until Story 6.2 needs the Gmail message-list API.

The same Google Cloud OAuth client (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`) is reused — register **two** authorized redirect URIs in the Google Cloud Console: the Auth.js callback `/api/auth/callback/google` *and* `/api/oauth/gmail`.

## Gmail token encryption — refresh token only

`GmailToken.refreshToken` is encrypted at rest with AES-256-GCM. The encryption module is [`src/lib/services/gmail-token-service.ts`](../followcv/src/lib/services/gmail-token-service.ts), and that module is the **only** legitimate writer of the row (`setGmailToken`) — disconnect goes through [`src/lib/account/service.ts`](../followcv/src/lib/account/service.ts) → `revokeGmailAccess` (best-effort POST to `https://oauth2.googleapis.com/revoke` before the DB delete).

- Format: `base64(12-byte IV || ciphertext || 16-byte authTag)`.
- Key: 32-byte hex string in `GMAIL_TOKEN_ENCRYPTION_KEY`. Generate with `openssl rand -hex 32`. Validated lazily on first use; missing/malformed key throws a clear error.
- The `accessToken` column stays plaintext — short-lived (~1h) and re-fetched from the refresh token on expiry by Story 6.2's pg-boss job. Architecture spec only requires encrypting the refresh token (lines 170–171).

## `gmailConnected` JWT flag is a UI hint, not an entitlement

The session JWT carries a `gmailConnected: boolean` flag (set/cleared by `unstable_update` on connect/disconnect). **Treat it as cosmetic.** Every server-side decision that depends on whether Gmail is connected — the sidebar prompt's gating query, the `/settings/gmail` page render, Story 6.2's pg-boss job target list — must read directly from the `GmailToken` table.

This mirrors the Story 5.2 lesson tracked in `_bmad-output/implementation-artifacts/deferred-work.md` ("JWT-cached `subscriptionTier` is a latent foot-gun"): a JWT field is frozen at sign-in (or last update) and can be up to 30 days stale; never gate access control on it.

Tests must not stub by setting `session.user.gmailConnected = true` — mock the DB row instead.

## Gmail signal ingestion (Story 6.2)

The `gmail-ingest-signals` pg-boss job runs alongside `vitality-recompute` on every cron tick (gmail-ingest first; recompute reads its `AuditLog` rows the same tick). Pipeline:

1. **Eligibility filter:** `User.subscriptionTier = 'PRO' AND gmailToken IS NOT NULL`. Free users + non-connected Pro users are skipped at the SQL filter.
2. **Per-user processor** ([`src/lib/services/gmail-signal-processor.ts`](../followcv/src/lib/services/gmail-signal-processor.ts)):
   1. Refresh access token via `oauth2.googleapis.com/token` (`grant_type=refresh_token`). HTTP 400 + `error: 'invalid_grant'` ⇒ user revoked the grant in Google's account settings ⇒ delete the `GmailToken` row via `revokeGmailAccess` and return.
   2. Enumerate distinct `companyDomain`s for the user across active listings with an Application.
   3. For each domain, call `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:<domain>+after:<unix-seconds>&maxResults=1` and read **only `resultSizeEstimate`**.
   4. On hit, write one `AuditLog { source: GMAIL_SIGNAL, listingId, computedAt }` per affected listing. The state machine's Rule 5 transitions `IN_DIALOGUE`; **the processor never writes `vitalityState` directly** (the architecture's state-machine boundary still owns that field).
   5. Update `GmailToken.lastSignalCheckAt = now` so the next tick's `after:` floor advances.
3. **Privacy hard rule:** the processor must never call `messages/{id}` (would return body + headers), persist message IDs, or log the `messages` array contents. Tests assert URL stays at `messages` (list), never `messages/<id>`.
4. **Per-user isolation:** the job handler wraps each `processGmailSignalsForUser` call in `try/catch`. One user's network glitch never aborts the batch. System-level exceptions (DB connection lost, etc.) propagate and trigger pg-boss DLQ for the whole job.
5. **First-run floor:** if `lastSignalCheckAt` is null (first tick after connect), the processor uses `GmailToken.createdAt` as the `after:` floor. We never look at email older than the consent event.

The processor reuses everything from Story 6.1 (encryption, decryption, `revokeGmailAccess`, `GmailToken` schema). No new dependency was added — native `fetch` covers Gmail's REST surface.

## `/settings/gmail` is the canonical Gmail surface

The dedicated page at [`src/app/(dashboard)/settings/gmail/page.tsx`](../followcv/src/app/(dashboard)/settings/gmail/page.tsx) is the home for connect/disconnect (full-page consent ceremony per UX spec Journey 4 — trust stakes justify the space). The legacy "Revoke Gmail" button still lives in `AccountDangerZone` on `/settings`; it works but is no longer the primary affordance. New Gmail UX should slot into `/settings/gmail`, not the danger zone.
