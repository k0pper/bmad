import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPreferenceProfile } from "@/lib/preferences/service"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { AccountDangerZone } from "@/components/settings/AccountDangerZone"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const profile = await getPreferenceProfile(session.user.id)

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
        <AccountDangerZone gmailConnected={session.user.gmailConnected ?? false} />
      </section>
    </div>
  )
}
