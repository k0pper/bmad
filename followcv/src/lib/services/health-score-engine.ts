import { prisma } from "@/lib/db"
import {
  getFollowUpThresholdDays,
  isFollowUpDue,
} from "./follow-up-detector"
import type {
  ApplicationStatus,
  VitalityState,
} from "@/generated/prisma/client"

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Identifier for each rule the engine evaluates. */
export type HealthIndicatorId =
  | "LOW_PIPELINE_RATIO"
  | "LOW_RECENT_ACTIVITY"
  | "HIGH_GHOSTING_DRAG"
  | "OVERDUE_FOLLOWUPS"
  | "STALE_CV"

/**
 * Coaching zone derived from the score. Bands match the spec:
 * - GREEN  (≥70): pipeline is healthy
 * - YELLOW (40–69): some friction, one nudge needed
 * - RED    (<40): multiple problems, action required
 */
export type CoachingZone = "GREEN" | "YELLOW" | "RED"

export type HealthScoreResult = {
  score: number
  zone: CoachingZone
  /** The single highest-priority indicator that fired (null when none did). */
  activeIndicator: HealthIndicatorId | null
  /** The coaching message tied to the active indicator. */
  coachingInstruction: string
}

/**
 * Inputs to the engine. Pure-function shape: no Prisma dependency. The
 * `getHealthScoreForUser` wrapper at the bottom of this module fetches the
 * data and calls `computeHealthScore`.
 */
export type HealthScoreInputs = {
  /** Non-archived job listings — used for pipeline ratio + ghosting count. */
  activeListings: Array<{
    vitalityState: VitalityState
    archived: false
    application: {
      status: ApplicationStatus
      updatedAt: Date
      appliedAt: Date
    } | null
    title: string
    company: string
  }>
  /** All Applications across the user's listings (for recent-activity rule). */
  applications: Array<{ appliedAt: Date }>
  /** Most recent CvVersion.uploadedAt; null if the user has no CVs yet. */
  mostRecentCvUploadedAt: Date | null
  /** AppConfig.follow_up_threshold_days (default 7). */
  followUpThresholdDays: number
  now: Date
}

// --- Thresholds (kept inline since they're rules-as-code, not config) ---

const PIPELINE_STALE_RATIO = 0.6
const RECENT_ACTIVITY_WINDOW_DAYS = 7
const RECENT_ACTIVITY_MIN_APPLICATIONS = 2
const GHOSTING_DRAG_MIN = 3
const STALE_CV_DAYS = 30

// Each indicator deducts a uniform 20 points. With 5 indicators total, all
// firing → score 0 (RED), none firing → 100 (GREEN). The numeric score
// reflects the *breadth* of issues; the *single* coaching instruction comes
// from the highest-priority indicator (priority order is the array below).
const INDICATOR_WEIGHT = 20

const PRIORITY_ORDER: HealthIndicatorId[] = [
  "LOW_PIPELINE_RATIO",
  "LOW_RECENT_ACTIVITY",
  "HIGH_GHOSTING_DRAG",
  "OVERDUE_FOLLOWUPS",
  "STALE_CV",
]

const HEALTHY_INSTRUCTION = "Your pipeline looks healthy — keep it up"

// ───────────────────────────────────────────────────────────────────────────
//   Indicator evaluators
// ───────────────────────────────────────────────────────────────────────────

const STALE_VITALITY_STATES: ReadonlySet<VitalityState> = new Set([
  "COLD",
  "COOLING",
  "GHOSTING",
])

function evaluateLowPipelineRatio(inputs: HealthScoreInputs): boolean {
  const total = inputs.activeListings.length
  if (total === 0) return false
  const stale = inputs.activeListings.filter((l) =>
    STALE_VITALITY_STATES.has(l.vitalityState),
  ).length
  return stale / total > PIPELINE_STALE_RATIO
}

function evaluateLowRecentActivity(inputs: HealthScoreInputs): boolean {
  const windowStart =
    inputs.now.getTime() - RECENT_ACTIVITY_WINDOW_DAYS * MS_PER_DAY
  const recentCount = inputs.applications.filter(
    (a) => a.appliedAt.getTime() >= windowStart,
  ).length
  return recentCount < RECENT_ACTIVITY_MIN_APPLICATIONS
}

function evaluateHighGhostingDrag(inputs: HealthScoreInputs): boolean {
  const ghosting = inputs.activeListings.filter(
    (l) => l.vitalityState === "GHOSTING",
  ).length
  return ghosting > GHOSTING_DRAG_MIN
}

