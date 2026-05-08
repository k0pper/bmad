import { prisma } from "@/lib/db"
import type { ApplicationStatus } from "@/generated/prisma/client"

const MS_PER_DAY = 24 * 60 * 60 * 1000

const DEFAULT_FOLLOW_UP_THRESHOLD_DAYS = 7

const FOLLOW_UP_RELEVANT_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "APPLIED",
  "INTERVIEWING",
  "ON_HOLD",
])

/**
 * Read the follow-up threshold (in days) from AppConfig. Falls back to 7.
 *
 * Read once per request and pass the value into `isFollowUpDue` for each
 * listing — there's no per-listing config, so a single fetch is enough.
 */
export async function getFollowUpThresholdDays(): Promise<number> {
  const row = await prisma.appConfig.findUnique({
    where: { key: "follow_up_threshold_days" },
  })
  if (!row) return DEFAULT_FOLLOW_UP_THRESHOLD_DAYS
  const parsed = parseInt(row.value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_FOLLOW_UP_THRESHOLD_DAYS
  return parsed
}

export type FollowUpInputs = {
  application: {
    status: ApplicationStatus
    /**
     * Last activity timestamp on the application — bumps on any update via
     * Prisma's `@updatedAt`. Status changes, notes edits, and any other
     * write to the row reset this naturally.
     */
    updatedAt: Date
  } | null
  archived: boolean
  thresholdDays: number
  now: Date
}

/**
 * Pure function: does this listing need a follow-up nudge?
 *
 * Rules (matching epics.md Story 3.6):
 *  - Archived listings are never flagged.
 *  - Listings with no Application yet are not flagged (they don't have a
 *    "no follow-up since X" semantic — that belongs to listings the user
 *    has already engaged with).
 *  - Application status must be in an active waiting state (APPLIED,
 *    INTERVIEWING, ON_HOLD). REJECTED / WITHDRAWN / OFFER_RECEIVED /
 *    GHOSTED do not nudge.
 *  - Time since the last activity (Application.updatedAt) must exceed the
 *    threshold.
 */
export function isFollowUpDue(inputs: FollowUpInputs): boolean {
  const { application, archived, thresholdDays, now } = inputs
  if (archived) return false
  if (!application) return false
  if (!FOLLOW_UP_RELEVANT_STATUSES.has(application.status)) return false

  const daysSinceActivity =
    (now.getTime() - application.updatedAt.getTime()) / MS_PER_DAY
  return daysSinceActivity > thresholdDays
}
