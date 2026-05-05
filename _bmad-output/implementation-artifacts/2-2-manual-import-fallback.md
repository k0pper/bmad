# Story 2.2: Manual Import Fallback

Status: review

## Story

As a **user**,
I want to manually enter a job listing when URL extraction fails or is incomplete,
So that I can track any role regardless of the job board's technical setup.

## Acceptance Criteria

1. Given a URL import returns no structured data or a scraper error, when the ImportDrawer receives the failed result, a manual entry form appears inline (no navigation away), pre-filled with whatever was extractable (company name from URL domain, source URL preserved)
2. The form requires at minimum: job title and company name; all other fields (location, salary range, notes) are optional
3. Submitting the manual form creates a `JobListing` with `importSource: MANUAL`
4. Manually entered listings carry a distinct visual indicator on the board (the grey dot for MANUAL — already implemented in BoardRow; no new work needed here)
5. Users can also open the manual form directly without attempting a URL import (via an "Enter manually" link in the idle state)

## Tasks / Subtasks

- [x] Task 1: Add manual import Zod schema (AC: 2)
  - [x] Add `manualImportSchema` to `src/lib/schemas/listing.ts` — title (required), company (required), location (optional), salaryMin (optional), salaryMax (optional), sourceUrl (optional), notes (optional)
  - [x] Export `ManualImportInput` type

- [x] Task 2: Implement `manualImportListing` server action + tests (AC: 2, 3)
  - [x] Add `manualImportListing(formData: FormData)` to `src/actions/import-listing.ts` — auth check → cap check → Zod validate → compute vitality → create JobListing with `importSource: MANUAL` → non-critical AuditLog → return `ActionResult<ImportData>`
  - [x] Add tests for `manualImportListing` to `src/actions/import-listing.test.ts` — cover: unauthenticated, cap reached, missing required fields, successful creation

- [x] Task 3: Extend ImportDrawer with manual entry form (AC: 1, 5)
  - [x] Add `manual` state to `DrawerState` for direct manual entry (no URL)
  - [x] Extend `failed` state to carry `prefilledCompany?: string` and `prefilledUrl?: string`
  - [x] Add "Enter manually" link/button in the idle state (below the URL input)
  - [x] Render manual entry form (inline in drawer) for both `failed` and `manual` states — fields: title (required), company (required), location, salary min, salary max, source URL, notes
  - [x] In `failed` state, pre-fill company from URL hostname extraction (client-side) and pre-fill source URL
  - [x] Wire form submit to `manualImportListing` via `useTransition`; on success call `router.refresh()` and close drawer

- [x] Task 4: Run validations (AC: all)
  - [x] `npx tsc --noEmit` — no TypeScript errors
  - [x] `npm run lint` — no ESLint errors
  - [x] `npm run test:run` — all tests pass (83/83)
  - [x] `npm run build` — production build succeeds

## Dev Notes

### Architecture Compliance

Follow architecture exactly as in story 2.1:
- Server Action in `src/actions/import-listing.ts` (add to existing file — no new file)
- `ActionResult<T>` return shape — never throw
- Auth check at top of Server Action
- Call `checkListingCap` before creating any `JobListing` — required for every listing creation path
- **No `revalidateTag`** — `router.refresh()` in the drawer handles revalidation (confirmed fix from story 2.1)
- `vitality-state-machine.ts` sole writer of `vitalityState` — for manual imports, compute BEFORE create
- Prisma imported from `@/generated/prisma/client` (not `@prisma/client`)
- No transactions on Neon HTTP — separate `await` calls; AuditLog failure is non-critical

### Manual Import Schema

Add to `src/lib/schemas/listing.ts`:

```typescript
export const manualImportSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company name is required"),
  location: z.string().optional(),
  salaryMin: z.coerce.number().int().positive().optional().or(z.literal("")),
  salaryMax: z.coerce.number().int().positive().optional().or(z.literal("")),
  sourceUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
})

export type ManualImportInput = z.infer<typeof manualImportSchema>
```

### `manualImportListing` Server Action

Add to `src/actions/import-listing.ts` (same file — one file per domain):

```
1. const session = await auth()
   if (!session?.user?.id) return { data: null, error: 'Unauthorized' }
   const userId = session.user.id

2. const cap = await checkListingCap(userId)
   if (!cap.allowed) return { data: { status: 'cap_reached', count: cap.count, cap: cap.cap }, error: null }

3. const parsed = manualImportSchema.safeParse({
     title: formData.get('title'),
     company: formData.get('company'),
     location: formData.get('location') || undefined,
     salaryMin: formData.get('salaryMin') || undefined,
     salaryMax: formData.get('salaryMax') || undefined,
     sourceUrl: formData.get('sourceUrl') || undefined,
     notes: formData.get('notes') || undefined,
   })
   if (!parsed.success) return { data: null, error: parsed.error.issues?.[0]?.message ?? 'Invalid input' }

4. const now = new Date()
   const vitalityState = computeVitalityState({
     postedAt: null,
     closingDate: null,
     application: null,
     gmailSignalAt: null,
     overrideState: null,
     overrideSource: null,
     isArchived: false,
     now,
   }) ?? 'COOLING'

5. const listing = await prisma.jobListing.create({
     data: {
       userId,
       title: parsed.data.title,
       company: parsed.data.company,
       location: parsed.data.location ?? null,
       salaryMin: parsed.data.salaryMin ? Number(parsed.data.salaryMin) : null,
       salaryMax: parsed.data.salaryMax ? Number(parsed.data.salaryMax) : null,
       sourceUrl: parsed.data.sourceUrl || null,
       notes: parsed.data.notes ?? null,
       importSource: 'MANUAL',
       vitalityState,
       lastComputedAt: now,
     },
   })

6. try {
     await prisma.auditLog.create({
       data: { source: 'SYSTEM_RECOMPUTE', userId, listingId: listing.id, newState: vitalityState, computedAt: now }
     })
   } catch { /* non-critical */ }

7. return { data: { status: 'created', listing: { id: listing.id, title: listing.title, company: listing.company, vitalityState: listing.vitalityState } }, error: null }
```

