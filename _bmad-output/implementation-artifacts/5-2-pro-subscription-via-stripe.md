# Story 5.2: Pro Subscription via Stripe

Status: done

## Story

As a **user**, I want to subscribe to Pro, manage my subscription, and cancel it, so I can unlock unlimited listings within the product.

## Acceptance Criteria (from epics.md)

1. Server Action creates a Stripe Checkout Session and redirects to the Stripe-hosted page; card data never passes through the app.
2. `checkout.session.completed` webhook updates `User.subscriptionTier` to `PRO`.
3. `customer.subscription.updated` and `customer.subscription.deleted` are also handled, updating the tier accordingly.
4. `/settings/subscription` displays current tier, next billing date (Pro), and a "Cancel subscription" action that schedules downgrade at period end.
5. After tier changes, the next auth check reflects the DB tier — no stale entitlements.
6. Cancelled Pro downgrades to FREE at period end; over-cap users see read-only data with a prompt to archive.

## Implementation

### Schema additions

`User` gains three nullable columns (migration `20260508100000_user_stripe_subscription_columns`):
- `stripeCustomerId String?  @unique`
- `stripeSubscriptionId String?  @unique`
- `subscriptionEndsAt DateTime?` — set when the user has cancelled but the period hasn't ended yet.

The migration was hand-written because Prisma Migrate can't run interactively in this environment; it creates two unique indexes (Postgres treats NULLs as distinct so existing FREE users with NULL columns are fine).

### Stripe SDK wrapper

`src/lib/stripe/client.ts`:
- Lazy-initialised `getStripe()` reading `STRIPE_SECRET_KEY` on first use; throws with a clear message naming `MORNING_NOTES.md` if missing.
- `getStripeProPriceId()`, `getStripeWebhookSecret()`, `getAppUrl()` mirror the same pattern.
- `getAppUrl()` accepts `APP_URL`, falls back to `NEXT_PUBLIC_APP_URL`, then `VERCEL_URL` (auto-set by Vercel).

### Server actions

`src/actions/manage-subscription.ts`:
- `createCheckoutSession()` — auth → DB read → reuse-or-create Stripe Customer (stashes the id on the User row) → Checkout Session (mode: `subscription`, with the Pro price, with `client_reference_id: userId`). Returns `{ checkoutUrl }` for the client to redirect. Rejects if the user is already on Pro.
- `cancelSubscription()` — flips `cancel_at_period_end: true` on the Stripe subscription and persists `subscriptionEndsAt` from `cancel_at`. The webhook later downgrades the tier on `customer.subscription.deleted`.

Both follow the project ActionResult contract, never throw, and return errors as strings (Stripe SDK errors are caught and surfaced).

### Webhook

`src/app/api/webhooks/stripe/route.ts`:
- Verifies the signature via `stripe.webhooks.constructEventAsync` with `STRIPE_WEBHOOK_SECRET`.
- Dispatches three events:
  - `checkout.session.completed` → tier=PRO, persist customerId + subscriptionId, clear `subscriptionEndsAt`.
  - `customer.subscription.updated` → mirror status (active/trialing → PRO, otherwise FREE) and `cancel_at_period_end → subscriptionEndsAt`.
  - `customer.subscription.deleted` → tier=FREE, clear subscription columns.
- All other events are acknowledged (`200 received: true`) so Stripe doesn't retry. Resolution: prefers `client_reference_id`, falls back to `stripeCustomerId` lookup.

### UI

- `/settings/subscription` Server Component: shows the current tier, calls `stripe.subscriptions.retrieve` (best-effort) to surface the next billing date for Pro users, renders `ProGatePattern` + `CheckoutButton` for free users, or a `CancelSubscriptionButton` for Pro users.
- `CheckoutButton` (client) calls `createCheckoutSession`, redirects to the returned URL.
- `CancelSubscriptionButton` (client) shows a small inline confirm, calls `cancelSubscription`, then `router.refresh()`.
- `/settings` page now has a Subscription section with a link to `/settings/subscription`.

### Cache strategy

Same as everything else: `router.refresh()` after `cancelSubscription` re-renders the layout sidebar (Story 4.2 health-score widget) and the page itself. The webhook updates the DB; the user's next page render reads the new tier directly. No JWT entitlement caching to invalidate.

### Tests

`manage-subscription.test.ts` (11 new tests):
- createCheckoutSession: unauth, already-Pro, creates customer first time, reuses existing customer, missing-URL guard, Stripe error surfacing.
- cancelSubscription: unauth, free user, missing subscription id, persists `subscriptionEndsAt` from `cancel_at`, handles missing `cancel_at`.

The webhook itself isn't unit-tested in this round (signing-bytes mocking is brittle and the path is small enough that a manual smoke test against `stripe trigger` is the right verification — see MORNING_NOTES.md).

Suite: 292 tests, lint + types + build clean.

### Out of scope for this story

The "over-cap free downgrade puts the board in read-only mode" piece of AC 6 is not implemented — it requires UX work on the Board to render rows as non-interactive, which is a focused follow-up. Today over-cap free users still see all their listings; new imports are blocked by `checkListingCap` (Story 5.1). The downgrade itself works — they're just not gated past that. **Tracked in MORNING_NOTES.md.**

### Files

- `followcv/package.json` — added `stripe` dep
- `followcv/prisma/schema.prisma` — modified (3 new User columns)
- `followcv/prisma/migrations/20260508100000_user_stripe_subscription_columns/migration.sql` — created
- `followcv/src/lib/stripe/client.ts` — created
- `followcv/src/actions/manage-subscription.ts` — created
- `followcv/src/actions/manage-subscription.test.ts` — created
- `followcv/src/app/api/webhooks/stripe/route.ts` — created
- `followcv/src/app/(dashboard)/settings/subscription/page.tsx` — created
- `followcv/src/app/(dashboard)/settings/page.tsx` — modified (Subscription section + link)
- `followcv/src/components/billing/CheckoutButton.tsx` — created
- `followcv/src/components/billing/CancelSubscriptionButton.tsx` — created

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-08 | Story implemented and shipped to main; Stripe configuration deferred to morning | claude-opus-4-7 |
| 2026-05-08 | Stripe sandbox configured (Product, Price, API keys, webhook signing secret); upgrade + cancel flows smoke-tested end-to-end with test card `4242 4242 4242 4242`; webhook events relayed via `stripe listen`; user reviewed | alex |
