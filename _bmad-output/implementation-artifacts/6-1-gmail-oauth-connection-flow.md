# Story 6.1: Gmail OAuth Connection Flow

Status: review

## Story

As a **Pro user**,
I want to connect my Gmail account with a clear explanation of what access I'm granting,
so that I trust the integration and can enable automatic status tracking on my listings.

## Acceptance Criteria

1. **Gmail settings page is reachable at `/settings/gmail`** as a Server Component. The page is a dedicated full-page treatment (not a settings sub-tab) — the trust stakes justify a focused page (UX spec, Journey 4).
2. **Free users see `ProGatePattern`** in place of the connect UI, with the headline "Gmail auto-tracking is a Pro feature" and the standard `Upgrade to Pro` CTA pointing at `/settings/subscription`. Free users must not see the Connect button at all.
3. **Pro users without Gmail connected see the consent ceremony copy** — explicit explanation of:
   - **What is requested:** read-only Gmail access, scope `gmail.readonly`.
   - **What is *not* read or stored:** email content, attachments, contacts. Lead with this — UX spec says explanation must lead with what is *not* accessed.
   - **What it enables:** auto-status updates when companies whose domain matches a listing reply.
   - **That the user can disconnect at any time.**
   The page renders a single primary `Connect Gmail` button.
4. **Clicking `Connect Gmail` initiates a custom Google OAuth 2.0 authorization-code flow** with scope **`https://www.googleapis.com/auth/gmail.readonly`** only (no other scopes). Auth.js v5 is *not* used for this flow — it is a separate OAuth dance from the user's login. The flow:
   - A Server Action (`startGmailOauth`) generates a CSRF state token, stores it in an HTTP-only cookie scoped to `/api/oauth/gmail`, and `redirect()`s to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id=AUTH_GOOGLE_ID`, `redirect_uri={APP_URL}/api/oauth/gmail`, `response_type=code`, `scope=https://www.googleapis.com/auth/gmail.readonly`, `access_type=offline`, `prompt=consent`, `state={csrf}`, and `include_granted_scopes=true`.
   - `prompt=consent` is required so Google always returns a refresh token (without it, returning users sometimes only get an access token).
5. **The OAuth callback is a Route Handler at `src/app/api/oauth/gmail/route.ts`** (Node runtime). It:
   - Verifies the `state` cookie matches the `state` query param. Mismatch → 400.
   - Verifies the user is authenticated via `auth()`. Missing session → redirect to `/login`.
   - If Google returned `error=access_denied` → redirect to `/settings/gmail?denied=1` (no token write, no error toast — soft landing per UX spec).
   - Exchanges `code` for tokens via `POST https://oauth2.googleapis.com/token` (form-url-encoded, includes `code`, `client_id`, `client_secret=AUTH_GOOGLE_SECRET`, `redirect_uri`, `grant_type=authorization_code`).
   - Fetches the connected Gmail address via `GET https://gmail.googleapis.com/gmail/v1/users/me/profile` with the new access token; reads the `emailAddress` field.
   - Encrypts the **refresh token** with AES-256-GCM (see AC6) and **upserts** the `GmailToken` row for `userId` (single-row pattern — Neon HTTP forbids transactions).
   - Calls Auth.js `unstable_update({ gmailConnected: true })` to refresh the JWT.
   - Clears the state cookie and redirects to `/settings/gmail?connected=1`.