**Note on salaryMin/salaryMax:** The Prisma schema uses `Int?` for salaryMin/salaryMax. Coerce the values to integer in the action using `Number(parsed.data.salaryMin)`. For `z.coerce.number().or(z.literal(""))`, empty string passes through as `""` which is then treated as undefined by the conditional.

### DrawerState Extension

```typescript
type DrawerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed"; url: string; prefilledCompany?: string }
  | { status: "manual" }
  | { status: "duplicate"; existingId: string; title: string; company: string }
```

The `manual` state is for direct manual entry (no prior URL attempt).
The `failed` state gains `prefilledCompany` extracted client-side from the failed URL.

### Client-Side Company Extraction (in ImportDrawer)

Extract a fallback company name from the URL hostname on the client:

```typescript
function companyFromUrl(url: string): string {
  try {
    const { hostname } = new URL(url)
    const stripped = hostname.replace(/^www\./, '')
    const name = stripped.split('.')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch { return '' }
}
```

Use this when transitioning to `failed` state:
```typescript
setState({ status: "failed", url: pastedUrl, prefilledCompany: companyFromUrl(pastedUrl) })
```

### ImportDrawer — Manual Form UI

Both `failed` and `manual` states render the same manual form. In `failed` state, the URL input is pre-filled with the failed URL and company is pre-filled with the domain-extracted name.

Structure (inline, within the drawer's scrollable area):

```tsx
// State for form fields
const [manualTitle, setManualTitle] = useState("")
const [manualCompany, setManualCompany] = useState("")
const [manualLocation, setManualLocation] = useState("")
const [manualSourceUrl, setManualSourceUrl] = useState("")
const [manualNotes, setManualNotes] = useState("")
const [manualSalaryMin, setManualSalaryMin] = useState("")
const [manualSalaryMax, setManualSalaryMax] = useState("")
const [manualError, setManualError] = useState<string | null>(null)
```

When entering `failed` state, pre-fill:
```typescript
setManualCompany(companyFromUrl(pastedUrl))
setManualSourceUrl(pastedUrl)
```

When entering `manual` state, fields start empty.

**Reset behavior:** Reset ALL manual form fields (and errors) in the `reset()` function.

Manual form submission:
```tsx
function handleManualSubmit(e: React.FormEvent) {
  e.preventDefault()
  setManualError(null)
  const fd = new FormData()
  fd.append("title", manualTitle)
  fd.append("company", manualCompany)
  if (manualLocation) fd.append("location", manualLocation)
  if (manualSalaryMin) fd.append("salaryMin", manualSalaryMin)
  if (manualSalaryMax) fd.append("salaryMax", manualSalaryMax)
  if (manualSourceUrl) fd.append("sourceUrl", manualSourceUrl)
  if (manualNotes) fd.append("notes", manualNotes)

  startTransition(async () => {
    const result = await manualImportListing(fd)
    if (!result.data) {
      setManualError(result.error)
      return
    }
    if (result.data.status === "cap_reached") {
      setManualError(`You've reached the ${result.data.cap} listing limit for the free tier.`)
      return
    }
    if (result.data.status === "created") {
      onOpenChange(false)
      reset()
      router.refresh()
    }
  })
}
```

**Idle state "Enter manually" trigger:**
```tsx
// Below the URL input
<button
  type="button"
  className="text-xs underline"
  style={{ color: "var(--color-text-secondary)" }}
  onClick={() => setState({ status: "manual" })}
>
  Enter manually
</button>
```

**Failed state back link:**
```tsx
<button type="button" className="text-xs underline" style={{ color: "var(--color-brand)" }}
  onClick={() => { setState({ status: "idle" }); setManualError(null) }}>
  Try a different URL
</button>
```

### Visual Distinction for Manual Listings

Already implemented in `BoardRow.tsx` from story 2.1:
- `URL_IMPORT` → brand-colored dot (indigo)
- `MANUAL` → grey/tertiary dot

No changes needed to `BoardRow.tsx`. The `importSource: 'MANUAL'` value in the created listing is sufficient.

### Testing Pattern for `manualImportListing`

Add to the existing `import-listing.test.ts`. The file already has all mocks set up. Add:

```typescript
import { importFromUrl, manualImportListing } from "./import-listing"

