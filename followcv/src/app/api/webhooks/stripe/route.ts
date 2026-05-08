import type Stripe from "stripe"
import { prisma } from "@/lib/db"
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/client"

/**
 * Stripe webhook receiver. Verifies the signature, then dispatches a small
 * set of events that affect the user's subscription tier:
 *
 *  - checkout.session.completed         → set tier=PRO, store subscriptionId
 *  - customer.subscription.updated      → respect cancel_at_period_end
 *  - customer.subscription.deleted      → downgrade tier=FREE
 *
 * Resolution from Stripe entities to our User row:
 *   1. Prefer `client_reference_id` (set by `createCheckoutSession`).
 *   2. Fall back to looking up by `stripeCustomerId` we stored on the user.
 *
 * Webhook configuration steps live in MORNING_NOTES.md.
 */
export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature")
  if (!signature) return new Response("Missing signature", { status: 400 })

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    const body = await request.text()
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      getStripeWebhookSecret(),
    )
  } catch (err) {
    return new Response(
      `Webhook signature verification failed: ${
        err instanceof Error ? err.message : "unknown"
      }`,
      { status: 400 },
    )
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      default:
        // No-op for events we don't act on. Stripe only retries 4xx/5xx,
        // and we want all other events acknowledged so the dashboard
        // doesn't show false alarms.
        break
    }
    return Response.json({ received: true })
  } catch (err) {
    return new Response(
      `Webhook handler failed: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 500 },
    )
  }
}

async function findUserByStripeRefs(opts: {
  clientReferenceId?: string | null
  customerId?: string | null
}): Promise<{ id: string } | null> {
  if (opts.clientReferenceId) {
    const byRef = await prisma.user.findUnique({
      where: { id: opts.clientReferenceId },
      select: { id: true },
    })
    if (byRef) return byRef
  }
  if (opts.customerId) {
    return prisma.user.findUnique({
      where: { stripeCustomerId: opts.customerId },
      select: { id: true },
    })
  }
  return null
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const user = await findUserByStripeRefs({
    clientReferenceId: session.client_reference_id,
    customerId: typeof session.customer === "string" ? session.customer : null,
  })
  if (!user) return

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: "PRO",
      stripeCustomerId:
        typeof session.customer === "string"
          ? session.customer
          : undefined,
      stripeSubscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : undefined,
      subscriptionEndsAt: null,
    },
  })
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null
  const user = await findUserByStripeRefs({ customerId })
  if (!user) return

  // The user may have toggled "cancel at period end" on or off, or Stripe
  // may have just renewed the subscription. Always rewrite our local
  // mirror of these two fields from the Stripe truth.
  const endsAt = subscription.cancel_at_period_end && subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000)
    : null

  // Status mapping: 'active' / 'trialing' = entitled to Pro; everything
  // else (past_due, canceled, unpaid, incomplete, incomplete_expired) = FREE.
  // Stripe will follow up with subscription.deleted when it's truly gone.
  const tier =
    subscription.status === "active" || subscription.status === "trialing"
      ? "PRO"
      : "FREE"

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: tier,
      subscriptionEndsAt: endsAt,
      stripeSubscriptionId: subscription.id,
    },
  })
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null
  const user = await findUserByStripeRefs({ customerId })
  if (!user) return

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: "FREE",
      stripeSubscriptionId: null,
      subscriptionEndsAt: null,
    },
  })
}
