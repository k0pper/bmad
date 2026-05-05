# Story 2.1: URL Import with JSON-LD Extraction

Status: done

## Story

As a **user**,
I want to import a job listing by pasting its URL,
so that all listing fields populate automatically without manual typing.

## Acceptance Criteria

1. A user on the board can open the ImportDrawer and paste a URL; the scrape fires immediately on paste (no submit button needed)
2. The `scraper-service` fetches the page server-side and extracts fields from `@type: JobPosting` JSON-LD: title, company, location, salary range (min/max), posting date
3. The company domain is extracted from the URL hostname and stored on `JobListing.companyDomain`
4. A `ScrapeLog` record is created capturing: URL, status (SUCCESS/PARTIAL/FAILED), fieldsExtracted array, duration in ms, userId
5. The import completes within 5 seconds; a user-facing error is shown if the scrape exceeds that window
6. The new listing appears on the board with `vitalityState` computed at creation time by `vitality-state-machine.ts`; `lastComputedAt` is set to `now` so no staleness banner appears immediately
7. Auto-imported listings are visually marked with an `URL_IMPORT` indicator on the board row (distinct from `MANUAL`)
8. A duplicate URL already tracked by this user is detected before saving; the drawer shows a resolution choice: "View existing listing" or "Import as new"
9. The board page lists all non-archived listings (replacing the "Coming in Story 2" placeholder); an `EmptyBoardState` is shown when no listings exist

## Tasks / Subtasks

- [x] Task 1: Install new dependencies (AC: all)
  - [x] Add `zod`, `react-hook-form`, `@hookform/resolvers` to package.json via npm

- [x] Task 2: Implement vitality state machine service (AC: 6)
  - [x] Create `src/lib/services/vitality-state-machine.ts` — pure `computeVitalityState(inputs)` + DB writer `applyVitalityState(listingId, prisma)`
  - [x] Create `src/lib/services/vitality-state-machine.test.ts` — test all 11 rules, side-effects (stateChangedAt, lastComputedAt, AuditLog written on change, NOT written on no-change)

- [x] Task 3: Implement entitlement service (AC: none directly, but required pre-create guard)
  - [x] Create `src/lib/services/entitlement-service.ts` — `checkListingCap(userId): Promise<{ allowed: boolean; count: number; cap: number }>`
  - [x] Create `src/lib/services/entitlement-service.test.ts`

- [x] Task 4: Implement scraper service (AC: 2, 3, 4, 5)
  - [x] Create `src/lib/services/scraper-service.ts` — `scrapeJobListing(url, userId)` with 5s timeout, JSON-LD extraction, ScrapeLog creation
  - [x] Create `src/lib/services/scraper-service.test.ts`

- [x] Task 5: Create Zod listing schema (AC: 1)
  - [x] Create `src/lib/schemas/listing.ts` — `urlImportSchema` for URL validation

- [x] Task 6: Create import-listing server action (AC: 1, 3, 6, 7, 8)
  - [x] Create `src/actions/import-listing.ts` — auth check → entitlement check → duplicate check → scrape → compute state → create JobListing → revalidateTag → return `ActionResult`
  - [x] Create `src/actions/import-listing.test.ts`

- [x] Task 7: Create VitalityBadge component (AC: 6, 7)
  - [x] Create `src/components/vitality/VitalityBadge.tsx` — 8-state pill badge using design tokens from globals.css; Lucide icons; keyboard/screen-reader accessible

- [x] Task 8: Create EmptyBoardState component (AC: 9)
  - [x] Create `src/components/board/EmptyBoardState.tsx` — placeholder rows (aria-hidden) + "Add your first listing" CTA

- [x] Task 9: Create BoardRow component (AC: 6, 7)
  - [x] Create `src/components/board/BoardRow.tsx` — `[favicon placeholder] [title · company · location] [VitalityBadge] [date]`; import-source indicator (URL vs MANUAL dot); hover actions (…menu stub)

- [x] Task 10: Create ImportDrawer component (AC: 1, 5, 8)
  - [x] Create `src/components/board/ImportDrawer.tsx` — right-side Drawer.Root from @base-ui/react; URL input auto-focused; paste → fires scrape action; loading / populated / partial / failed / duplicate states

