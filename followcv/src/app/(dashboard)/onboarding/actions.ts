"use server"

import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createPreferenceProfile } from "@/lib/preferences/service"

export type PreferenceActionState = { error: string } | null

export async function savePreferences(
  _prevState: PreferenceActionState,
  formData: FormData
): Promise<PreferenceActionState> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated" }

  const jobFunction = (formData.get("jobFunction") as string) || undefined
  const seniorityLevel = (formData.get("seniorityLevel") as string) || undefined
  const workStyle = (formData.get("workStyle") as string) || undefined
  const preferredLocations = formData.getAll("preferredLocations") as string[]
  const salaryCurrency = (formData.get("salaryCurrency") as string) || "USD"

  const salaryMinRaw = formData.get("targetSalaryMin") as string
  const salaryMaxRaw = formData.get("targetSalaryMax") as string
  const targetSalaryMin = salaryMinRaw ? parseInt(salaryMinRaw, 10) : null
  const targetSalaryMax = salaryMaxRaw ? parseInt(salaryMaxRaw, 10) : null

  await createPreferenceProfile(session.user.id, {
    jobFunction,
    seniorityLevel,
    preferredLocations,
    workStyle,
    targetSalaryMin,
    targetSalaryMax,
    salaryCurrency,
  })

  redirect("/board")
}
