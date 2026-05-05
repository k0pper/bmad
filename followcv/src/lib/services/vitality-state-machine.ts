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

export type RuleEvaluation = {
  rule: number
  label: string
  detail: string
  outcome: "fired" | "skipped" | "passed"
}

export function explainVitalityState(inputs: VitalityInputs): RuleEvaluation[] {
  const { postedAt, closingDate, application, gmailSignalAt, overrideState, overrideSource, isArchived, now } = inputs
  const results: RuleEvaluation[] = []

  // Rule 1
  if (isArchived) {
    results.push({ rule: 1, label: "Archived", detail: "Listing is archived — state not updated", outcome: "fired" })
    return results
  }
  results.push({ rule: 1, label: "Not archived", detail: "Listing is active", outcome: "passed" })

  // Rule 2
  if (application?.status === "REJECTED" || application?.status === "WITHDRAWN") {
    results.push({ rule: 2, label: "Closed", detail: `Application status is ${application.status.toLowerCase()} → CLOSED`, outcome: "fired" })
    return results
  }
  results.push({
    rule: 2,
    label: "Not rejected / withdrawn",
    detail: application ? `Application status: ${application.status}` : "No application recorded",
    outcome: "passed",
  })

  // Rule 3
  if (overrideSource === "USER") {
    results.push({ rule: 3, label: "User override", detail: `Manually set to ${overrideState} — preserved`, outcome: "fired" })
    return results
  }
  results.push({ rule: 3, label: "No user override", detail: "State is system-computed", outcome: "passed" })

  // Rule 4
  if (closingDate !== null) {
    const msUntilClose = closingDate.getTime() - now.getTime()
    const hoursLeft = Math.round(msUntilClose / (60 * 60 * 1000))
    if (msUntilClose > 0 && msUntilClose <= 48 * 60 * 60 * 1000) {
      results.push({ rule: 4, label: "Deadline", detail: `Closing in ~${hoursLeft}h (within 48-hour window) → DEADLINE`, outcome: "fired" })
      return results
    }
    results.push({
      rule: 4,
      label: "No imminent deadline",
      detail: msUntilClose <= 0 ? "Closing date has passed" : `Closing in ${Math.round(msUntilClose / (24 * 60 * 60 * 1000))} days (> 48h)`,
      outcome: "passed",
    })
  } else {
    results.push({ rule: 4, label: "No closing date", detail: "No deadline set", outcome: "skipped" })
  }

  // Rule 5
  if (application !== null && gmailSignalAt !== null && gmailSignalAt > application.appliedAt) {
    results.push({ rule: 5, label: "Gmail reply detected", detail: `Email from employer received after application date → IN_DIALOGUE`, outcome: "fired" })
    return results
  }
  results.push({
    rule: 5,
    label: "No Gmail reply signal",
    detail: application && gmailSignalAt ? "Gmail signal predates application" : !gmailSignalAt ? "No Gmail signal detected" : "No application to compare against",
    outcome: "skipped",
  })

  // Rule 6
  if (application !== null && application.status === "APPLIED") {
    const daysSinceApplied = (now.getTime() - application.appliedAt.getTime()) / MS_PER_DAY
    if (daysSinceApplied > 14) {
      results.push({ rule: 6, label: "Ghosting", detail: `Applied ${Math.floor(daysSinceApplied)} days ago with no response (> 14 days) → GHOSTING`, outcome: "fired" })
      return results
    }
    results.push({ rule: 6, label: "Not yet ghosting", detail: `Applied ${Math.floor(daysSinceApplied)} days ago — within 14-day response window`, outcome: "passed" })
  } else {
    results.push({ rule: 6, label: "Ghosting check skipped", detail: application ? `Application status is ${application.status} (not APPLIED)` : "No application recorded", outcome: "skipped" })
  }

  // Rule 7
  if (application !== null) {
    const { status } = application
    if (status === "APPLIED" || status === "INTERVIEWING" || status === "ON_HOLD") {
      results.push({ rule: 7, label: "Active application", detail: `Application status: ${status} → ACTIVE`, outcome: "fired" })
      return results
    }
    results.push({ rule: 7, label: "Application not in active status", detail: `Status is ${status}`, outcome: "passed" })
  } else {
    results.push({ rule: 7, label: "No application", detail: "No application recorded yet", outcome: "skipped" })
  }

  // Rule 8/9/10
  if (postedAt !== null) {
    const daysSincePosted = (now.getTime() - postedAt.getTime()) / MS_PER_DAY
    const daysLabel = Math.floor(daysSincePosted) === 0 ? "today" : `${Math.floor(daysSincePosted)} days ago`
    if (daysSincePosted <= 7) {
      results.push({ rule: 8, label: "Hot listing", detail: `Posted ${daysLabel} — within 7-day window → HOT`, outcome: "fired" })
      return results
    }
    results.push({ rule: 8, label: "Posted more than 7 days ago", detail: `Posted ${daysLabel}`, outcome: "passed" })
    if (daysSincePosted <= 21) {
      results.push({ rule: 9, label: "Cooling", detail: `Posted ${daysLabel} — between 8 and 21 days → COOLING`, outcome: "fired" })
      return results
    }
    results.push({ rule: 9, label: "Posted more than 21 days ago", detail: `Posted ${daysLabel}`, outcome: "passed" })
    results.push({ rule: 10, label: "Cold listing", detail: `Posted ${daysLabel} — over 21 days old → COLD`, outcome: "fired" })
    return results
  }

  results.push({ rule: 11, label: "No posting date — fallback", detail: "Posting date unknown → COOLING (conservative default)", outcome: "fired" })
  return results
}