function findFirstOverdueFollowup(
  inputs: HealthScoreInputs,
): { title: string; company: string } | null {
  for (const listing of inputs.activeListings) {
    if (
      isFollowUpDue({
        application: listing.application
          ? {
              status: listing.application.status,
              updatedAt: listing.application.updatedAt,
            }
          : null,
        archived: false,
        thresholdDays: inputs.followUpThresholdDays,
        now: inputs.now,
      })
    ) {
      return { title: listing.title, company: listing.company }
    }
  }
  return null
}

function evaluateStaleCv(inputs: HealthScoreInputs): boolean {
  if (!inputs.mostRecentCvUploadedAt) return false
  const days =
    (inputs.now.getTime() - inputs.mostRecentCvUploadedAt.getTime()) /
    MS_PER_DAY
  return days > STALE_CV_DAYS
}

// ───────────────────────────────────────────────────────────────────────────
//   Pure entry point
// ───────────────────────────────────────────────────────────────────────────

export function computeHealthScore(
  inputs: HealthScoreInputs,
): HealthScoreResult {
  const overdue = findFirstOverdueFollowup(inputs)

  const fired = new Set<HealthIndicatorId>()
  if (evaluateLowPipelineRatio(inputs)) fired.add("LOW_PIPELINE_RATIO")
  if (evaluateLowRecentActivity(inputs)) fired.add("LOW_RECENT_ACTIVITY")
  if (evaluateHighGhostingDrag(inputs)) fired.add("HIGH_GHOSTING_DRAG")
  if (overdue !== null) fired.add("OVERDUE_FOLLOWUPS")
  if (evaluateStaleCv(inputs)) fired.add("STALE_CV")

  const score = Math.max(0, 100 - fired.size * INDICATOR_WEIGHT)
  const zone: CoachingZone =
    score >= 70 ? "GREEN" : score >= 40 ? "YELLOW" : "RED"

  let activeIndicator: HealthIndicatorId | null = null
  for (const candidate of PRIORITY_ORDER) {
    if (fired.has(candidate)) {
      activeIndicator = candidate
      break
    }
  }

  let coachingInstruction = HEALTHY_INSTRUCTION
  if (activeIndicator !== null) {
    coachingInstruction = instructionFor(activeIndicator, overdue)
  }

  return { score, zone, activeIndicator, coachingInstruction }
}

function instructionFor(
  id: HealthIndicatorId,
  overdue: { title: string; company: string } | null,
): string {
  switch (id) {
    case "LOW_PIPELINE_RATIO":
      return "Add fresh listings — your board has too many stale jobs"
    case "LOW_RECENT_ACTIVITY":
      return "Apply to 2 more jobs this week"
    case "HIGH_GHOSTING_DRAG":
      return "Archive your ghosted applications"
    case "OVERDUE_FOLLOWUPS":
      // overdue is guaranteed non-null here because evaluateOverdueFollowups
      // is the rule that adds OVERDUE_FOLLOWUPS to the fired set.
      return overdue
        ? `Follow up on ${overdue.title} (${overdue.company}) today`
        : "Follow up on your overdue applications today"
    case "STALE_CV":
      return "Your CV hasn't been updated in 30+ days — review it"
  }
}

// ───────────────────────────────────────────────────────────────────────────
//   Prisma wrapper — fetches data and calls the pure engine
// ───────────────────────────────────────────────────────────────────────────

/**
 * Server-side wrapper: fetches the inputs the engine needs and returns the
 * `HealthScoreResult`. Read-only (the engine itself is pure). Keep this in
 * a Server Component or Server Action; do not call from the browser.
 */
export async function getHealthScoreForUser(
  userId: string,
): Promise<HealthScoreResult> {
  const now = new Date()

  const [listings, applications, latestCv, threshold] = await Promise.all([
    prisma.jobListing.findMany({
      where: { userId, archived: false, deletedAt: null },
      select: {
        title: true,
        company: true,
        vitalityState: true,
        application: {
          select: { status: true, updatedAt: true, appliedAt: true },
        },
      },
    }),
    prisma.application.findMany({
      where: { userId },
      select: { appliedAt: true },
    }),
    prisma.cvVersion.findFirst({
      where: { userId },
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true },
    }),
    getFollowUpThresholdDays(),
  ])

  return computeHealthScore({
    activeListings: listings.map((l) => ({
      title: l.title,
      company: l.company,
      vitalityState: l.vitalityState,
      archived: false,
      application: l.application,
    })),
    applications,
    mostRecentCvUploadedAt: latestCv?.uploadedAt ?? null,
    followUpThresholdDays: threshold,
    now,
  })
}
