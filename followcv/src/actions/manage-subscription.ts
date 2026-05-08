"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  getAppUrl,
  getStripe,
  getStripeProPriceId,
} from "@/lib/stripe/client"

type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

async function requireUser(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return { ok: false, error: "Unauthorized" }
  }
  return { ok: true, userId: session.user.id, email: session.user.email }
}

/**
 * Create a Stripe Checkout Session for the authenticated user and return its
 * URL. The client redirects to that URL — card data never touches our app.
 *
 * Reuses the user's existing Stripe Customer if one is already on file;
 * otherwise creates a new Customer and stashes the id on the User row so
 * that future actions (manage subscription, etc.) reuse the same customer.
 */
export async function createCheckoutSession(): Promise<
  ActionResult<{ checkoutUrl: string }>
> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      stripeCustomerId: true,
      subscriptionTier: true,
    },
  })
  if (!user) return { data: null, error: "User not found" }
  if (user.subscriptionTier === "PRO") {
    return { data: null, error: "You're already on the Pro plan" }
  }

  const stripe = getStripe()
  let customerId = user.stripeCustomerId

  try {
    // Verify any existing Customer still exists in Stripe; if it was
    // deleted (test-mode wipe, fraud action, manual cleanup), drop the
    // stale id and create a fresh one — otherwise Stripe rejects the
    // checkout with `resource_missing` and the user can never upgrade.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId)
        if ("deleted" in existing && existing.deleted) {
          customerId = null
        }
      } catch (err) {
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? (err as { code?: string }).code
            : null
        if (code === "resource_missing") {
          customerId = null
        } else {
          throw err
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
      customerId = customer.id
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const appUrl = getAppUrl()
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getStripeProPriceId(), quantity: 1 }],
      success_url: `${appUrl}/settings/subscription?status=success`,
      cancel_url: `${appUrl}/settings/subscription?status=cancelled`,
      // Lets the webhook resolve the session back to our internal user.
      client_reference_id: user.id,
      // Stamp the userId on the Subscription too so the webhook can resolve
      // out-of-order `customer.subscription.updated` events (which arrive
      // without a Checkout Session reference).
      subscription_data: {
        metadata: { userId: user.id },
      },
    })
    if (!checkout.url) {
      return { data: null, error: "Stripe didn't return a checkout URL" }
    }
    return { data: { checkoutUrl: checkout.url }, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Stripe checkout failed",
    }
  }
}

/**
 * Cancel the user's Pro subscription at the end of the current billing
 * period. The user keeps Pro until the period ends; the webhook later
 * downgrades the tier when Stripe emits `customer.subscription.deleted`
 * or `customer.subscription.updated` with `cancel_at_period_end: true`.
 */
export async function cancelSubscription(): Promise<
  ActionResult<{ endsAt: Date | null }>
> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { stripeSubscriptionId: true, subscriptionTier: true },
  })
  if (!user) return { data: null, error: "User not found" }
  if (user.subscriptionTier !== "PRO" || !user.stripeSubscriptionId) {
    return { data: null, error: "No active Pro subscription found" }
  }

  try {
    const stripe = getStripe()
    const updated = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true },
    )

    const endsAt = updated.cancel_at
      ? new Date(updated.cancel_at * 1000)
      : null

    if (endsAt) {
      await prisma.user.update({
        where: { id: session.userId },
        data: { subscriptionEndsAt: endsAt },
      })
    }

    return { data: { endsAt }, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Stripe cancel failed",
    }
  }
}
