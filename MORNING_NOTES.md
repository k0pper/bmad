# Morning notes — autonomous overnight session

Started: 2026-05-08 (late evening). Working through remaining Epic 3+ stories on `main`. All commits are pushed.

## Stories shipped tonight

- **3.3 — Record Application with CV Snapshot** ✅ (+8 commits, 9 files, 14 tests; schema cascade migration + apply-to-job action + ApplyRitualDialog + Board wiring + account-deletion blob cleanup)
- **3.4 — Application Status Management & Notes** ✅ (+1 commit, 12 files, 19 tests; status selector, inline-on-blur notes for both listing and application, three new server actions)
- **3.5 — View Application CV Snapshot** ✅ (+1 commit, snapshot proxy route + UI link)
- **3.6 — Follow-up Due Detection** ✅ (+1 commit, pure detector with AppConfig threshold, Board pill)

Each story spec under `_bmad-output/implementation-artifacts/3-N-*.md` is now `Status: done`, with completion notes describing scope deltas and decisions made.

## External configuration you'll need to do

_(none from Epic 3 stories — all use existing Vercel Blob + DB infra)_

If you want to override the follow-up-due threshold (default 7 days), insert/update the AppConfig row:

```sql
INSERT INTO app_configs (id, key, value, "updatedAt")
VALUES (gen_random_uuid()::text, 'follow_up_threshold_days', '14', now())
ON CONFLICT (key) DO UPDATE SET value = excluded.value, "updatedAt" = now();
```

(Same admin-config pattern as `listing_cap_free` and `cv_version_cap_free`.)

## Decisions I made on your behalf

- **Story 3.3 supporting-doc upload — deferred.** Epic mentioned an "optional supporting document upload" in the dialog. No schema for it, no UX detail. Apply ritual works without it. Re-flag if you want it modelled.
- **Story 3.3 already-applied indicator click behaviour — no-op + tooltip.** The "Applied" pill on the BoardRow shows a `title=` tooltip on hover ("You've applied to this listing") and does nothing on click. Clicking the row itself still navigates to the detail page where the snapshot lives.
- **Story 3.4 listing-edit-form notes field — removed.** Notes are now edited inline (save-on-blur). Keeping a redundant textarea in the Edit accordion would let stale form snapshots clobber inline edits. `updateListing` no longer writes notes; `updateListingNotes` is the single path.
- **Story 3.4 cache invalidation — `router.refresh()`** (project-context override of the epic's `revalidateTag` wording, consistent with every other mutation in the codebase).
- **Story 3.5 missing-blob UX — 404 from the proxy.** Browser shows its default 404 in the new tab. Inline "Snapshot unavailable" on the listing page would require a `head()` round-trip on every page render — overkill for a rare edge case.
- **Story 3.6 detection — read-time, not background-job.** The follow-up flag is purely derived from `Application.updatedAt`/`status` and `JobListing.archived`. Computing it in the Board page Server Component costs one extra `appConfig.findUnique` per request and is always fresh. No new schema column, no recompute-job extension.

## Reviews / known concerns

- **Concurrent delete races on shared CvSnapshot blobs** — two unrelated open issues from Story 3.2's review remain in `_bmad-output/implementation-artifacts/deferred-work.md`. They need a future blob-reaper job; out of scope for these stories.
- **Story 3.3 architecture document still references Cloudflare R2 + `revalidateTag`** in places — by deliberate decision, that doc is treated as historical context and not updated per-story. The binding doc is `followcv/project-context.md`.

_(appended as I go through Epic 4 / Epic 5)_