6. **Refresh tokens are encrypted at rest with AES-256-GCM**, keyed off `GMAIL_TOKEN_ENCRYPTION_KEY` (32-byte hex string env var, already declared in `.env.example` line 23). Encryption format: `base64(iv || ciphertext || authTag)` — 12-byte IV + ciphertext + 16-byte tag, single base64-encoded buffer for compactness. The `accessToken` column stays plaintext (it is short-lived; architecture lines 170–171 specify only the refresh token requires encryption). Encryption helpers live in `src/lib/services/gmail-token-service.ts` with co-located Vitest unit tests covering: round-trip correctness, tamper detection (modified ciphertext → throws), wrong-key detection, missing-key startup error.
7. **`gmail-token-service.ts` exposes `getGmailToken(userId)` and `setGmailToken({ userId, accessToken, refreshToken, expiresAt, connectedEmail })`.** `setGmailToken` is the single write site (used by the OAuth callback). `getGmailToken` is the single read site that returns the decrypted refresh token; it is used by Story 6.2's pg-boss job. No other code touches the `GmailToken` table.
8. **Connected state on the settings page** shows: "Gmail connected" status with the connected email (e.g. `marcus@gmail.com`), the date connected, and a `Disconnect` button. The Disconnect button calls `revokeGmailToken` (existing Server Action in `src/app/(dashboard)/settings/actions.ts` — DO NOT rebuild) which calls `revokeGmailAccess` in `src/lib/account/service.ts` (existing — DO NOT rebuild). Story 6.1 must additionally:
   - Call Google's revocation endpoint (`POST https://oauth2.googleapis.com/revoke?token={accessToken}`) on a best-effort basis before deleting the row, so the OAuth grant is cleaned up on Google's side too. If the call fails (network, expired token, 400), swallow the error and proceed with the DB delete — the DB delete is the source of truth.
   - Call `unstable_update({ gmailConnected: false })` after the row is deleted.
   - Confirm no `JobListing` or `Application` data is touched — write a regression test that verifies counts stay the same before/after disconnect.
9. **Free tier users see `ProGatePattern`** at `/settings/gmail` with the `ProGatePattern` component (already shipped in `src/components/shared/ProGatePattern.tsx` — DO NOT duplicate). Headline: "Gmail auto-tracking is a Pro feature". Description: short benefit blurb. CTA defaults to `/settings/subscription`.
10. **Sidebar prompt for Pro users with ≥3 imports who haven't connected Gmail** appears below the `HealthScoreWidget` in `src/app/(dashboard)/layout.tsx`:
    - A Server Component (`GmailConnectPrompt`) queries: `subscriptionTier === 'PRO'` AND `gmailToken` is null AND `JobListing.count({ where: { userId, deletedAt: null } }) >= 3`.
    - Renders a small dismissible card with copy "Connect Gmail to auto-track replies" and a link to `/settings/gmail`.
    - Dismissal is client-side: a Client Component wrapper reads/writes `localStorage["followcv:gmail-prompt-dismissed-v1"] = "1"`. Once dismissed it does not re-render until localStorage is cleared. (Per epic AC: "not shown again once dismissed or once Gmail is connected".)
    - When Gmail is connected, the prompt is hidden by the server-side query (no token check needed in the client).
    - Free users never see the prompt (the server-side gate excludes them — they have a different gating story per AC2).

## Tasks / Subtasks

- [x] **Task 1: Schema verification (AC6)** — Confirm the existing `GmailToken` model in `prisma/schema.prisma` has `userId @unique`, `accessToken String`, `refreshToken String`, `expiresAt DateTime`, `connectedEmail String`. **No migration is needed for Story 6.1.** The `refreshToken String` column will hold the base64-encrypted blob; the column type does not change.
- [x] **Task 2: AES-256-GCM crypto helpers (AC6)** at `src/lib/services/gmail-token-service.ts`
  - [x] 2.1 Implement `encryptRefreshToken(plaintext: string): string` and `decryptRefreshToken(ciphertext: string): string` using Node `crypto`. Format: `base64(12-byte IV || ciphertext || 16-byte authTag)`. Read `GMAIL_TOKEN_ENCRYPTION_KEY` (hex → 32 bytes) lazily on first use; throw a clear error if missing — same pattern as `getStripe()` in `src/lib/stripe/client.ts`.
  - [x] 2.2 Vitest tests: round-trip ok, tamper-detection (mutate one byte → throws), wrong-key (different key → throws), missing-key startup error.