// Add to existing MockPrisma type if needed (prisma.jobListing.create already mocked)

describe("manualImportListing", () => {
  function makeManualFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData()
    fd.append("title", overrides.title ?? "Senior Engineer")
    fd.append("company", overrides.company ?? "Acme Corp")
    if (overrides.location) fd.append("location", overrides.location)
    if (overrides.sourceUrl) fd.append("sourceUrl", overrides.sourceUrl)
    return fd
  }

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await manualImportListing(makeManualFormData())
    expect(result).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns cap_reached when at listing limit", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: false, count: 25, cap: 25 })
    const result = await manualImportListing(makeManualFormData())
    expect(result.data).toEqual({ status: "cap_reached", count: 25, cap: 25 })
  })

  it("returns error when title is missing", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25 })
    const fd = new FormData()
    fd.append("company", "Acme Corp")
    const result = await manualImportListing(fd)
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it("returns error when company is missing", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25 })
    const fd = new FormData()
    fd.append("title", "Engineer")
    const result = await manualImportListing(fd)
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it("creates listing with MANUAL importSource on success", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25 })
    mockCompute.mockReturnValue("COOLING")
    mockPrisma.jobListing.create.mockResolvedValue({
      id: "manual-1",
      title: "Senior Engineer",
      company: "Acme Corp",
      vitalityState: "COOLING",
    })
    const result = await manualImportListing(makeManualFormData())
    expect(result.data).toEqual({
      status: "created",
      listing: { id: "manual-1", title: "Senior Engineer", company: "Acme Corp", vitalityState: "COOLING" },
    })
    expect(mockPrisma.jobListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ importSource: "MANUAL" }),
      })
    )
  })
})
```

### Previous Story Learnings (from 2.1)

- **No `revalidateTag`** — board uses `router.refresh()` instead; don't add `revalidateTag` to the new action
- Prisma imported from `@/generated/prisma/client`
- `auth` needs `as unknown as ReturnType<typeof vi.fn>` cast for mocking in tests
- Neon HTTP: no transactions — separate `await` calls; AuditLog failure is non-critical
- ESLint exit code 0 even with warnings — check output text for "0 errors"
- `useActionState` from `react` (React 19), not `react-dom`
- `computeVitalityState` returns `VitalityState | null` for archived — use `?? 'COOLING'` fallback

### Files to Create / Modify

| File | Change |
|---|---|
| `src/lib/schemas/listing.ts` | Add `manualImportSchema` and `ManualImportInput` |
| `src/actions/import-listing.ts` | Add `manualImportListing` server action |
| `src/actions/import-listing.test.ts` | Add `manualImportListing` test suite |
| `src/components/board/ImportDrawer.tsx` | Add `manual` state + manual entry form |

### Architecture Compliance Checklist

- ✅ Service layer: `checkListingCap` and `computeVitalityState` called from action, not inline
- ✅ Server Action in `src/actions/` (not in app directory)
- ✅ `ActionResult<T>` shape returned — never throw
- ✅ Auth check at top of Server Action
- ✅ `checkListingCap` called before every `JobListing` creation
- ✅ `importSource: MANUAL` set on manually created listings
- ✅ `vitalityState` computed via `computeVitalityState`, not set raw
- ✅ No `revalidateTag` — `router.refresh()` pattern from story 2.1

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `React.FormEvent` is deprecated in React 19; restructured `handleManualSubmit` to take no event param, with `onSubmit={(e) => { e.preventDefault(); handleManualSubmit() }}` inline in JSX

### Completion Notes List

- Task 1: Added `manualImportSchema` (title/company required, 5 optional fields) and `ManualImportInput` type to `listing.ts`
- Task 2: `manualImportListing` action — auth → cap → Zod validate → computeVitalityState → create MANUAL listing → non-critical AuditLog; 7 tests added (unauthenticated, cap reached, missing title, missing company, successful creation with MANUAL source, optional field passthrough, no revalidateTag); 83/83 tests total
- Task 3: `ImportDrawer` extended with `manual` + `failed` states both rendering the same inline form; `companyFromUrl()` helper extracts company name from URL hostname; "Enter manually" button in idle state; "Try a different URL" / "Back to URL import" contextual back link; pre-fills company + sourceUrl on scrape failure; `reset()` clears all manual form fields
- Task 4: tsc clean, lint clean, 83/83 tests pass, build succeeds

### File List

- `src/lib/schemas/listing.ts` (updated — added manualImportSchema, ManualImportInput)
- `src/actions/import-listing.ts` (updated — added manualImportListing)
- `src/actions/import-listing.test.ts` (updated — added manualImportListing test suite)
- `src/components/board/ImportDrawer.tsx` (updated — manual entry form, manual/failed states, companyFromUrl helper)

## Change Log

- Story 2.2 created — manual import fallback (Date: 2026-05-05)
- Story 2.2 implemented — manualImportListing action, manualImportSchema, ImportDrawer manual form with inline fallback and direct entry path (Date: 2026-05-05)
