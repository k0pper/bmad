# Morning notes — autonomous overnight session

Started: 2026-05-08 (late evening). Working through remaining Epic 3+ stories on `main`. All commits are pushed.

## Stories shipped tonight

- **3.3 — Record Application with CV Snapshot** ✅ (+8 commits, 9 files, 14 tests; schema cascade migration + apply-to-job action + ApplyRitualDialog + Board wiring + account-deletion blob cleanup)
- **3.4 — Application Status Management & Notes** ✅ (+1 commit, 12 files, 19 tests; status selector, inline-on-blur notes for both listing and application, three new server actions)
- **3.5 — View Application CV Snapshot** ✅ (+1 commit, snapshot proxy route + UI link)
- **3.6 — Follow-up Due Detection** ✅ (+1 commit, pure detector with AppConfig threshold, Board pill)

Each story spec under `_bmad-output/implementation-artifacts/3-N-*.md` is now `Status: done`, with completion notes describing scope deltas and decisions made.

## External configuration you'll need to do

### 🔴 Stripe — required for Story 5.2 to actually work

Story 5.2's code is shipped and tested but unusable until Stripe is configured. The `/settings/subscription` page renders without it (just won't fetch the Pro billing date); the **Upgrade to Pro** and **Cancel** buttons throw "STRIPE_SECRET_KEY is not set" until you do this.

1. **Create a Stripe account** (or use the existing dev one) and switch to **Test mode** for now.
2. **Create the Pro Product + Price** in Stripe → Products → Add product:
   - Name: `FollowCV Pro` (or whatever)
   - Price: recurring monthly (or yearly), e.g. €9/month
   - Copy the resulting Price id (starts with `price_…`).
3. **Add the env vars** to `.env.local` (and to Vercel project env for prod):
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRO_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # filled in step 5
   APP_URL=http://localhost:3000     # or your Vercel URL in prod
   ```
4. **Configure the webhook** in Stripe → Developers → Webhooks → Add endpoint:
   - Endpoint URL: `https://YOUR_DOMAIN/api/webhooks/stripe` (in dev, use `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and copy the URL it prints)
   - Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
5. **Copy the webhook signing secret** from the endpoint detail page → into `STRIPE_WEBHOOK_SECRET`.
6. **Restart the dev server** so the env vars are picked up.
7. **Smoke test**: open `/settings/subscription`, click Upgrade, complete the test checkout (use card `4242 4242 4242 4242`, any future expiry, any CVC). The webhook should flip your user to PRO; the page should reflect it on refresh. Then click Cancel, confirm, and verify `subscriptionEndsAt` is set.

For local development, `stripe listen` (Stripe CLI) is the cleanest way to get a working webhook without exposing your laptop. Install via `brew install stripe/stripe-cli/stripe` and run `stripe login` first.

### Optional: AppConfig tunables

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

### Epic 4 + 5 stories shipped