- [x] **Task 3: `gmail-token-service.ts` token CRUD (AC7)**
  - [x] 3.1 `setGmailToken({ userId, accessToken, refreshToken, expiresAt, connectedEmail })` — encrypts refresh, then performs upsert via the Neon-HTTP-safe `findFirst → update | create` pattern (no `upsert`, no `*Many`, no `$transaction`).
  - [x] 3.2 `getGmailToken(userId)` — returns `{ accessToken, refreshToken, expiresAt, connectedEmail }` with the refresh token already decrypted, or `null`.
  - [x] 3.3 Vitest unit tests for both — mock `prisma.gmailToken` and the crypto helpers.
- [x] **Task 4: OAuth start Server Action (AC4)** at `src/actions/connect-gmail.ts`
  - [x] 4.1 `startGmailOauth()` — auth-checks, generates CSRF state via `crypto.randomBytes(32).toString("hex")`, sets it as an HTTP-only Secure cookie (`gmail_oauth_state`, path `/api/oauth/gmail`, `sameSite: "lax"`, `maxAge: 600`), then `redirect()`s to Google's authorization URL.
  - [x] 4.2 Pull `AUTH_GOOGLE_ID` and a new `getAppUrl()` helper for the `redirect_uri`. Reuse `getAppUrl` from `src/lib/stripe/client.ts` if importable, otherwise extract to `src/lib/utils/app-url.ts` and re-export from both.
  - [x] 4.3 Returns `ActionResult<never>` only on error path (success path `redirect()`s, throws `NEXT_REDIRECT`).
  - [x] 4.4 Vitest test for: unauth → error returned; happy path → `redirect()` called with correctly-shaped URL (use `vi.spyOn(navigation, 'redirect')`).
- [x] **Task 5: OAuth callback Route Handler (AC5)** at `src/app/api/oauth/gmail/route.ts`
  - [x] 5.1 `runtime = "nodejs"`, `dynamic = "force-dynamic"` (cookies + secrets).
  - [x] 5.2 Handle `error=access_denied` by clearing state cookie + redirect `/settings/gmail?denied=1`.
  - [x] 5.3 Validate `state` cookie matches query param. Mismatch → 400 plain-text.
  - [x] 5.4 `auth()` check; missing → redirect `/login`.
  - [x] 5.5 POST to `https://oauth2.googleapis.com/token` (form-url-encoded). Map response to `{ access_token, refresh_token, expires_in }`. If Google does not return a `refresh_token` (returning user with prior consent), fail soft: redirect `/settings/gmail?error=no_refresh_token` — the `prompt=consent` param should prevent this, but defend.
  - [x] 5.6 Fetch `https://gmail.googleapis.com/gmail/v1/users/me/profile` with `Authorization: Bearer {access_token}`. Read `emailAddress`.
  - [x] 5.7 Call `setGmailToken(...)` (Task 3).
  - [x] 5.8 Call Auth.js `unstable_update({ gmailConnected: true })`. Note: in v5 beta this is exported from `@/lib/auth` if added to the `NextAuth(...)` destructure; verify the export and add if missing.
  - [x] 5.9 Clear state cookie. Redirect to `/settings/gmail?connected=1`.
  - [x] 5.10 Vitest integration tests with mocked `fetch` and mocked `prisma`: state mismatch returns 400; access_denied returns redirect; happy path writes token + updates session + redirects.
