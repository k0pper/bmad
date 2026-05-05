import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPreferenceProfile } from "@/lib/preferences/service"
import { PreferenceForm } from "@/components/onboarding/PreferenceForm"

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const existing = await getPreferenceProfile(session.user.id)
  if (existing) redirect("/board")

  return (
    <div className="mx-auto max-w-xl p-8">
      <div className="mb-8">
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Set up your profile
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Help us understand your job search so we can coach you from day one. All fields are
          optional — you can update these anytime in Settings.
        </p>
      </div>
      <PreferenceForm />
    </div>
  )
}
