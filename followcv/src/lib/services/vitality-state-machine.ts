import type { VitalityState, OverrideSource, ApplicationStatus } from "@/generated/prisma/client"

export type VitalityInputs = {
  postedAt: Date | null
  closingDate: Date | null
  application: { appliedAt: Date; status: ApplicationStatus } | null
  gmailSignalAt: Date | null
  overrideState: VitalityState | null
  overrideSource: OverrideSource | null
  isArchived: boolean
  now: Date
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Returns null when isArchived (skip — do not update state)
export function computeVitalityState(inputs: VitalityInputs): VitalityState | null {
  const { postedAt, closingDate, application, gmailSignalAt, overrideState, overrideSource, isArchived, now } = inputs

  // Rule 1: archived → skip
  if (isArchived) return null

  // Rule 2: rejected or withdrawn → CLOSED
  if (application?.status === "REJECTED" || application?.status === "WITHDRAWN") return "CLOSED"

  // Rule 3: user override → preserve
  if (overrideSource === "USER") return overrideState!

  // Rule 4: closing within 48h and still in the future → DEADLINE
  if (closingDate !== null) {
    const msUntilClose = closingDate.getTime() - now.getTime()
    if (msUntilClose > 0 && msUntilClose <= 48 * 60 * 60 * 1000) return "DEADLINE"
  }

  // Rule 5: gmail signal after appliedAt → IN_DIALOGUE
  if (application !== null && gmailSignalAt !== null && gmailSignalAt > application.appliedAt) {
    return "IN_DIALOGUE"
  }

  // Rule 6: applied 14+ days ago with APPLIED status → GHOSTING
  if (application !== null && application.status === "APPLIED") {
    const daysSinceApplied = (now.getTime() - application.appliedAt.getTime()) / MS_PER_DAY
    if (daysSinceApplied > 14) return "GHOSTING"
  }

  // Rule 7: active application states → ACTIVE
  if (application !== null) {
    const { status } = application
    if (status === "APPLIED" || status === "INTERVIEWING" || status === "ON_HOLD") return "ACTIVE"
  }

  // Rule 8: posted ≤7 days ago → HOT
  if (postedAt !== null) {
    const daysSincePosted = (now.getTime() - postedAt.getTime()) / MS_PER_DAY
    if (daysSincePosted <= 7) return "HOT"

    // Rule 9: 8–21 days ago → COOLING
    if (daysSincePosted <= 21) return "COOLING"

    // Rule 10: >21 days ago → COLD
    return "COLD"
  }

  // Rule 11: postedAt null → COOLING (conservative fallback)
  return "COOLING"
}
