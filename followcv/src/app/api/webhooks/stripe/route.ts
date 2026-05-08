import type Stripe from "stripe"
import { prisma } from "@/lib/db"
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/client"

// Stripe webhooks need the Node runtime (Web Crypto + Prisma) and must
// never be cached.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Stripe webhook receiver. Verifies the signature, then dispatches the
 * subscription-tier-affecting events:
 *
 *  - checkout.session.completed         → set tier=PRO, store subscriptionId
 *  - customer.subscription.updated      → respect cancel_at_period_end / status
 *  - customer.subscription.deleted      → downgrade tier=FREE
 *
 * Idempotency: we insert `event.id` into `stripe_webhook_events` at the top
 * of every request; a unique-constraint conflict means we've already
 * processed this event and we short-circuit with 200. Stripe retries 4xx/5xx
 * but won't retry 200, which is what we want — the original processing
 * either succeeded or another concurrent delivery is handling it.
 *
 * User resolution (in order):
 *   1. `client_reference_id` on the session (set by createCheckoutSession).
 *   2. `stripeCustomerId` already stamped on the User row.
 *   3. `metadata.userId` on the Stripe Customer (we set this when we
 *      created the Customer). This covers the race where
 *      `customer.subscription.updated` arrives before
 *      `checkout.session.completed`.
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
    console.error("[stripe-webhook] signature_verification_failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return new Response(
      `Webhook signature verification failed: ${
        err instanceof Error ? err.message : "unknown"
      }`,
      { status: 400 },
    )
  }

  // Idempotency: record the event id; if a second delivery arrives, the
  // unique constraint on `id` rejects the insert and we 200 without re-running.
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      console.log("[stripe-webhook] duplicate_event_ignored", {
        eventId: event.id,
        type: event.type,
      })
      return Response.json({ received: true, duplicate: true })
    }
    // Non-unique error → genuine DB issue. Don't process; Stripe will retry.
    console.error("[stripe-webhook] idempotency_record_failed", {
      eventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return new Response("Idempotency store unavailable", { status: 500 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        )
        break
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        )
        break
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        )
        break
      default:
        // No-op for events we don't act on.
        break
    }
    return Response.json({ received: true })
  } catch (err) {
    console.error("[stripe-webhook] handler_failed", {
      eventId: event.id,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    })
    return new Response(
      `Webhook handler failed: ${
        err instanceof Error ? err.message : "unknown"
      }`,
      { status: 500 },
    )
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false
  return (err as { code?: string }).code === "P2002"
}

async function findUserId(opts: {
  clientReferenceId?: string | null
  customerId?: string | null
}): Promise<string | null> {
  if (opts.clientReferenceId) {
    const byRef = await prisma.user.findUnique({
      where: { id: opts.clientReferenceId },
      select: { id: true },
    })
    if (byRef) return byRef.id
  }
  if (opts.customerId) {
    const byCustomer = await prisma.user.findUnique({
      where: { stripeCustomerId: opts.customerId },
      select: { id: true },
    })
    if (byCustomer) return byCustomer.id

    // Fallback: read userId from Customer.metadata (we stamp it when we
    // create the Customer). This covers the race where
    // `customer.subscription.updated` arrives before we've persisted the
    // customerId on our User row.
    try {
      const stripe = getStripe()
      const customer = await stripe.customers.retrieve(opts.customerId)
      if (!customer.deleted) {
        const userId = customer.metadata?.userId
        if (typeof userId === "string" && userId.length > 0) {
          // Backfill the customerId so future events skip the metadata round-trip.
          try {
            await prisma.user.update({
              where: { id: userId },
              data: { stripeCustomerId: opts.customerId },
            })
          } catch {
            // Best-effort backfill.
          }
          return userId
        }
      }
    } catch (err) {
      console.error("[stripe-webhook] customer_metadata_lookup_failed", {
        customerId: opts.customerId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return null
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const customerId =
    typeof session.customer === "string" ? session.customer : null
  let subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null

  // If Stripe returned subscription as an object (or null due to lazy
  // expansion), re-retrieve the session with subscription expanded so we
  // always persist the id.
  if (!subscriptionId) {
    try {
      const stripe = getStripe()
      const reloaded = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["subscription"],
      })
      const sub = reloaded.subscription
      if (typeof sub === "string") {
        subscriptionId = sub
      } else if (sub && "id" in sub) {
        subscriptionId = sub.id
      }
    } catch (err) {
      console.error("[stripe-webhook] checkout_subscription_reload_failed", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const userId = await findUserId({
    clientReferenceId: session.client_reference_id,
    customerId,
  })
  if (!userId) {
    console.error("[stripe-webhook] checkout_completed_user_not_found", {
      sessionId: session.id,
      customerId,
      clientReferenceId: session.client_reference_id,
    })
    return
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: "PRO",
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscriptionId ?? undefined,
      subscriptionEndsAt: null,
    },
  })

  console.log("[stripe-webhook] checkout_completed_applied", {
    userId,
    sessionId: session.id,
    subscriptionId,
  })
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null
  const userId = await findUserId({ customerId })
  if (!userId) {
    console.error("[stripe-webhook] subscription_updated_user_not_found", {
      subscriptionId: subscription.id,
      customerId,
    })
    return
  }

  const isActive =
    subscription.status === "active" || subscription.status === "trialing"
  const tier: "PRO" | "FREE" = isActive ? "PRO" : "FREE"
  const endsAt =
    subscription.cancel_at_period_end && subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : null

  // Only stamp this subscription id on the user when it's the active one,
  // or when it matches the existing one. Multiple subs on the same Customer
  // (re-subscription, dashboard-created) shouldn't let an old/canceled sub
  // overwrite the live one's id.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true },
  })
  const ownsThisSub =
    existing?.stripeSubscriptionId === null ||
    existing?.stripeSubscriptionId === undefined ||
    existing.stripeSubscriptionId === subscription.id

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionEndsAt: endsAt,
      ...(isActive || ownsThisSub
        ? { stripeSubscriptionId: subscription.id }
        : {}),
    },
  })

  console.log("[stripe-webhook] subscription_updated_applied", {
    userId,
    subscriptionId: subscription.id,
    status: subscription.status,
    tier,
    endsAt: endsAt?.toISOString() ?? null,
  })
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null
  const userId = await findUserId({ customerId })
  if (!userId) {
    console.error("[stripe-webhook] subscription_deleted_user_not_found", {
      subscriptionId: subscription.id,
      customerId,
    })
    return
  }

  // Only clear the subscription columns if THIS subscription is the one we
  // have on file. A `deleted` event for an old, replaced subscription
  // shouldn't downgrade an actively-paying user.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true },
  })
  if (
    existing?.stripeSubscriptionId &&
    existing.stripeSubscriptionId !== subscription.id
  ) {
    console.log("[stripe-webhook] subscription_deleted_ignored_stale", {
      userId,
      eventSubscriptionId: subscription.id,
      currentSubscriptionId: existing.stripeSubscriptionId,
    })
    return
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: "FREE",
      stripeSubscriptionId: null,
      subscriptionEndsAt: null,
    },
  })

  console.log("[stripe-webhook] subscription_deleted_applied", {
    userId,
    subscriptionId: subscription.id,
  })
}