- [x] **Task 6: `/settings/gmail` page (AC1, AC2, AC3, AC9)** at `src/app/(dashboard)/settings/gmail/page.tsx`
  - [x] 6.1 Server Component. `auth()` gate; redirect to `/login` if no session.
  - [x] 6.2 Read `prisma.user.findUnique({ where: { id: userId }, select: { subscriptionTier: true } })` and `prisma.gmailToken.findUnique({ where: { userId }, select: { connectedEmail: true, createdAt: true } })`.
  - [x] 6.3 If `subscriptionTier === 'FREE'`: render `<ProGatePattern headline="Gmail auto-tracking is a Pro feature" ctaHref="/settings/subscription" description="Connect your inbox to let FollowCV update listing status when companies reply. Available on Pro." />`. Stop.
  - [x] 6.4 If `gmailToken` exists: render the connected-state UI (email, connected-on date, `Disconnect` button = a small Client Component that calls `revokeGmailToken`).
  - [x] 6.5 Else: render the consent ceremony — heading, the "what is *not* read" list first, then "what we read" / "what it enables", then a primary `Connect Gmail` button (Client Component that calls `startGmailOauth`).
  - [x] 6.6 Read query params (`?connected=1`, `?denied=1`, `?error=no_refresh_token`) and surface a transient banner. The page is a Server Component so use `searchParams` — don't add a separate Client Component for the banner.
  - [x] 6.7 Vitest component tests: free → `ProGatePattern`; pro+no-token → consent UI; pro+token → connected UI.
- [x] **Task 7: Disconnect flow (AC8)**
  - [x] 7.1 Update `revokeGmailAccess` in `src/lib/account/service.ts`: before the DB delete, look up the row to read `accessToken`, then call `https://oauth2.googleapis.com/revoke` (best-effort, swallow errors), then delete. **Do not** call `del()` from `@vercel/blob` here — different domain.
  - [x] 7.2 Update the existing `revokeGmailToken` Server Action in `src/app/(dashboard)/settings/actions.ts` to call `unstable_update({ gmailConnected: false })` after the service call.
  - [x] 7.3 New `DisconnectGmailButton` Client Component at `src/components/settings/DisconnectGmailButton.tsx` that wraps `revokeGmailToken` with `useActionState` + a confirm step. **Re-use the existing `Button` component from `src/components/ui/button.tsx`** — do not roll a custom button. UX spec lists "Revoke Gmail" as a destructive action (line 1004), so use `variant="destructive"`. Do not add it to `AccountDangerZone` (which is the *legacy* link still surfaced on `/settings`); the new dedicated `/settings/gmail` page is the canonical location going forward. Leave `AccountDangerZone`'s revoke button intact for now (out of scope to remove; tracked as a follow-up if desired).
  - [x] 7.4 Vitest test: disconnect → `gmailToken` row deleted, `gmailConnected` flipped, `JobListing` and `Application` row counts unchanged before/after.
- [x] **Task 8: Sidebar prompt (AC10)** at `src/components/health/GmailConnectPrompt.tsx` (Server) + `src/components/health/GmailConnectPromptClient.tsx` (Client wrapper for dismissal)
  - [x] 8.1 Server Component does the gating query: `subscriptionTier === 'PRO'` AND no `gmailToken` AND `prisma.jobListing.count({ where: { userId, deletedAt: null } }) >= 3`. Returns `null` if gate fails.
  - [x] 8.2 Otherwise renders the Client Component, which reads `localStorage["followcv:gmail-prompt-dismissed-v1"]` (`"1"` = dismissed). On dismiss, write the flag and unmount. Use `useEffect` for the read so SSR matches CSR initial render (or render with `data-hydrated` flag).
  - [x] 8.3 Insert into `src/app/(dashboard)/layout.tsx` directly under the `<HealthScoreWidget />` Suspense boundary, behind its own `Suspense fallback={null}`.
  - [x] 8.4 Vitest tests: free user → null; pro + 2 listings → null; pro + 3 listings + token → null; pro + 3 listings + no token + not dismissed → renders; dismissed → does not render.
- [x] **Task 9: JWT plumbing for `gmailConnected` (AC5, AC8)**
  - [x] 9.1 In `src/lib/auth/callbacks.ts` `jwtCallback`: when `trigger === "update"` and the session payload includes `gmailConnected`, write it onto the token. (Currently the callback only writes `gmailConnected` on the initial `user` branch, so `unstable_update` calls have no effect.)
  - [x] 9.2 Re-export `unstable_update` from `src/lib/auth/index.ts` if not already exported (check the `NextAuth(...)` destructure — beta31 returns `{ handlers, auth, signIn, signOut, unstable_update }`).
  - [x] 9.3 Update `src/lib/auth/callbacks.test.ts` to cover the new `trigger === "update"` branch.
  - [x] 9.4 Acknowledge in dev-notes that `gmailConnected` in the JWT is **only** a UI hint — every server-side gate (the sidebar prompt query, the settings page) re-reads from DB. (Same lesson as the deferred Stripe `subscriptionTier` foot-gun in `_bmad-output/implementation-artifacts/deferred-work.md`.)
