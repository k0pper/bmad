import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getPreferenceProfile } from "@/lib/preferences/service"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { AccountDangerZone } from "@/components/settings/AccountDangerZone"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [profile, user, gmailToken] = await Promise.all([
    getPreferenceProfile(session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    }),
    prisma.gmailToken.findUnique({
      where: { userId: session.user.id },
      select: { connectedEmail: true },
    }),
  ])

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-12">
      {/* Profile section */}
      <section aria-labelledby="profile-heading">
        <div className="mb-6">
          <h1
            id="profile-heading"
            className="text-xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Profile preferences
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Update your job search preferences. Changes take effect immediately.
          </p>
        </div>
        <SettingsForm profile={profile} />
      </section>

      {/* Divider */}
      <hr className="border-border" />

      {/* Subscription section */}
      <section aria-labelledby="subscription-heading">
        <div className="mb-4">
          <h2
            id="subscription-heading"
            className="text-xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Subscription
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            You are on the{" "}
            <strong>
              {user?.subscriptionTier === "PRO" ? "Pro" : "Free"}
            </strong>{" "}
            plan.
          </p>
        </div>
        <Link
          href="/settings/subscription"
          className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          style={{ color: "var(--color-text-primary)" }}
        >
          Manage subscription
        </Link>
      </section>

      {/* Divider */}
      <hr className="border-border" />

      {/* Gmail integration section */}
      <section aria-labelledby="gmail-heading">
        <div className="mb-4">
          <h2
            id="gmail-heading"
            className="text-xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Gmail integration
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {gmailToken
              ? `Connected as ${gmailToken.connectedEmail}.`
              : "Not connected. Connect Gmail to auto-update listing status when companies reply."}
          </p>
        </div>
        <Link
          href="/settings/gmail"
          className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          style={{ color: "var(--color-text-primary)" }}
        >
          {gmailToken ? "Manage Gmail" : "Connect Gmail"}
        </Link>
      </section>

      {/* Divider */}
      <hr className="border-border" />

      {/* Account section */}
      <section aria-labelledby="account-heading">
        <div className="mb-6">
          <h2
            id="account-heading"
            className="text-xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Account
          </h2>
        </div>
        <AccountDangerZone />
      </section>
    </div>
  )
}
