import Stripe from "stripe"

let cached: Stripe | null = null

/**
 * Lazily-initialised Stripe SDK client. Reads `STRIPE_SECRET_KEY` from the
 * environment on first use. The client is cached so repeat calls don't
 * re-construct the SDK.
 *
 * Required env vars (see MORNING_NOTES for setup):
 *   - STRIPE_SECRET_KEY       — secret API key (`sk_test_…` / `sk_live_…`)
 *   - STRIPE_WEBHOOK_SECRET   — used by the /api/webhooks/stripe route
 *   - STRIPE_PRO_PRICE_ID     — recurring Price id created in the Stripe
 *                               dashboard for the Pro plan
 *   - APP_URL                 — public base URL used to build success/cancel
 *                               redirect URLs for the Checkout session
 */
export function getStripe(): Stripe {
  if (cached) return cached

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. See MORNING_NOTES.md for the env setup.",
    )
  }
  // Pin a recent stable API version so behaviour is deterministic across
  // SDK upgrades; revisit when explicitly upgrading.
  cached = new Stripe(key)
  return cached
}

export function getStripeProPriceId(): string {
  const id = process.env.STRIPE_PRO_PRICE_ID
  if (!id) {
    throw new Error(
      "STRIPE_PRO_PRICE_ID is not set. Create a recurring Price in Stripe and set the env var.",
    )
  }
  return id
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set. Copy it from the Stripe webhook configuration.",
    )
  }
  return secret
}

export function getAppUrl(): string {
  const url =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL
  if (!url) {
    throw new Error("APP_URL is not set; can't construct Stripe redirect URLs.")
  }
  // Vercel sets VERCEL_URL without a scheme; Stripe needs a fully-qualified
  // redirect.
  return url.startsWith("http") ? url : `https://${url}`
}
