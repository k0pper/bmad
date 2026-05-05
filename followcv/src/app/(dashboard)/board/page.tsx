import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPreferenceProfile } from "@/lib/preferences/service"

export default async function BoardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const profile = await getPreferenceProfile(session.user.id)
  if (!profile) redirect("/onboarding")

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
        Your Board
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Coming in Story 2
      </p>
    </div>
  )
}