- [x] Task 11: Update board page (AC: 6, 9)
  - [x] Update `src/app/(dashboard)/board/page.tsx` — fetch listings with `unstable_cache` tagged `board-{userId}`; render `EmptyBoardState` or list of `BoardRow`; include `ImportDrawer`; "Add listing" button in header

- [x] Task 12: Run validations
  - [x] `npx tsc --noEmit` — no TypeScript errors
  - [x] `npm run lint` — no ESLint errors
  - [x] `npm run test:run` — all tests pass (76/76)
  - [x] `npm run build` — production build succeeds

## Dev Notes

### New Dependencies to Install

```bash
npm install zod react-hook-form @hookform/resolvers
```

- `zod` — URL validation schema, shared client/server
- `react-hook-form` + `@hookform/resolvers/zod` — ImportDrawer form
- Architecture requires all three; none are currently installed

### Server Actions Location — Architecture Correction

Previous stories (1.3–1.5) placed Server Actions in `src/app/(dashboard)/*/actions.ts`. The architecture spec says:
> `src/actions/` — All Server Actions, one file per domain

Starting with Epic 2, follow the architecture. **The import action lives at `src/actions/import-listing.ts`**, not in the app directory. This will be the pattern for all Epic 2+ actions.

### ActionResult<T> Return Shape — Required by Architecture

All Server Actions MUST return this shape (not `{ type, message }`):
```typescript
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }
```
The import action needs a richer data type to express the duplicate case:
```typescript
type ImportData =
  | { status: 'created'; listing: { id: string; title: string; company: string; vitalityState: VitalityState } }
  | { status: 'duplicate'; existingId: string; title: string; company: string }
  | { status: 'cap_reached'; count: number; cap: number }

// Return: ActionResult<ImportData>
```

### Vitality State Machine — Full Rule Table (implement exactly)

Source: `_bmad-output/planning-artifacts/vitality-state-machine-spec.md`

```typescript
type VitalityInputs = {
  postedAt: Date | null
  closingDate: Date | null
  application: { appliedAt: Date; status: ApplicationStatus } | null
  gmailSignalAt: Date | null  // latest GMAIL_SIGNAL AuditLog for this listing
  overrideState: VitalityState | null
  overrideSource: OverrideSource | null
  isArchived: boolean
  now: Date
}
```

Priority order (first match wins):
1. `isArchived` → **skip** (do not update state)
2. `application.status` in `[Rejected, Withdrawn]` → `CLOSED`
3. `overrideSource === USER` → `overrideState` (preserve, no further eval)
4. `closingDate` non-null AND `closingDate - now ≤ 48h` AND `closingDate > now` → `DEADLINE`
5. `application` non-null AND `gmailSignalAt > application.appliedAt` → `IN_DIALOGUE`
6. `application` non-null AND `now - application.appliedAt > 14 days` AND `status === Applied` → `GHOSTING`
7. `application` non-null AND `status` in `[Applied, Interviewing, On Hold]` → `ACTIVE`
8. `postedAt` non-null AND `now - postedAt ≤ 7 days` → `HOT`
9. `postedAt` non-null AND `8 ≤ now - postedAt ≤ 21 days` → `COOLING`
10. `postedAt` non-null AND `now - postedAt > 21 days` → `COLD`
11. `postedAt` null → `COOLING` (conservative fallback)

**Side effects when state CHANGES:**
- Set `vitalityState`, `stateChangedAt = now`, `lastComputedAt = now`
- Write `AuditLog { source: SYSTEM_RECOMPUTE, listingId, previousState, newState, computedAt: now }`

**Side effects when state does NOT change:**
- Set `lastComputedAt = now` only (no AuditLog)

**CRITICAL:** Only `vitality-state-machine.ts` may write to `vitalityState`. Import action calls it — never writes directly.

### Scraper Service Implementation

**No new HTML-parsing library needed.** Use native `fetch` + regex to extract JSON-LD:

```typescript
// Fetch with 5s AbortController timeout
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 5000)
const response = await fetch(url, { signal: controller.signal })
clearTimeout(timeoutId)

// Extract script tags
const html = await response.text()
const scriptMatches = html.match(
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
) ?? []

// Parse and find @type: JobPosting
for (const scriptTag of scriptMatches) {
  const jsonContent = scriptTag.replace(/<script[^>]*>|<\/script>/gi, '').trim()
  const parsed = JSON.parse(jsonContent)
  // Check for @type: JobPosting (may be nested in @graph array)
}
```

