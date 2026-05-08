# Deferred Work

Items raised in code reviews that are real but deliberately not addressed in their original story. Track here so they aren't forgotten.

## Deferred from: code review of 3-2-cv-version-management (2026-05-08)

- **Concurrent delete of two siblings sharing the same `s3Key` orphans the blob** — Two `deleteCvVersion` calls for siblings A and B that share `s3Key` can interleave such that each sees `otherCount = 1` and skips `safeDelBlob`. The blob is never reclaimed. AC4 explicitly accepts blob deletion as best-effort and Neon HTTP forbids transactions, so the fix belongs in a future periodic blob-reaper job rather than in the action. [followcv/src/actions/manage-cv.ts:195-203]

- **Delete-vs-Use-as-current race leaves a row pointing at a deleted blob** — Tx1 (delete A, sole holder of `s3Key`) reads `count = 0` and queues `del(s3Key)`. Tx2 (Use-as-current targeting A creates B) interleaves between Tx1's count and `del`. After both, B exists referencing a deleted blob and downloads/preview will 404. Same root cause as above (no transactions under Neon HTTP) and same deferral — addressable by the same blob-reaper that re-validates row→blob references, or by introducing a soft-delete + reaper pattern. [followcv/src/actions/manage-cv.ts:195-203]

## Deferred from: code review of 5-2-pro-subscription-via-stripe (2026-05-08)

The Stripe code shipped in Story 5.2 had an adversarial review run against it; the high-severity findings were patched in `fix(stripe): harden webhook + checkout against the review findings` (commit `174a009`). The following residuals were left as engineering follow-ups — none of them block the feature working today, but each is worth tracking.

- **Out-of-order webhook delivery is a residual risk.** Stripe doesn't guarantee event ordering. If `customer.subscription.updated{status: past_due}` arrives after `customer.subscription.updated{status: active}` (recovery), the user gets downgraded. The `stripe_webhook_events` idempotency table dedups duplicates but doesn't reject events that are *staler* by `event.created`. Fix: persist `lastStripeEventCreatedAt: DateTime?` per User and reject older events. Not a critical bug today (Stripe ordering is usually correct in practice), but worth tracking. [followcv/src/app/api/webhooks/stripe/route.ts]

- **JWT-cached `subscriptionTier` is a latent foot-gun.** Today nothing in the codebase reads `session.user.subscriptionTier` for gating (entitlement checks all hit DB), so it's correct. But the field is in the JWT/Session type, frozen at sign-in. The next dev who writes `if (session.user.subscriptionTier === "PRO")` in a Server Component grants Pro for up to 30 days post-downgrade. Fix: remove `subscriptionTier` from the JWT entirely (search `auth/callbacks.ts` and `next-auth.d.ts`).

- **Double-checkout race.** Two near-simultaneous Upgrade clicks can create two Subscriptions on the same Customer. The user pays for one (the one they complete), but in theory could complete both. `cancelSubscription` only knows about the latest `stripeSubscriptionId`. Mitigation: in `createCheckoutSession`, refuse if Stripe already has any active subscription on the Customer (cheap `subscriptions.list({ customer, status: 'active' })`). [followcv/src/actions/manage-subscription.ts]

- **Env-var validation at startup.** `STRIPE_*` env vars are validated lazily inside the getter, on first checkout click. Misconfigured prod fails late, with a string error surfaced to the user. Fix: add a Next.js `instrumentation.ts` that calls all four getters at boot and refuses to start the server if any throw.

- **Webhook is unit-tested by extension** of action tests, not directly. Manual smoke via `stripe trigger` is the right verification path; signing-bytes mocking would be brittle. No fix needed unless the webhook grows complex enough to warrant integration tests.

- **Story 5.2 over-cap downgrade UX.** When a user cancels Pro and ends up over the 25-listing cap, the original spec said the board should render listings read-only with a prompt to archive. Not implemented. The cap blocking on imports already works (`checkListingCap`), so they can't add new ones, but the read-only board treatment is a focused follow-up. ~½ day. [followcv/src/components/board/]
