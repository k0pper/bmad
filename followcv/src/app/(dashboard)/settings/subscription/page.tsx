import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ProGatePattern } from "@/components/shared/ProGatePattern"
import { CheckoutButton } from "@/components/billing/CheckoutButton"
import { CancelSubscriptionButton } from "@/components/billing/CancelSubscriptionButton"
import { getStripe } from "@/lib/stripe/client"

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default async function SubscriptionSettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      subscriptionTier: true,
      stripeSubscriptionId: true,
      subscriptionEndsAt: true,
    },
  })
  if (!user) redirect("/login")

  // Try to fetch billing details from Stripe directly so the page reflects
  // truth even if a webhook is delayed/missing. Best-effort — if Stripe
  // isn't configured locally, fall back to the DB mirror.
  let nextBillingDate: Date | null = null
  // `cancelsAt` may differ from the DB mirror if Stripe truth says the
  // user un-cancelled but our webhook hasn't caught up yet.
  let cancelsAt: Date | null = user.subscriptionEndsAt
  if (user.subscriptionTier === "PRO" && user.stripeSubscriptionId) {
    try {
      const stripe = getStripe()
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
      type WithItems = typeof sub & {
        items?: { data?: { current_period_end?: number }[] }
      }
      const periodEnd = (sub as WithItems).items?.data?.[0]?.current_period_end
      if (periodEnd) {
        nextBillingDate = new Date(periodEnd * 1000)
      }
      cancelsAt =
        sub.cancel_at_period_end && sub.cancel_at
          ? new Date(sub.cancel_at * 1000)
          : null
    } catch {
      // Swallow — local dev without Stripe shouldn't crash this page.
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-12">
      <section>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Subscription
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Manage your plan, billing, and Pro features.
        </p>
      </section>

      {user.subscriptionTier === "PRO" ? (
        <section className="space-y-4">
          <div
            className="flex flex-col gap-3 rounded-md border p-5"
            style={{
              borderColor: "var(--color-border, #e2e8f0)",
              backgroundColor: "var(--color-brand-subtle, #eef2ff)",
            }}
          >
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Pro plan
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt style={{ color: "var(--color-text-secondary)" }}>Status</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>
                {cancelsAt
                  ? `Cancels on ${formatDate(cancelsAt)}`
                  : "Active"}
              </dd>
              {nextBillingDate && !cancelsAt && (
                <>
                  <dt style={{ color: "var(--color-text-secondary)" }}>
                    Next billing date
                  </dt>
                  <dd style={{ color: "var(--color-text-primary)" }}>
                    {formatDate(nextBillingDate)}
                  </dd>
                </>
              )}
            </dl>
          </div>
          {!cancelsAt && <CancelSubscriptionButton />}
        </section>
      ) : (
        <section className="space-y-4">
          <ProGatePattern
            headline="Upgrade to Pro for unlimited tracking"
            description="Unlimited listings, unlimited CV versions, and Gmail auto-tracking."
            ctaText="See Pro features"
          />
          <CheckoutButton />
        </section>
      )}
    </div>
  )
}