**JSON-LD field mapping:**
```
title          ← parsed.title
company        ← parsed.hiringOrganization?.name
location       ← parsed.jobLocation?.address?.addressLocality
                 or parsed.jobLocation?.[0]?.address?.addressLocality
salaryMin      ← parsed.baseSalary?.value?.minValue (number)
salaryMax      ← parsed.baseSalary?.value?.maxValue (number)
salaryCurrency ← parsed.baseSalary?.currency
postedAt       ← new Date(parsed.datePosted) — only if valid
closingDate    ← new Date(parsed.validThrough) — only if valid
```

**Domain extraction:**
```typescript
function extractCompanyDomain(urlString: string): string | null {
  try {
    const { hostname } = new URL(urlString)
    const parts = hostname.split('.')
    return parts.length >= 2 ? parts.slice(-2).join('.') : hostname
  } catch { return null }
}
```

**ScrapeLog creation** — do this INSIDE `scraper-service.ts` (not in the action):
```typescript
await prisma.scrapeLog.create({
  data: {
    userId,
    url,
    status: fieldsExtracted.length > 0 ? (allFieldsFilled ? 'SUCCESS' : 'PARTIAL') : 'FAILED',
    fieldsExtracted,
    duration,
    errorMessage: error?.message ?? null,
  }
})
```

**Scrape result return shape:**
```typescript
type ScrapeResult = {
  title?: string; company?: string; location?: string
  salaryMin?: number; salaryMax?: number; salaryCurrency?: string
  postedAt?: Date; closingDate?: Date; companyDomain?: string
}
type ScraperOutput =
  | { data: ScrapeResult; partial: boolean; error: null }
  | { data: Partial<ScrapeResult>; partial: true; error: string } // partial on fetch error
  | { data: null; partial: false; error: string }                 // full failure
```

**Timeout handling:** If the fetch throws `AbortError`, return `{ data: null, error: 'Import timed out — the page took too long to respond' }`.

### Entitlement Service

Default cap: 25 (FREE tier). Read from `AppConfig` key `'listing_cap_free'`; fall back to `25` if not found.

```typescript
export async function checkListingCap(userId: string): Promise<{ allowed: boolean; count: number; cap: number }> {
  const [count, configRow] = await Promise.all([
    prisma.jobListing.count({ where: { userId, archived: false, deletedAt: null } }),
    prisma.appConfig.findUnique({ where: { key: 'listing_cap_free' } }),
  ])
  const cap = configRow ? parseInt(configRow.value, 10) : 25
  return { allowed: count < cap, count, cap }
}
```

### Import Action Full Flow

File: `src/actions/import-listing.ts`

```
1. auth() → if !session return { data: null, error: 'Unauthorized' }
2. Zod validate URL from formData
3. checkListingCap(userId) → if !allowed return { data: { status: 'cap_reached', count, cap }, error: null }
4. Duplicate check: prisma.jobListing.findFirst({ where: { userId, sourceUrl: url, deletedAt: null } })
   → if found return { data: { status: 'duplicate', existingId, title, company }, error: null }
5. scrapeJobListing(url, userId)  ← handles ScrapeLog internally
6. computeVitalityState(inputs)
7. applyVitalityState() — creates JobListing and calls state machine to set initial state
8. revalidateTag(`board-${userId}`)
9. return { data: { status: 'created', listing: { id, title, company, vitalityState } }, error: null }
```

**Note on JobListing creation:** Create the record first (with a placeholder `vitalityState: COOLING`), then immediately call the state machine's `applyVitalityState` which will overwrite it and set `lastComputedAt`. This avoids needing to pass the full listing to `computeVitalityState` before it has an ID.

Alternative approach (preferred — cleaner): compute state BEFORE creating the record, then pass it to `prisma.jobListing.create`. The listing has no `Application` at creation time, so the computation doesn't need an ID:

