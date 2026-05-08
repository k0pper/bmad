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

  let customerId = user.stripeCustomerId
  try {
    const stripe = getStripe()
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