- [x] **Task 10: Env var validation**
  - [x] 10.1 Add `getGmailEncryptionKey()` to the new `gmail-token-service.ts` that reads `GMAIL_TOKEN_ENCRYPTION_KEY`, validates it is exactly 64 hex chars (32 bytes), and throws a clear error otherwise. Lazy validation on first use (consistent with `getStripe()` pattern) — do not move to `instrumentation.ts` for this story (one of the deferred items in `deferred-work.md` proposes startup-time validation across all secret-bearing modules; defer to that follow-up).
  - [x] 10.2 Confirm `.env.example` already has the `GMAIL_TOKEN_ENCRYPTION_KEY` block (it does, line 23). No edit needed.
- [x] **Task 11: Suite-wide regression and documentation**
  - [x] 11.1 `npm run lint`, `npm run test:run`, `npm run build` all green.
  - [x] 11.2 Update `followcv/project-context.md` with a new "Gmail OAuth" section documenting: custom OAuth flow (not Auth.js), refresh-token-only encryption, the JWT-flag-is-UI-hint convention, the dedicated `/settings/gmail` page.
  - [x] 11.3 Confirm no new `npm` dependency is added — the entire flow runs on Node `crypto`, native `fetch`, and existing `next-auth`. (`googleapis` is **not** required for 6.1; defer adding it until 6.2 needs the Gmail message-list API.)

## Dev Notes

### What is already in place — DO NOT rebuild

- **`GmailToken` Prisma model** — `userId @unique`, all required columns. Schema is final for this story.
- **`revokeGmailAccess(userId)`** — `src/lib/account/service.ts` lines 51–66. Story 6.1 *augments* this (adds Google revocation HTTP call) rather than replaces it.
- **`revokeGmailToken` Server Action** — `src/app/(dashboard)/settings/actions.ts` lines 54–60. Story 6.1 augments with `unstable_update`.
- **`gmailConnected` in JWT/Session types** — `src/types/next-auth.d.ts` already declares it. Currently `jwtCallback` hardcodes `false` on initial sign-in (line 35 of `src/lib/auth/callbacks.ts`); Story 6.1 wires the `trigger === "update"` branch.
- **`AccountDangerZone`'s Revoke button** — `src/components/settings/AccountDangerZone.tsx`. Already gated on `gmailConnected`. Leave intact; the new `/settings/gmail` page is the canonical home but the Settings shortcut is fine to keep.
- **`ProGatePattern`** — `src/components/shared/ProGatePattern.tsx`. Use as-is.
- **`AuditSource.GMAIL_SIGNAL`** — already in `prisma/schema.prisma`. Story 6.2 will write to it; Story 6.1 does not.
- **`HealthScoreWidget`** — `src/components/health/HealthScoreWidget.tsx`. The new `GmailConnectPrompt` slots in directly underneath in the dashboard layout.

### Auth.js v5 is *not* used for the Gmail OAuth dance

The existing app uses Auth.js v5 with the Google provider for **login** (scopes: `openid email profile`). Gmail-readonly is requested separately via a **custom** OAuth 2.0 authorization-code flow (architecture line 47: "separate Gmail OAuth scope for email access"). Reasons:

- Auth.js v5 with the JWT strategy does not have first-class incremental authorization / account-linking support.
- The `GmailToken` table is a deliberate audit boundary separate from the Auth.js `Account` table (architecture lines 168–173).
- Custom-flow code is ~40 lines and uses only Node stdlib + native `fetch`. No new dependency required.