```typescript
const vitalityState = computeVitalityState({
  postedAt: scraped.postedAt ?? null,
  closingDate: scraped.closingDate ?? null,
  application: null,
  gmailSignalAt: null,
  overrideState: null,
  overrideSource: null,
  isArchived: false,
  now: new Date(),
})

const listing = await prisma.jobListing.create({
  data: {
    userId,
    title: scraped.title ?? url,
    company: scraped.company ?? 'Unknown',
    companyDomain: scraped.companyDomain ?? null,
    location: scraped.location ?? null,
    salaryMin: scraped.salaryMin ?? null,
    salaryMax: scraped.salaryMax ?? null,
    salaryCurrency: scraped.salaryCurrency ?? 'USD',
    sourceUrl: url,
    importSource: 'URL_IMPORT',
    vitalityState,
    lastComputedAt: new Date(),
  }
})
// Write AuditLog for the initial state
await prisma.auditLog.create({
  data: { source: 'SYSTEM_RECOMPUTE', userId, listingId: listing.id, newState: vitalityState, computedAt: new Date() }
})
```

This avoids calling the state machine's DB-writing path for creation — it's simpler since creation is always a "new state, no previous state".

### Board Page — Cached Query

File: `src/app/(dashboard)/board/page.tsx`

```typescript
import { unstable_cache } from 'next/cache'

function getBoardListings(userId: string) {
  return unstable_cache(
    () =>
      prisma.jobListing.findMany({
        where: { userId, archived: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    [`board-${userId}`],
    { tags: [`board-${userId}`] }
  )()
}
```

The `revalidateTag(`board-${userId}`)` call in the import action invalidates this cache on next request.

### VitalityBadge Component

Use CSS custom properties already defined in `globals.css`:

| State | Background var | Text var | Icon (lucide-react) |
|---|---|---|---|
| HOT | `--color-vitality-hot-bg` | `--color-vitality-hot-text` | `Flame` |
| DEADLINE | `--color-vitality-deadline-bg` | `--color-vitality-deadline-text` | `Clock` |
| ACTIVE | `--color-vitality-active-bg` | `--color-vitality-active-text` | `CircleCheck` |
| IN_DIALOGUE | `--color-vitality-dialogue-bg` | `--color-vitality-dialogue-text` | `MessageCircle` |
| COOLING | `--color-vitality-cooling-bg` | `--color-vitality-cooling-text` | `Thermometer` |
| COLD | `--color-vitality-cold-bg` | `--color-vitality-cold-text` | `Snowflake` |
| GHOSTING | `--color-vitality-ghosting-bg` | `--color-vitality-ghosting-text` | `Ghost` |
| CLOSED | `--color-vitality-closed-bg` | `--color-vitality-closed-text` | `XCircle` |

Labels: `Hot`, `Deadline`, `Active`, `In Dialogue`, `Cooling`, `Cold`, `Ghosting`, `Closed`

Accessibility: `aria-label="[State] — [brief context]"`. Icon is `aria-hidden="true"`.

```tsx
// Pill shape: rounded-full px-2.5 py-0.5 text-xs font-medium inline-flex items-center gap-1
```

### ImportDrawer Component

Use `Drawer.Root` from `@base-ui/react` (already installed, confirmed exports `Drawer`):

```tsx
import { Drawer } from '@base-ui/react'

<Drawer.Root open={open} onOpenChange={setOpen}>
  <Drawer.Portal>
    <Drawer.Backdrop className="fixed inset-0 bg-black/20 z-40" />
    <Drawer.Popup
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background shadow-xl md:w-96 xl:w-[480px]"
    >
      {/* Content */}
    </Drawer.Popup>
  </Drawer.Portal>
</Drawer.Root>
```

**States and rendering:**
- `idle` — URL input (auto-focused via `initialFocus` prop or `autoFocus` on input), placeholder "Paste a job URL"
- `loading` — spinner + "Fetching listing details…", URL input disabled
- `populated` — all fields shown as read-only with edit-on-click; "Add to board" primary button
- `partial` — filled fields shown, empty fields show "Add manually" with input; first empty field auto-focused
- `failed` — empty form, URL pre-filled in notes field, message "We couldn't read this page — fill in what you know"; title + company required
- `duplicate` — shows message with existing listing link + two buttons: "View existing listing" | "Import as new"

**Paste detection:** Use `onPaste` event on URL input to immediately call the scrape action.

