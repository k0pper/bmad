# Story 3.4: Application Status Management & Notes

Status: in-progress

## Story

As a **user**,
I want to update my application status and add notes to listings and applications,
So that I can track the full history of each opportunity in one place.

## Acceptance Criteria (from epics.md)

1. Status selector on the listing detail view offering: Applied, Interviewing, Offer Received, Rejected, Withdrawn, On Hold, Ghosted.
2. Selecting a status calls a Server Action and updates the `Application` record. **Project-context override:** the binding rule for this codebase is `router.refresh()`, not `revalidateTag` — so the action does a single-row update and the calling client refreshes.
3. Notes editable inline on both `JobListing` and `Application`. **Save on blur**, no Save button.
4. Keyboard navigable end-to-end.

## Implementation Notes

### Server actions

Three new actions, all single-row writes (Neon HTTP rule), all returning the `ActionResult<T>` contract:

- `updateApplicationStatus({ listingId, status }) → { vitalityState }` — finds the user's Application via `JobListing.userId` scope, updates the status, then recomputes vitality (status drives Rules 2/6/7 of the state machine: `REJECTED`/`WITHDRAWN` → `CLOSED`, `APPLIED >14d` → `GHOSTING`, etc.). Persists the new vitality if changed; updates `lastComputedAt`/`stateChangedAt` accordingly.
- `updateApplicationNotes({ listingId, notes })` — finds the user's Application by listingId, updates `notes`. No vitality recompute (notes don't drive the machine).
- `updateListingNotes({ listingId, notes })` — finds the listing by id+userId, updates `notes`. A focused alternative to `updateListing` (which requires the full formdata) so the inline-on-blur field doesn't have to round-trip every field.

### UI components

- `ApplicationStatusSelect` — wraps `ui/Dropdown` (value+onSelect API). Optimistic update via local state; reverts on error.
- `InlineNotesField` — a `<textarea>` with `onBlur` save. Tracks dirty state, shows a subtle "saved" indicator after a successful write. Reused for listing notes and application notes (the action prop differentiates them).

### Files

- `followcv/src/actions/manage-application.ts` — NEW (3 actions)
- `followcv/src/actions/manage-application.test.ts` — NEW
- `followcv/src/components/application/ApplicationStatusSelect.tsx` — NEW
- `followcv/src/components/application/InlineNotesField.tsx` — NEW
- `followcv/src/app/(dashboard)/board/[listingId]/page.tsx` — UPDATE (wire status select + notes fields)
