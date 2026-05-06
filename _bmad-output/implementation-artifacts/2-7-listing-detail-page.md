# Story 2.7: Listing Detail Page

Status: done

## Story

As a **user**,
I want to open a dedicated detail view for any listing,
So that I can see all fields, notes, application history, and CV snapshot in one focused view.

## Acceptance Criteria

1. **Given** a user clicks a `BoardRow` on `/board`, **When** the listing detail page loads at `/board/[listingId]`, **Then** the "always visible" core info block shows: title, company, location, salary range (formatted as "$80k–$120k"), posting date, date added, source URL (clickable), and the `VitalityBadge`.
2. **And** below the core info, an accordion (`DetailAccordion`) holds all secondary sections so the view is never overwhelming; sections can be independently expanded or collapsed; the "Why this state?" section is open by default.
3. **And** the "Why this state?" accordion section uses `VitalityExplanation`: skipped rules are hidden entirely; only evaluated rules are shown — "passed" prerequisites rendered as a compact checklist above a visual connector, and the single decisive ("fired") rule rendered as a highlighted conclusion card alongside the `VitalityBadge`; the component lives in `src/components/listing/VitalityExplanation.tsx`.
4. **And** the "Notes" accordion section is shown only when `listing.notes` is non-null.
5. **And** the "Application" accordion section shows application status and applied date when an `Application` record exists; otherwise shows "No application recorded yet" with a future CTA placeholder.
6. **And** additional accordion sections for CV snapshot, timeline, and edit actions can be added in future stories without layout changes.
7. **And** a back link returns the user to `/board`.
8. **And** the page is accessible: all interactive elements reachable by keyboard, heading hierarchy correct, ARIA labels on action buttons.

## Tasks / Subtasks

- [x] Listing detail route at `/board/[listingId]`, owner-scoped Prisma query, 404 fallback (AC: 1, 7)
- [x] Core info block: title (h1), company · location, salary formatter, posting date, date added, source URL, VitalityBadge with override-lock indicator (AC: 1)
- [x] `DetailAccordion` (`@base-ui/react/accordion`) accepting a sections array; "Why this state?" open by default (AC: 2, 6)
- [x] `VitalityExplanation` component: filters out skipped rules, renders prerequisites as a tick-list, decisive rule as a highlighted conclusion card next to the `VitalityBadge` (AC: 3)
- [x] Conditional "Notes" section based on `listing.notes` truthiness (AC: 4)
- [x] "Application" section with present/empty branches and future-CTA placeholder (AC: 5)
- [x] "Edit" accordion section with `ListingEditForm` (added by Story 2.5) (AC: 6)
- [x] Back link to `/board` with brand-tinted hover (post-design-polish) (AC: 7)
- [x] Accessibility audit: h1 for title, accordion headings via Base UI, ARIA labels on archive/edit buttons (AC: 8)

## Dev Notes

### Implementation provenance

This story's surface area was built end-to-end as part of **Story 2.5 (Manual Vitality Override & Listing Management)**. The "Edit" accordion section, the archive button on the detail page, and the lock-icon treatment on overridden vitality badges all landed in 2.5; the core info block, `DetailAccordion`, `VitalityExplanation`, and the conditional Notes / Application sections landed in 2.4 and earlier.

This file exists as a **completion record** so the implementation artifacts directory is contiguous and AC traceability stays intact, not as a forward-looking implementation plan. No new code was written for this story.

### Files relevant to this story (already on main)

- `followcv/src/app/(dashboard)/board/[listingId]/page.tsx` — the route Server Component.
- `followcv/src/app/(dashboard)/board/[listingId]/loading.tsx` — skeleton placeholder (added by the design polish refactor).
- `followcv/src/components/listing/DetailAccordion.tsx` — accordion wrapper.
- `followcv/src/components/listing/VitalityExplanation.tsx` — Why-this-state component.
- `followcv/src/components/listing/ListingEditForm.tsx` — Edit accordion contents.
- `followcv/src/components/listing/ListingArchiveButton.tsx` — Archive / Unarchive button.
- `followcv/src/components/vitality/VitalityBadge.tsx` — badge with override-lock indicator.

### References

- Epic AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7]
- Story that delivered the work: [Source: _bmad-output/implementation-artifacts/2-5-manual-vitality-override-and-listing-management.md]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Completion Notes List

- All eight acceptance criteria were satisfied by code shipped in earlier stories (primarily 2.5, with `VitalityExplanation` and `DetailAccordion` in 2.4 / 2.5).
- No additional implementation work performed for Story 2.7.
- Validation snapshot at the time of marking done: `tsc --noEmit` clean, `eslint src` clean, `npm run test:run` 149/149 green.

### File List

(no new or modified files — see "Files relevant to this story" above)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-06 | Retroactive completion record — work absorbed into Story 2.5 | claude-opus-4-7 |
| 2026-05-06 | Reviewed by user; status → done | Alex |
