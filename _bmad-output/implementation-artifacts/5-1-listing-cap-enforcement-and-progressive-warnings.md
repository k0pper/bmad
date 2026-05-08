# Story 5.1: Listing Cap Enforcement & Progressive Warnings

Status: done

## Story

As a **user**, I want clear warnings as I approach my listing limit and a contextual upgrade prompt when I reach it, so I understand the free tier ceiling and can choose to upgrade at the right moment.

## Acceptance Criteria (from epics.md)

1. `entitlement-service.checkListingCap` reads `subscriptionTier` and cap from the DB.
2. The cap-blocking Server Action returns `{ allowed: false, reason }` without saving the listing.
3. AppConfig holds `listing_cap_free`, `cv_version_cap_free`, `follow_up_threshold_days` (the latter shipped in Story 3.6).
4. At 80% of cap → non-blocking banner; at 90% → urgent banner.
5. At cap, the ImportDrawer renders the `ProGatePattern` (headline + CTA) instead of the import form.
6. `ProGatePattern` is one reusable component used at every Pro feature surface.
7. Pro users bypass cap entirely (`{ allowed: true }`).

## Implementation

### `checkListingCap` upgrade

`src/lib/services/entitlement-service.ts`:
- Reads the user's `subscriptionTier` alongside the count + AppConfig in a single `Promise.all` (no extra round trip vs. before).
- For Pro users: short-circuits to `{ allowed: true, count, cap: null, isPro: true }` — `cap === null` is the "no cap applies" signal the UI uses to suppress the cap banner.
- For free users: same `{ allowed, count, cap }` shape as before, plus `isPro: false`.

The `cap` field type changed from `number` to `number | null`; call sites in `import-listing.ts` use the documented invariant (when `allowed === false`, `cap` is non-null) via a non-null assertion, since Pro users never reach the cap-reached branch.

### Reusable `ProGatePattern`

`src/components/shared/ProGatePattern.tsx` — props: `headline`, optional `description`, optional `ctaText` (default "Upgrade to Pro"), optional `ctaHref` (default `/settings/subscription`). One visual presentation (sparkles icon + brand-subtle background + brand CTA). Reused in:
- `ImportDrawer` cap-reached state.
- (Story 6.1 will reuse for Gmail-on-free, Story 5.2 for the subscription page.)

### Progressive warning banner

`src/components/board/ListingCapBanner.tsx` — Server Component, props `{ count, cap }`:
- `< 80%` of cap → renders nothing.
- `80% ≤ ratio < 90%` → neutral banner with brand-subtle background.
- `≥ 90%` → urgent amber banner using the existing vitality-deadline tokens (also used by Story 3.6's "Follow up" pill).
- `count ≥ cap` → renders nothing — the cap-reached UX belongs to the ImportDrawer's `ProGatePattern`, not a duplicate banner.

`/board` page imports `checkListingCap`, calls it once per request alongside the existing `Promise.all` block, and passes `{ count, cap }` to the banner only when the user is on the free tier and not viewing the archived board.

### ImportDrawer Pro gate

A new `cap_reached` drawer state replaces the old "string error message" treatment. When the action returns `cap_reached`, the drawer transitions to `{ status: "cap_reached", cap }` and the body renders the `ProGatePattern` instead of the URL/manual-form panes. The user can still close the drawer.

### Tests

- 1 new unit test for the Pro short-circuit + 4 existing tests updated for the `isPro` field.
- 16 existing `import-listing.test.ts` mock fixtures updated via `sed` to include `isPro: false` (no behavioural test changes).
- Suite at 281 tests, build clean.

### Files

- `followcv/src/lib/services/entitlement-service.ts` — modified
- `followcv/src/lib/services/entitlement-service.test.ts` — modified
- `followcv/src/actions/import-listing.ts` — modified (non-null assertion on `cap.cap`)
- `followcv/src/actions/import-listing.test.ts` — modified (mock fixtures)
- `followcv/src/components/shared/ProGatePattern.tsx` — created
- `followcv/src/components/board/ListingCapBanner.tsx` — created
- `followcv/src/components/board/ImportDrawer.tsx` — modified (`cap_reached` state, ProGatePattern render)
- `followcv/src/app/(dashboard)/board/page.tsx` — modified (loads listingCap, mounts banner)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story implemented and shipped to main | claude-opus-4-7 |