The same `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` Google Cloud OAuth client is reused — just register **two** authorized redirect URIs in the Google Cloud Console: the existing Auth.js callback `/api/auth/callback/google` and the new `/api/oauth/gmail`.

### Encryption pattern — refresh token only

Architecture lines 170–171 specify only the **refresh token** must be AES-256-GCM encrypted at rest. The access token is short-lived (~15 min) and re-fetched from the refresh token on demand by the Story 6.2 background job, so it stays plaintext for simplicity. Single-blob format: `base64(12-byte IV || ciphertext || 16-byte authTag)`. Implementation lives in `src/lib/services/gmail-token-service.ts`.

### `gmailConnected` JWT flag is a UI hint, not a gate

Story 5.2 left a deferred-work item (`_bmad-output/implementation-artifacts/deferred-work.md` → "JWT-cached `subscriptionTier` is a latent foot-gun") that applies word-for-word here. **Treat the JWT `gmailConnected` flag as cosmetic.** Every server-side decision that depends on whether Gmail is connected (the sidebar prompt server query, the `/settings/gmail` page render, Story 6.2's pg-boss job target list) must read directly from the DB. Tests must not stub the DB by setting `session.user.gmailConnected = true`.

### Project-context constraints (already loaded as persistent facts)

- **No Neon HTTP transactions / no `*Many` writes.** The OAuth callback's `setGmailToken` uses `findFirst → update | create` (single-row upsert pattern), not `prisma.gmailToken.upsert(...)`. The `findFirst → delete` pattern in the existing `revokeGmailAccess` is already correct.
- **Cache invalidation: `router.refresh()` not `revalidateTag`.** The Disconnect Client Component calls `router.refresh()` after the Server Action returns; the settings page is a Server Component re-rendering on refresh.
- **Server Action contract: never throw, return `{ data, error }`.** The new `startGmailOauth` Server Action follows this — error path returns `{ data: null, error: "..." }`, success path `redirect()`s (which intentionally throws `NEXT_REDIRECT` — a framework signal, not an unhandled error).

### Out of scope — defer to Story 6.2

- Fetching Gmail messages, signal processing, vitality state transitions from email signals.
- The pg-boss `gmail/ingest-signals` job, the cron entry in `vercel.json`, access-token refresh on expiry.
- The "we matched 3 emails to your applications" preview shown in the UX spec's Journey 4 (depends on the message-fetch path, which only ships in 6.2). Story 6.1 surfaces the connected confirmation only.
- DLQ-on-revoked-token handling — that's a 6.2 concern (the job runs and discovers the revocation; this story only writes the token).

### Files this story creates or modifies

**New:**
- `src/lib/services/gmail-token-service.ts` (+ `.test.ts`)
- `src/actions/connect-gmail.ts` (+ `.test.ts`)
- `src/app/api/oauth/gmail/route.ts` (+ `.test.ts`)
- `src/app/(dashboard)/settings/gmail/page.tsx` (+ `.test.tsx`)
- `src/components/settings/DisconnectGmailButton.tsx`
- `src/components/health/GmailConnectPrompt.tsx`
- `src/components/health/GmailConnectPromptClient.tsx` (+ `.test.tsx`)

**Modified:**
- `src/lib/auth/callbacks.ts` — handle `trigger === "update"` (Task 9.1)
- `src/lib/auth/index.ts` — re-export `unstable_update` if missing (Task 9.2)
- `src/lib/account/service.ts` — best-effort Google revocation call before DB delete (Task 7.1)
- `src/app/(dashboard)/settings/actions.ts` — `unstable_update` after revoke (Task 7.2)
- `src/app/(dashboard)/layout.tsx` — slot `GmailConnectPrompt` under `HealthScoreWidget` (Task 8.3)
- `src/lib/auth/callbacks.test.ts` — cover update branch (Task 9.3)
- `followcv/project-context.md` — new "Gmail OAuth" section (Task 11.2)

**Not modified:**
- `prisma/schema.prisma` — no schema change.
- `package.json` — no new dependency.
- `vercel.json` — Story 6.2 only.

### Testing standards

- Vitest co-located `*.test.ts(x)`; mock Prisma via the existing test setup; mock `fetch` for Google API calls; mock `redirect()` and `cookies()` from `next/navigation`/`next/headers`.
- New tests must keep total suite green and not slow CI meaningfully.
- No Playwright E2E in this story — the OAuth round-trip needs a real Google account; manual smoke against a Google Cloud test client is the right verification path (mirrors Stripe's "stripe trigger" approach in Story 5.2).
- Coverage targets: every branch in `gmail-token-service.ts`, every redirect path in the callback Route Handler, every render branch in `/settings/gmail/page.tsx`.

### References

- Epic + AC source: [`_bmad-output/planning-artifacts/epics.md` § Story 6.1](../planning-artifacts/epics.md)
- Architecture — Gmail token storage: [`_bmad-output/planning-artifacts/architecture.md` lines 168–173](../planning-artifacts/architecture.md)
- Architecture — Auth.js v5 / dual OAuth: [`_bmad-output/planning-artifacts/architecture.md` lines 47, 53–54, 162–166](../planning-artifacts/architecture.md)
- UX — Journey 4 (consent ceremony, dismissal soft-landing, dedicated page): [`_bmad-output/planning-artifacts/ux-design-specification.md` lines 707–740](../planning-artifacts/ux-design-specification.md)
- UX — `ProGatePattern` variants: [`_bmad-output/planning-artifacts/ux-design-specification.md` lines 960–968](../planning-artifacts/ux-design-specification.md)
- UX — Button hierarchy and "Revoke Gmail" as a destructive action: [`_bmad-output/planning-artifacts/ux-design-specification.md` lines 999–1008](../planning-artifacts/ux-design-specification.md)
- Project context (loaded as persistent facts): [`followcv/project-context.md`](../../followcv/project-context.md)
- Previous story / pattern reference (lazy env validation, webhook signature handling, DB-only entitlement reads): [`_bmad-output/implementation-artifacts/5-2-pro-subscription-via-stripe.md`](./5-2-pro-subscription-via-stripe.md)
- Carry-over insight: [`_bmad-output/implementation-artifacts/deferred-work.md` § "JWT-cached `subscriptionTier` is a latent foot-gun"](./deferred-work.md)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Initial vitest run for crypto module: 14/14 pass on first try.
- `connect-gmail.test.ts` initial failure: top-level `vi.mock` factories captured a closure variable (`redirectFn`) — vitest hoisting reordered them above the declaration. Resolved by inlining the factory and grabbing the mocked `redirect` via `import` after `vi.mock`.
- `GmailConnectPromptClient` lint error: `react-hooks/set-state-in-effect` flagged the `useEffect`-then-`setHydrated` pattern. Refactored to `useSyncExternalStore` with a no-op `subscribe`, real `getSnapshot`, and `false` server snapshot — same SSR/hydration semantics, no cascading render.
- jsdom 26 ships a stricter `localStorage` stub that throws on `getItem`/`setItem`/`clear` unless storage paths are configured; replaced with a 25-line in-memory shim installed via `Object.defineProperty(window, "localStorage", ...)` in the test's `beforeEach`.
- Build initially failed because the `"use server"` directive in `connect-gmail.ts` forbids non-function exports (the `GMAIL_OAUTH_STATE_COOKIE` constant). Resolved by moving the constant to a plain module at `src/lib/gmail/oauth-state.ts` and importing it from both the action and the route handler.

### Completion Notes List

- All 11 tasks and every subtask completed and checked.
- 55 new tests added (gmail-token-service: 14, connect-gmail action: 3, OAuth callback route: 11, account service revoke: 3 added, JWT update branch: 4 added, GmailConnectPrompt server: 6, GmailConnectPromptClient: 3, /settings/gmail page: 11). Total suite: **347 tests, 29 files, all passing.**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- **No new npm dependency.** Implementation uses native `fetch` + Node `crypto` + existing `next-auth`. `googleapis` is intentionally deferred to Story 6.2 when the Gmail message-list API is needed.
- **No schema migration.** The existing `GmailToken` model already had every column required by the encryption + connected-email flow.
- `getAppUrl` extracted to a generic `src/lib/app-url.ts` and re-exported from `src/lib/stripe/client.ts` so existing test mocks (`vi.mock("@/lib/stripe/client", ...)`) keep working.
- The `gmailConnected` JWT flag is wired but is a UI hint only. Every server-side gate (`/settings/gmail` page render, `GmailConnectPrompt` server query) reads from the DB, mirroring Story 5.2's lesson about JWT-cached entitlements going stale.
- `revokeGmailAccess` now performs a best-effort POST to `https://oauth2.googleapis.com/revoke` before deleting the row, so the user's Google "Apps with access" page reflects the disconnect.
- The sidebar prompt is gated server-side (`Pro + ≥3 imports + no token`) and client-dismissed via `localStorage["followcv:gmail-prompt-dismissed-v1"]`. SSR-safe via `useSyncExternalStore`.
- **Out of scope (Story 6.2):** actual Gmail message reads, the pg-boss `gmail/ingest-signals` job, vitality-state transitions on email signal, the "we matched 3 emails" preview shown in UX Journey 4. The token store is ready for 6.2 to consume (`getGmailToken(userId)` returns a decrypted refresh token).
- **Manual verification path:** to smoke-test end-to-end against a real Google account, register `https://<dev-or-staging-host>/api/oauth/gmail` as an authorized redirect URI on the existing OAuth client, set `GMAIL_TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`), then click `Connect Gmail` from `/settings/gmail` as a Pro user. Same approach as Stripe Story 5.2's `stripe trigger` smoke-test.

### File List

**New:**
- followcv/src/lib/services/gmail-token-service.ts
- followcv/src/lib/services/gmail-token-service.test.ts
- followcv/src/lib/gmail/oauth-state.ts
- followcv/src/lib/app-url.ts
- followcv/src/actions/connect-gmail.ts
- followcv/src/actions/connect-gmail.test.ts
- followcv/src/app/api/oauth/gmail/route.ts
- followcv/src/app/api/oauth/gmail/route.test.ts
- followcv/src/app/(dashboard)/settings/gmail/page.tsx
- followcv/src/app/(dashboard)/settings/gmail/page.test.tsx
- followcv/src/components/settings/ConnectGmailButton.tsx
- followcv/src/components/settings/DisconnectGmailButton.tsx
- followcv/src/components/health/GmailConnectPrompt.tsx
- followcv/src/components/health/GmailConnectPromptClient.tsx
- followcv/src/components/health/GmailConnectPrompt.test.tsx

**Modified:**
- followcv/src/lib/auth/callbacks.ts (added `trigger === "update"` branch)
- followcv/src/lib/auth/callbacks.test.ts (4 new tests for the update branch)
- followcv/src/lib/auth/index.ts (re-exports `unstable_update`)
- followcv/src/lib/account/service.ts (`revokeGmailAccess` now calls Google revoke endpoint best-effort)
- followcv/src/lib/account/service.test.ts (3 new revoke tests)
- followcv/src/app/(dashboard)/settings/actions.ts (`revokeGmailToken` now flips JWT flag via `unstable_update`)
- followcv/src/app/(dashboard)/layout.tsx (slots `GmailConnectPrompt` under `HealthScoreWidget`)
- followcv/src/lib/stripe/client.ts (re-exports `getAppUrl` from `@/lib/app-url`)
- followcv/project-context.md (new "Gmail OAuth", encryption, JWT-flag, and `/settings/gmail` sections)

**Not modified:**
- followcv/prisma/schema.prisma (no schema change required)
- followcv/package.json (no new dependency)
- followcv/vercel.json (Story 6.2 cron entry only)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story drafted via bmad-create-story | claude-opus-4-7 |
| 2026-05-08 | Story implemented; suite 347 tests, lint + build green; ready for code-review | claude-opus-4-7 |