**Note on scrape-on-paste architecture:**
The `importFromUrl` server action is called on paste via `useTransition`. Since it's a server action (not a form submission), call it directly:
```tsx
const [isPending, startTransition] = useTransition()

function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
  const pastedUrl = e.clipboardData.getData('text')
  setUrl(pastedUrl)
  startTransition(async () => {
    const result = await importFromUrl(pastedUrl)
    // handle result
  })
}
```

**Duplicate resolution:**
- "View existing listing" → `router.push(`/board#listing-${existingId}`)` (closes drawer)
- "Import as new" → calls a separate `importFromUrlForced(url)` action that skips the duplicate check

### BoardRow Component

Server Component that renders one listing row:

```
h-14 border-b flex items-center px-4 gap-3
[favicon div 24px] [flex-1 min-w-0 — title truncate, company text-sm] [location text-sm hidden md:block] [VitalityBadge] [date text-xs] [importSource dot]
```

Import source indicator: a small dot `w-2 h-2 rounded-full` — `bg-brand` for `URL_IMPORT`, `bg-text-tertiary` for `MANUAL`. Add `title="Auto-imported from URL"` for accessibility.

### EmptyBoardState Component

Three greyed-out placeholder rows (`aria-hidden="true"`) + dominant CTA:

```tsx
<div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
  {/* Placeholder rows */}
  <div aria-hidden="true" className="w-full max-w-2xl space-y-px opacity-30">
    {[1,2,3].map(i => (
      <div key={i} className="h-14 border rounded-md bg-muted animate-pulse" />
    ))}
  </div>
  {/* CTA */}
  <div className="text-center space-y-2">
    <p className="text-sm text-text-secondary">Paste a job URL — takes about 5 seconds</p>
    <Button onClick={onAddListing} size="lg">Add your first listing</Button>
  </div>
</div>
```

`onAddListing` is a prop from the board page that opens the ImportDrawer.

### Prisma Import Path

All services import Prisma from: `@/generated/prisma/client` (not `@prisma/client`).

### Neon HTTP — No Upsert / No Transactions

Established pattern: avoid `prisma.*.upsert()`. Use `findUnique` + conditional `create`/`update` as in previous stories.

For AuditLog creation alongside JobListing creation: these are separate `await` calls (not a transaction) since NeonHttp doesn't support transactions. Order: create JobListing first, then create AuditLog. Failure on AuditLog is non-critical — log to Sentry but don't fail the import.

### Testing Patterns

Follow existing patterns from `src/lib/preferences/service.test.ts` and `src/lib/auth/callbacks.test.ts`:
- Mock `@/lib/db` with `vi.mock`
- Access mocks via `vi.mocked(prisma.*.methodName)`
- Co-locate test files alongside source

For scraper service tests, mock `global.fetch`:
```typescript
vi.stubGlobal('fetch', vi.fn())
// then: vi.mocked(fetch).mockResolvedValue(new Response(html))
```

For import-listing action tests, mock:
- `@/lib/auth` → `auth` function
- `@/lib/services/entitlement-service` → `checkListingCap`
- `@/lib/services/scraper-service` → `scrapeJobListing`
- `@/lib/services/vitality-state-machine` → `computeVitalityState`
- `@/lib/db` → `prisma.jobListing.findFirst`, `prisma.jobListing.create`, `prisma.auditLog.create`
- `next/cache` → `revalidateTag`

### Files to Update

- `src/app/(dashboard)/board/page.tsx` — replace placeholder with real board
- `src/proxy.ts` — no changes needed (board is already protected)

### Architecture Compliance Notes

- ✅ Service layer: all business logic in `src/lib/services/`
- ✅ Server Actions: `src/actions/import-listing.ts` (correcting deviation from stories 1.x)
- ✅ `revalidateTag('board-${userId}')` called after successful import
- ✅ `ActionResult<T>` shape returned from Server Action
- ✅ VitalityState enum values used — never raw strings
- ✅ `vitality-state-machine.ts` is sole writer of `vitalityState`
- ✅ Auth check at top of every Server Action

### Previous Story Learnings

- Prisma `upsert` throws on Neon HTTP — use `findUnique` + `create`/`update`
- `deleteMany` preferred over `delete` for idempotent deletes (learned Story 1.5 bug fix)
- Server Action unused params: drop them rather than prefix with `_` to avoid lint warnings
- `useActionState` from `react` (React 19), not `react-dom`
- ESLint exit code 0 even with warnings — run `npm run lint` and check for 0 errors
- `src/proxy.ts` (not `src/middleware.ts`) — Next.js 16 convention, already established

