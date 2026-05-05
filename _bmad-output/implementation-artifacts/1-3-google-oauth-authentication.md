# Story 1.3: Google OAuth Authentication

Status: done

## Story

As a **user**,
I want to sign in with my Google account,
so that I can access FollowCV without creating a separate password.

## Acceptance Criteria

1. A user on the login page can click "Sign in with Google" and be redirected through Google OAuth, landing on the dashboard after successful authentication
2. A `User` record is created in the database on first sign-in with `email`, `name`, and `subscriptionTier: FREE`
3. A JWT session cookie is set (HTTP-only, signed, 30-day sliding expiry)
4. The session JWT contains `userId`, `email`, `subscriptionTier`, and `gmailConnected: false`
5. `src/proxy.ts` redirects unauthenticated requests to `/login` for all `(dashboard)` routes
6. Explicit logout invalidates the session immediately and redirects to `/login`
7. After 24 hours of idle time the session expires and the user is redirected to `/login`
8. The admin role is enforced via a `role` field on `User`; users with `role: ADMIN` can access `/admin` routes; standard users receive 403

## Tasks / Subtasks

- [x] Task 1: Install Auth.js v5 dependency (AC: 1, 3)
  - [x] Install `next-auth@beta` package
  - [x] Verify package.json updated correctly

- [x] Task 2: Create Auth.js v5 configuration (AC: 2, 3, 4, 7)
  - [x] Create `src/lib/auth/index.ts` with Google provider, JWT strategy, 30-day maxAge
  - [x] Implement `jwt` callback: upsert User in DB on first sign-in, store userId/subscriptionTier/role/gmailConnected/lastActivity
  - [x] Implement `session` callback: expose custom fields to session type
  - [x] Implement `authorized` callback: 24h idle check, dashboard route protection, admin 403
  - [x] Create `src/lib/auth/constants.ts` with IDLE_TIMEOUT_MS constant
  - [x] Create `src/lib/auth/callbacks.ts` with testable extracted callback functions
  - [x] Create `src/types/next-auth.d.ts` for TypeScript session/JWT augmentation

- [x] Task 3: Create Auth.js route handler (AC: 1, 6)
  - [x] Create `src/app/api/auth/[...nextauth]/route.ts` exporting GET and POST from handlers

- [x] Task 4: Create proxy.ts for route protection (AC: 5, 7, 8)
  - [x] Create `src/proxy.ts` exporting `auth as proxy`
  - [x] Add matcher config to exclude static/API routes

- [x] Task 5: Create login page (AC: 1)
  - [x] Create `src/app/(auth)/login/page.tsx` with "Sign in with Google" button
  - [x] Sign-in uses Server Action calling `signIn("google", { redirectTo: "/board" })`

- [x] Task 6: Create UserMenu component and update dashboard layout (AC: 6)
  - [x] Create `src/components/shared/UserMenu.tsx` showing user name/email and logout button
  - [x] Update `src/app/(dashboard)/layout.tsx` to render UserMenu in user menu slot
  - [x] Update `src/app/page.tsx` to redirect authenticated users to `/board`, others to `/login`

- [x] Task 7: Write tests (AC: 2, 4, 5, 7, 8)
  - [x] `src/lib/auth/callbacks.test.ts` — 15 unit tests covering jwt/session/authorized callbacks

- [x] Task 8: Run validations
  - [x] `npx tsc --noEmit` — no TypeScript errors
  - [x] `npm run lint` — no ESLint errors
  - [x] `npm run test:run` — 15/15 tests pass
  - [x] `npm run build` — production build succeeds

## Dev Notes

### Prerequisites

Stories 1.1 and 1.2 must be complete. This story adds Auth.js v5 on top of the Next.js project (1.1) and Prisma schema (1.2).

### Next.js 16 Breaking Change: `proxy.ts` replaces `middleware.ts`

In Next.js 16.2.4, the `middleware` file convention is **deprecated**. The file must be named `src/proxy.ts` and export a function named `proxy` (or a default export). The story spec references `src/middleware.ts` — this must be created as `src/proxy.ts` instead to comply with Next.js 16.

