"use server"

import { redirect } from "next/navigation"
import { auth, signOut, unstable_update } from "@/lib/auth"
import { updatePreferenceProfile } from "@/lib/preferences/service"
import { deleteAccount, revokeGmailAccess } from "@/lib/account/service"

export type SettingsActionState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null

export async function updateSettings(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await auth()
  if (!session?.user?.id) return { type: "error", message: "Not authenticated" }

  const jobFunction = (formData.get("jobFunction") as string) || undefined
  const seniorityLevel = (formData.get("seniorityLevel") as string) || undefined
  const workStyle = (formData.get("workStyle") as string) || undefined
  const preferredLocations = formData.getAll("preferredLocations") as string[]
  const salaryCurrency = (formData.get("salaryCurrency") as string) || "USD"

  const salaryMinRaw = formData.get("targetSalaryMin") as string
  const salaryMaxRaw = formData.get("targetSalaryMax") as string
  const targetSalaryMin = salaryMinRaw ? parseInt(salaryMinRaw, 10) : null
  const targetSalaryMax = salaryMaxRaw ? parseInt(salaryMaxRaw, 10) : null

  await updatePreferenceProfile(session.user.id, {
    jobFunction,
    seniorityLevel,
    preferredLocations,
    workStyle,
    targetSalaryMin,
    targetSalaryMax,
    salaryCurrency,
  })

  return { type: "success", message: "Settings saved" }
}

export async function deleteUserAccount(): Promise<SettingsActionState> {
  const session = await auth()
  if (!session?.user?.id) return { type: "error", message: "Not authenticated" }

  await deleteAccount(session.user.id)
  await signOut({ redirectTo: "/" })
  // signOut redirects, so this line is unreachable at runtime
  return null
}

export async function revokeGmailToken(): Promise<SettingsActionState> {
  const session = await auth()
  if (!session?.user?.id) return { type: "error", message: "Not authenticated" }

  await revokeGmailAccess(session.user.id)
  // JWT flag is a UI hint only — every server-side gate re-reads from DB —
  // but flipping it keeps the in-flight UI consistent without a sign-out.
  await unstable_update({ user: { gmailConnected: false } })
  return { type: "success", message: "Gmail access revoked" }
}

export async function skipOnboarding(): Promise<void> {
  redirect("/board")
}