- **4.1 — Health Score Engine** ✅ (pure function with 5 indicators, 20 unit tests covering every threshold boundary, every priority pair, edge cases, purity)
- **4.2 — Health Score Widget** ✅ (Server Component in the dashboard sidebar, under `<Suspense>` so it doesn't block layout)
- **5.1 — Listing Cap Enforcement** ✅ (Pro short-circuit, ProGatePattern reusable component, 80%/90% banners)
- **5.2 — Pro Subscription via Stripe** ✅ code-only — needs the configuration above to work end-to-end

### Stripe webhook code review — what I patched and what I left

After shipping Story 5.2 I ran an adversarial review of the Stripe code. **Patched in this session:**

- ✅ **Webhook idempotency** — new `stripe_webhook_events` table; the route inserts `event.id` first and short-circuits on a unique-constraint conflict. Stripe retries are now safe.
- ✅ **Customer-metadata fallback** for the race where `customer.subscription.updated` arrives before `checkout.session.completed`. The webhook now reads `userId` from `Customer.metadata` when our DB doesn't have the customerId mapping yet, and back-fills the column.
- ✅ **Subscription metadata** — `createCheckoutSession` now stamps `userId` on the Subscription via `subscription_data.metadata`, giving every future `customer.subscription.*` event a userId without needing the customer-metadata round-trip.
- ✅ **Wrong-subscription overwrite** — `customer.subscription.updated` only stamps `stripeSubscriptionId` when the subscription is active/trialing or matches the existing one. `customer.subscription.deleted` is also gated on matching ids so a stale `deleted` event for an old sub can't downgrade an active payer.
- ✅ **Subscription id fallback** — if `checkout.session.completed` arrives without a string subscription id, we re-retrieve the session with `expand: ['subscription']`.
- ✅ **Deleted-Customer recovery** — `createCheckoutSession` now `customers.retrieve` first; on `resource_missing` (or `deleted: true`), nulls the stale id and creates a fresh Customer.
- ✅ **Settings page now prefers Stripe truth** — `/settings/subscription` reads `cancel_at_period_end` from Stripe directly and uses it over the local `subscriptionEndsAt` mirror, so a delayed webhook can't leave the UI stuck on "Cancels on…" after the user un-cancels via the customer portal.
- ✅ **Webhook observability** — every event/handler path logs structured JSON (event.id, type, resolved-userId-or-null) via `console.log`/`console.error`. Critical for debugging silent skips.
- ✅ **Runtime + dynamic exports** on the webhook route, so a future "let's go edge" PR can't silently break signature verification.
- ✅ **`apiVersion` actually pinned** (was just a comment claim, no actual pin).

**Left for you to weigh in on:**

- ⚠️ **Out-of-order webhook delivery is still a residual risk.** Stripe doesn't guarantee event ordering. If `customer.subscription.updated{status: past_due}` arrives after `customer.subscription.updated{status: active}` (recovery), the user gets downgraded. Idempotency dedups duplicates but doesn't reject staler-by-timestamp events. Fix would be: persist `event.created` per subscription on the User row and reject older. Not a critical bug today (Stripe ordering is usually correct in practice), but worth tracking. Sketch: add `lastStripeEventCreatedAt: DateTime?` column, set `WHERE id = userId AND (lastStripeEventCreatedAt IS NULL OR lastStripeEventCreatedAt < now)` in the update.
- ⚠️ **JWT-cached `subscriptionTier` is a latent foot-gun.** Today nothing in the codebase reads `session.user.subscriptionTier` for gating (entitlement checks all hit DB), so it's correct. But the field is in the JWT/Session type, frozen at sign-in. The next dev who writes `if (session.user.subscriptionTier === "PRO")` in a Server Component grants Pro for up to 30 days post-downgrade. Worth removing from the JWT entirely (`auth/callbacks.ts`) — search for `subscriptionTier` in the auth callback and the `next-auth.d.ts` type.
- ⚠️ **Double-checkout race** — two near-simultaneous Upgrade clicks can create two Subscriptions on the same Customer. The user pays for one (the one they complete), but in theory could complete both. `cancelSubscription` only knows about the latest `stripeSubscriptionId`. Mitigation idea: in `createCheckoutSession`, refuse if Stripe already has any active subscription on the Customer (cheap `subscriptions.list({ customer, status: 'active' })`).
- ⚠️ **Env-var validation at startup** — `STRIPE_*` env vars are only validated when their getters run (i.e. on first checkout click). Misconfigured prod fails late. Idea: add `instrumentation.ts` that calls all four getters at boot and refuses to start if any throw.
- ⚠️ **Webhook is unit-tested by extension** of action tests, not directly. Manual smoke via `stripe trigger checkout.session.completed` etc. is the right verification path. Stripe CLI's `stripe trigger` is a one-line command; do that as part of the morning Stripe setup.

### Carried-over follow-ups

- **Story 5.2 over-cap downgrade UX** — when a user cancels Pro and ends up over the listing cap, the spec says the board should render listings read-only with a prompt to archive. Not implemented in the autonomous run; the cap blocking on imports already works (`checkListingCap`), but the read-only board treatment is a focused follow-up. ~½ day.
- **Architecture document still references Cloudflare R2 and `revalidateTag`** — by deliberate decision; not updated per-story.
- **Two blob-orphan races from Story 3.2 review** — still in `_bmad-output/implementation-artifacts/deferred-work.md`, awaiting a future blob-reaper job.