Reference: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`

### Auth.js v5 Package

Install `next-auth@beta` — Auth.js v5 is currently under the `beta` tag:

```bash
npm install next-auth@beta
```

Installed version: `^5.0.0-beta.31`

### Auth.js v5 Configuration Pattern

```typescript
// src/lib/auth/index.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({ ... })
```

### JWT Token Shape

The JWT must contain:
- `userId` — from our Prisma `User.id`
- `email` — from Google profile
- `subscriptionTier` — from `User.subscriptionTier`
- `gmailConnected` — `false` initially (true when GmailToken exists, set in Story 6.1)
- `role` — from `User.role` (USER or ADMIN)
- `lastActivity` — Unix timestamp, updated on JWT re-issue (for 24h idle check)

### Session Expiry Strategy

Two ACs must both be satisfied:
- AC3: Cookie has 30-day sliding expiry → `session.maxAge = 30 * 24 * 60 * 60`
- AC7: Session expires after 24h idle → `lastActivity` stored in JWT, checked in `authorized` callback

Implementation: Set `maxAge = 30 * 24 * 60 * 60` and `updateAge = 0` (re-issue JWT on every authenticated request). The `jwt` callback always sets `lastActivity = Date.now()`. The `authorized` callback checks if `Date.now() - session.lastActivity > IDLE_TIMEOUT_MS`.

### Prisma User Upsert

In the `jwt` callback on first sign-in (`user` object is populated):
```typescript
const dbUser = await prisma.user.upsert({
  where: { email: user.email! },
  create: { email: user.email!, name: user.name ?? null },
  update: {},
})
```

No `@auth/prisma-adapter` needed — we use JWT strategy and handle User creation manually.

### Prisma Import Path

Import from: `@/generated/prisma/client` (Prisma 7 generates there, not `@prisma/client`)

### Admin Route Protection

The `authorized` callback returns `NextResponse.json({ error: 'Forbidden' }, { status: 403 })` for `/admin` routes accessed by non-admin users. Standard unauthenticated access to dashboard routes returns `false` (redirects to Auth.js signIn page, which is `/login`).

### Pages Config

Auth.js v5 pages config:
```typescript
pages: {
  signIn: '/login',
  error: '/login',
}
```

### Source References

- Auth.js v5 config: architecture.md — Authentication & Security
- Proxy pattern: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
- JWT token fields: architecture.md — Auth.js v5 JWT Session Strategy
- Domain service pattern: architecture.md — Service Layer Rule

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **Timing issue in jwtCallback test**: `existingToken.lastActivity` and `token.lastActivity` were the same reference (jwtCallback mutates and returns the same token object). Fixed by capturing `oldActivity = existingToken.lastActivity` before the callback call.
- **Next.js 16 proxy.ts**: Story spec referenced `src/middleware.ts` but Next.js 16 renamed this to `src/proxy.ts`. Used `proxy.ts` throughout.
- **Auth.js callback testability**: Extracted `jwtCallback`, `sessionCallback`, and `authorizedCallback` into `src/lib/auth/callbacks.ts` to enable unit testing without instantiating NextAuth.

### Completion Notes List

- `next-auth@^5.0.0-beta.31` installed; Auth.js v5 with Google provider, JWT strategy, 30-day maxAge, `updateAge: 0` (re-issue JWT every request for accurate idle tracking).
- `src/lib/auth/constants.ts` — `IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000` exported for shared use.
- `src/lib/auth/callbacks.ts` — `jwtCallback`, `sessionCallback`, `authorizedCallback` extracted as pure/injectable functions for testability.
- `src/lib/auth/index.ts` — `NextAuth` instance wiring the callbacks with live `prisma` upsert injection.
- `src/types/next-auth.d.ts` — TypeScript module augmentation: `Session` includes `lastActivity`, `user.id`, `user.role`, `user.subscriptionTier`, `user.gmailConnected`; `JWT` includes matching custom fields.
- `src/app/api/auth/[...nextauth]/route.ts` — re-exports `handlers.GET` and `handlers.POST` from Auth.js.
- `src/proxy.ts` — exports `auth as proxy` from Auth.js; matcher excludes `api/auth`, `_next/*`, `favicon.ico`, `fonts/`.
- `src/app/(auth)/login/page.tsx` — Server Component with "Sign in with Google" button (form + Server Action).
- `src/components/shared/UserMenu.tsx` — Server Component showing name/email and logout form action.
- `src/app/(dashboard)/layout.tsx` — `UserMenu` wired in user menu slot.
- `src/app/page.tsx` — redirects authenticated users to `/board`, others to `/login`.
- All validations: `tsc --noEmit` ✓, `eslint` ✓, `vitest run` 15/15 ✓, `next build` ✓.

### File List

- `followcv/package.json` — updated (added `next-auth@^5.0.0-beta.31`)
- `followcv/package-lock.json` — updated
- `followcv/src/types/next-auth.d.ts` — new (TypeScript session/JWT type augmentation)
- `followcv/src/lib/auth/constants.ts` — new (`IDLE_TIMEOUT_MS` constant)
- `followcv/src/lib/auth/callbacks.ts` — new (testable jwt/session/authorized callback functions)
- `followcv/src/lib/auth/callbacks.test.ts` — new (15 unit tests)
- `followcv/src/lib/auth/index.ts` — new (NextAuth instance with Google provider)
- `followcv/src/app/api/auth/[...nextauth]/route.ts` — new (Auth.js route handler)
- `followcv/src/proxy.ts` — new (route guard exporting auth as proxy)
- `followcv/src/app/(auth)/login/page.tsx` — new (login page with Google sign-in)
- `followcv/src/components/shared/UserMenu.tsx` — new (user menu with logout)
- `followcv/src/app/(dashboard)/layout.tsx` — updated (wired UserMenu)
- `followcv/src/app/page.tsx` — updated (redirects to /board or /login)

### Change Log

- 2026-05-05: Story 1.3 implemented — Auth.js v5 Google OAuth, JWT strategy with 30-day sliding expiry and 24h idle timeout, proxy route guard, login page, UserMenu. All 15 tests pass; TypeScript, ESLint, and build all clean.