### Source References

- Vitality state machine rules: `_bmad-output/planning-artifacts/vitality-state-machine-spec.md`
- UX import flow + board layout: `_bmad-output/planning-artifacts/ux-design-specification.md` (ImportDrawer, BoardRow, EmptyBoardState, VitalityBadge sections)
- Architecture patterns (ActionResult, service layer, revalidateTag, caching): `_bmad-output/planning-artifacts/architecture.md`
- Prisma schema (JobListing, ScrapeLog, AuditLog, AppConfig): `followcv/prisma/schema.prisma`
- CSS vitality tokens: `followcv/src/app/globals.css` — all 8 state bg/text vars already defined
- Base UI Drawer API: `@base-ui/react` exports `Drawer` with `Root`, `Popup`, `Backdrop`, `Portal`, `Trigger`, `Close` — `swipeDirection` prop supports `'right'`
- Lucide icons: `lucide-react@^1.14.0` already installed

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `revalidateTag` in Next.js 16 requires 2 args: `revalidateTag(tag, profile)` — used `{}` as profile (empty CacheLifeConfig)
- Zod `ZodError.issues` (not `.errors`) is the correct property for Zod v3 safeParse result
- Test mock for `auth` needs explicit `as unknown as` cast — auth exports as NextMiddleware type in Next.js 16
- `ALL_FIELDS` for SUCCESS detection includes `closingDate`; test data for "full extraction" must include `validThrough`

### Completion Notes List

- Task 1: Installed zod, react-hook-form, @hookform/resolvers
- Task 2: `computeVitalityState` implements all 11 priority rules; returns `null` for archived listings; 26 tests covering every rule boundary
- Task 3: `checkListingCap` reads AppConfig `listing_cap_free` with fallback 25; 5 tests
- Task 4: Scraper uses native fetch + AbortController (5s), regex JSON-LD extraction, handles @graph array; creates ScrapeLog with SUCCESS/PARTIAL/FAILED; 10 tests
- Task 5: Zod `urlImportSchema` validates URL format
- Task 6: `importFromUrl` — 8-step flow (auth→cap→dup→scrape→vitality→create→audit→revalidate); `importFromUrlForced` skips duplicate check; 8 tests
- Task 7: `VitalityBadge` — 8-state pill using CSS vars, Lucide icons, aria-label
- Task 8: `EmptyBoardState` — 3 placeholder rows (aria-hidden) + CTA button
- Task 9: `BoardRow` — favicon placeholder, title/company/location, VitalityBadge, date, URL/MANUAL source dot
- Task 10: `ImportDrawer` — base-ui Drawer.Root, paste-to-scrape via useTransition, idle/loading/failed/duplicate states, duplicate resolution
- Task 11: Board page uses `unstable_cache` tagged `board-{userId}`, `BoardClient` wraps interactive parts
- Task 12: tsc clean, lint clean, 76/76 tests pass, build succeeds

### File List

- `package.json` (updated — new deps)
- `package-lock.json` (updated)
- `src/lib/services/vitality-state-machine.ts` (new)
- `src/lib/services/vitality-state-machine.test.ts` (new)
- `src/lib/services/entitlement-service.ts` (new)
- `src/lib/services/entitlement-service.test.ts` (new)
- `src/lib/services/scraper-service.ts` (new)
- `src/lib/services/scraper-service.test.ts` (new)
- `src/lib/schemas/listing.ts` (new)
- `src/actions/import-listing.ts` (new)
- `src/actions/import-listing.test.ts` (new)
- `src/components/vitality/VitalityBadge.tsx` (new)
- `src/components/board/EmptyBoardState.tsx` (new)
- `src/components/board/BoardRow.tsx` (new)
- `src/components/board/ImportDrawer.tsx` (new)
- `src/components/board/BoardClient.tsx` (new)
- `src/app/(dashboard)/board/page.tsx` (updated)

## Change Log

- Story 2.1 implemented — URL import with JSON-LD extraction, vitality state machine, board page with real listings (Date: 2026-05-05)
