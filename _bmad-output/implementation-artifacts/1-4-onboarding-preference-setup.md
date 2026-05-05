# Story 1.4: Onboarding Preference Setup

Status: review

## Story

As a **new user**,
I want to complete a preference setup form after my first sign-in,
So that the product understands my job search context and can coach me accurately from day one.

## Acceptance Criteria

1. Given a user has just authenticated for the first time (no `PreferenceProfile` exists), when they land on `/board`, they are redirected to `/onboarding` and shown the onboarding preference form
2. The form captures: job function, seniority level, preferred locations (multi-select), work style (remote/hybrid/onsite), and target salary range
3. Submitting the form creates a `PreferenceProfile` record linked to the user
4. The form is keyboard-navigable (Tab between fields, Enter to submit, Escape to dismiss any dropdowns)
5. After submission the user lands on `/board` with a populated `PreferenceProfile`
6. Users who already have a `PreferenceProfile` skip `/onboarding` and land directly on `/board`

## Tasks / Subtasks

- [x] Task 1: Create preference service layer (AC: 3, 5, 6)
  - [x] Create `src/lib/preferences/service.ts` with `getPreferenceProfile` and `createPreferenceProfile`
  - [x] Create `src/lib/preferences/service.test.ts` with unit tests

- [x] Task 2: Update route protection for `/onboarding` (AC: 1, 4, 6)
  - [x] Add `/onboarding` to protected dashboard routes in `src/lib/auth/callbacks.ts`
  - [x] Add tests for `/onboarding` protection in `src/lib/auth/callbacks.test.ts`

- [x] Task 3: Create onboarding server action (AC: 3, 5)
  - [x] Create `src/app/(dashboard)/onboarding/actions.ts` with `savePreferences` server action

- [x] Task 4: Create PreferenceForm client component (AC: 2, 4)
  - [x] Create `src/components/onboarding/PreferenceForm.tsx` with all form fields and keyboard navigation
  - [x] Location tag input: Enter/comma to add, Backspace to remove last, keyboard-accessible

- [x] Task 5: Create onboarding page (AC: 1, 6)
  - [x] Create `src/app/(dashboard)/onboarding/page.tsx` — redirect to `/board` if profile exists, else render form

- [x] Task 6: Gate board page on PreferenceProfile (AC: 1, 6)
  - [x] Update `src/app/(dashboard)/board/page.tsx` to redirect to `/onboarding` if no `PreferenceProfile`

- [x] Task 7: Run validations
  - [x] `npx tsc --noEmit` — no TypeScript errors
  - [x] `npm run lint` — no ESLint errors
  - [x] `npm run test:run` — 22/22 tests pass (5 service + 17 auth)
  - [x] `npm run build` — production build succeeds

## Dev Notes

### Prerequisites

Stories 1.1, 1.2, and 1.3 must be complete. This story builds on the Prisma schema (1.2) and Auth.js session (1.3).

### Next.js 16 Breaking Change: `proxy.ts`

Middleware is `src/proxy.ts`, not `src/middleware.ts`. Auth.js authorized callback handles route protection.

### Route Protection Strategy

The `authorizedCallback` in `src/lib/auth/callbacks.ts` currently protects `/board` and `/settings`.
Add `/onboarding` to this list so unauthenticated users are redirected to `/login`.

The board→onboarding gate lives in the board Server Component (not in the auth callback), because the auth callback cannot query the DB. The board page calls `getPreferenceProfile(userId)` and redirects to `/onboarding` if null.

The onboarding page similarly checks if a profile already exists and redirects to `/board` if so (idempotent).

### PreferenceProfile Schema

```prisma
model PreferenceProfile {
  id                 String   @id @default(cuid())
  userId             String   @unique
  jobFunction        String?
  seniorityLevel     String?
  preferredLocations String[] @default([])
  workStyle          String?
  targetSalaryMin    Int?
  targetSalaryMax    Int?
  salaryCurrency     String?  @default("USD")
  ...
}
```

All fields are optional — the user can skip any field and submit.

### React 19 useActionState

Use `useActionState` from `react` (React 19, not react-dom). Signature:

```tsx
const [state, formAction, isPending] = useActionState(savePreferences, null)
```

Server action signature with `useActionState`:

```ts
export async function savePreferences(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState>
```

### Location Tag Input (Multi-select)

No external package needed. Implement as a controlled Client Component:
- Tags stored in local state array
- Hidden `<input name="preferredLocations" value={loc} />` per tag for FormData
- Enter or comma key adds current input as new tag
- Backspace on empty input removes last tag
- Escape clears input
- Tags rendered as removable chips with × button

Server action uses `formData.getAll("preferredLocations")` to retrieve the array.

### Prisma Import Path

```typescript
import { prisma } from "@/lib/db"
import type { PreferenceProfile } from "@/generated/prisma/client"
```

### Seniority Level Options

`Junior | Mid-Level | Senior | Staff | Principal | Director | VP | C-Suite`

### Work Style Options

`Remote | Hybrid | Onsite`

### Currency Options

`USD | EUR | GBP | CAD | AUD`

### Source References

- PreferenceProfile schema: `prisma/schema.prisma`
- Auth callbacks: `src/lib/auth/callbacks.ts`
- DB client: `src/lib/db/index.ts`
- Next.js forms guide: `node_modules/next/dist/docs/01-app/02-guides/forms.md`
- Story 1.3 pattern for service layer and test mocking

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No significant debugging needed. Implementation was straightforward following Story 1.3 patterns.

### Completion Notes List

- `src/lib/preferences/service.ts` — `getPreferenceProfile(userId)` and `createPreferenceProfile(userId, data)` wrapping Prisma calls; all fields optional matching schema.
- `src/lib/preferences/service.test.ts` — 5 unit tests covering findUnique (found/null) and create (full data, minimal, null salary).
- `src/lib/auth/callbacks.ts` — added `/onboarding` to the `isDashboard` route guard alongside `/board` and `/settings`.
- `src/lib/auth/callbacks.test.ts` — added 2 tests for `/onboarding` route protection (now 17 total).
- `src/app/(dashboard)/onboarding/actions.ts` — `savePreferences` server action: verifies session, extracts all fields from FormData (`getAll` for locations array), calls `createPreferenceProfile`, then redirects to `/board`.
- `src/components/onboarding/PreferenceForm.tsx` — Client Component using React 19 `useActionState`. Fields: job function (text), seniority (select), preferred locations (tag input), work style (radio group), salary range (min/max + currency). Location tag input: Enter/comma adds tag, Backspace on empty removes last, Escape clears input; hidden inputs carry tag values to FormData.
- `src/app/(dashboard)/onboarding/page.tsx` — Server Component: checks session (redirect /login if missing), checks existing profile (redirect /board if present), renders PreferenceForm.
- `src/app/(dashboard)/board/page.tsx` — added profile gate: checks session and `getPreferenceProfile`, redirects to `/onboarding` if no profile exists.
- All validations: `tsc --noEmit` ✓, `eslint` ✓, `vitest run` 22/22 ✓, `next build` ✓ (route `/onboarding` appears as `ƒ Dynamic`).

### File List

- `followcv/src/lib/preferences/service.ts` — new (preference service layer)
- `followcv/src/lib/preferences/service.test.ts` — new (5 unit tests)
- `followcv/src/lib/auth/callbacks.ts` — updated (added /onboarding to route guard)
- `followcv/src/lib/auth/callbacks.test.ts` — updated (2 new tests, 17 total)
- `followcv/src/app/(dashboard)/onboarding/actions.ts` — new (savePreferences server action)
- `followcv/src/app/(dashboard)/onboarding/page.tsx` — new (onboarding page with profile gate)
- `followcv/src/components/onboarding/PreferenceForm.tsx` — new (client form with tag input)
- `followcv/src/app/(dashboard)/board/page.tsx` — updated (added PreferenceProfile gate)

### Change Log

- 2026-05-05: Story 1.4 implemented — onboarding preference setup with React 19 useActionState, tag-based location multi-input, full keyboard navigation, board/onboarding redirect gates. 22 tests pass; TypeScript, ESLint, and build all clean.
