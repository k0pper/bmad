# Story 1.5: Account Settings & Profile Management

Status: review

## Story

As a **user**,
I want to view and edit my preference profile and manage my account,
So that I can keep my job search context current and control my data.

## Acceptance Criteria

1. Given a user navigates to `/settings`, when the page loads, their current `PreferenceProfile` fields are displayed in an editable form
2. Saving changes updates the `PreferenceProfile` record and shows an inline success confirmation
3. A "Delete account" action is available that requires explicit confirmation ("Type DELETE to confirm")
4. Confirming deletion immediately and permanently deletes the `User` and all associated records (cascade), then redirects to the marketing page (`/`)
5. A "Revoke Gmail access" button is present (disabled if Gmail is not connected); clicking it deletes the `GmailToken` record without affecting any job or application data
6. All settings form interactions are keyboard-navigable

## Tasks / Subtasks

- [x] Task 1: Extend preference service and add account service (AC: 1, 2, 4, 5)
  - [x] Add `updatePreferenceProfile` to `src/lib/preferences/service.ts`
  - [x] Add tests for `updatePreferenceProfile` in `src/lib/preferences/service.test.ts`
  - [x] Create `src/lib/account/service.ts` with `deleteAccount` and `revokeGmailAccess`
  - [x] Create `src/lib/account/service.test.ts`

- [x] Task 2: Create settings server actions (AC: 2, 4, 5)
  - [x] Create `src/app/(dashboard)/settings/actions.ts` with `updateSettings`, `deleteUserAccount`, `revokeGmailToken`

- [x] Task 3: Create SettingsForm client component (AC: 1, 2, 6)
  - [x] Create `src/components/settings/SettingsForm.tsx` — pre-filled from profile, inline success message

- [x] Task 4: Create AccountDangerZone client component (AC: 3, 4, 5, 6)
  - [x] Create `src/components/settings/AccountDangerZone.tsx` — delete confirmation + revoke Gmail

- [x] Task 5: Create settings page (AC: 1)
  - [x] Create `src/app/(dashboard)/settings/page.tsx` — server component fetching profile and session

- [x] Task 6: Run validations
  - [x] `npx tsc --noEmit` — no TypeScript errors
  - [x] `npm run lint` — no ESLint errors
  - [x] `npm run test:run` — 26/26 tests pass
  - [x] `npm run build` — production build succeeds (/settings route appears as ƒ Dynamic)

## Dev Notes

### Prerequisites

Stories 1.2, 1.3, and 1.4 must be complete.

### Prisma NeonHttp: No Upsert

Avoid `prisma.*.upsert()` — Neon HTTP adapter does not support implicit transactions. Use `findUnique` + `update` or `create` separately (established pattern from Story 1.3).

### updatePreferenceProfile

Use `findUnique` + conditional `update`/`create` to be safe if profile doesn't exist:
```typescript
const existing = await prisma.preferenceProfile.findUnique({ where: { userId }, select: { id: true } })
if (existing) return prisma.preferenceProfile.update({ where: { userId }, data })
return prisma.preferenceProfile.create({ data: { userId, ...data } })
```

### deleteAccount

`prisma.user.delete({ where: { id: userId } })` — cascade in schema handles all related records (PreferenceProfile, JobListings, Applications, CvVersions, GmailToken, etc.).

After deletion, call `signOut({ redirectTo: "/" })` from Auth.js to clear session cookie.

### revokeGmailAccess

`prisma.gmailToken.delete({ where: { userId } })` — does NOT affect JobListings, Applications, or any other data.

### Action States

`updateSettings` returns `{ type: 'success' | 'error'; message: string } | null` for `useActionState`.

`revokeGmailToken` returns `{ type: 'success' | 'error'; message: string } | null`.

`deleteUserAccount` always redirects on success; returns `{ type: 'error'; message: string }` on failure.

### Delete Confirmation Pattern

- Text input controlled by local client state
- Submit button disabled until `value === "DELETE"`
- On submit, server action deletes user and calls `signOut({ redirectTo: "/" })`

### Revoke Gmail Button State

The `gmailConnected` value comes from the JWT session. Pass it from the server component as a prop to `AccountDangerZone`. After a successful revoke, the `revokeState.type === 'success'` disables the button client-side without needing a page reload.

### SettingsForm Pre-population

Page server component fetches `PreferenceProfile`, passes it as props to `SettingsForm`. Locations array initialises `useState` on mount.

### Source References

- `src/lib/preferences/service.ts` — existing service pattern
- `src/components/onboarding/PreferenceForm.tsx` — field layout + location tag input pattern
- `src/lib/auth/index.ts` — `signOut` import

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **Lint warnings on unused params**: `deleteUserAccount` and `revokeGmailToken` don't need `prevState` or `formData`. Dropping those parameters entirely is valid — TypeScript allows functions with fewer args than the signature requires, and the `useActionState` binding still works.

### Completion Notes List

- `src/lib/preferences/service.ts` — added `updatePreferenceProfile`: `findUnique` check then `update` or `create` (avoids Neon HTTP upsert limitation).
- `src/lib/preferences/service.test.ts` — 7 tests total (2 new for updatePreferenceProfile: updates existing, creates when absent).
- `src/lib/account/service.ts` — `deleteAccount` (prisma.user.delete, cascade handles all relations) and `revokeGmailAccess` (prisma.gmailToken.delete, no effect on other data).
- `src/lib/account/service.test.ts` — 2 unit tests.
- `src/app/(dashboard)/settings/actions.ts` — `updateSettings` returns `{ type: 'success'|'error' }` state; `deleteUserAccount` deletes user then calls `signOut({ redirectTo: "/" })`; `revokeGmailToken` deletes GmailToken and returns success state.
- `src/components/settings/SettingsForm.tsx` — Client Component using `useActionState`, pre-populated with existing `PreferenceProfile` data via `defaultValue`. Same location tag-input pattern as onboarding. Shows `role="status"` success banner or `role="alert"` error.
- `src/components/settings/AccountDangerZone.tsx` — Client Component with two separate forms. Revoke Gmail: disabled when `!gmailConnected || already revoked`. Delete account: controlled input gated on `value === "DELETE"`, destructive button style.
- `src/app/(dashboard)/settings/page.tsx` — Server Component: fetches session + profile, passes both to child components.
- All validations: `tsc --noEmit` ✓, `eslint` ✓ (0 errors), `vitest run` 26/26 ✓, `next build` ✓.

### File List

- `followcv/src/lib/preferences/service.ts` — updated (added updatePreferenceProfile, extracted shared PreferenceData type)
- `followcv/src/lib/preferences/service.test.ts` — updated (7 tests, 2 new)
- `followcv/src/lib/account/service.ts` — new
- `followcv/src/lib/account/service.test.ts` — new (2 tests)
- `followcv/src/app/(dashboard)/settings/actions.ts` — new (3 server actions)
- `followcv/src/app/(dashboard)/settings/page.tsx` — new
- `followcv/src/components/settings/SettingsForm.tsx` — new
- `followcv/src/components/settings/AccountDangerZone.tsx` — new

### Change Log

- 2026-05-05: Story 1.5 implemented — /settings page with editable preference form (inline success), delete account (type DELETE to confirm, cascade delete + signOut), and revoke Gmail button (disabled when not connected). 26 tests pass; TypeScript, ESLint, and build all clean.
