import { describe, it, expect } from "vitest"
import {
  computeHealthScore,
  type HealthScoreInputs,
} from "./health-score-engine"
import type { ApplicationStatus, VitalityState } from "@/generated/prisma/client"

const NOW = new Date("2026-05-08T12:00:00Z")
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function makeListing(overrides: {
  vitalityState: VitalityState
  applicationStatus?: ApplicationStatus | null
  applicationUpdatedAt?: Date
  applicationAppliedAt?: Date
  title?: string
  company?: string
}): HealthScoreInputs["activeListings"][number] {
  return {
    archived: false,
    vitalityState: overrides.vitalityState,
    title: overrides.title ?? "Some role",
    company: overrides.company ?? "Some co",
    application:
      overrides.applicationStatus !== undefined &&
      overrides.applicationStatus !== null
        ? {
            status: overrides.applicationStatus,
            updatedAt: overrides.applicationUpdatedAt ?? daysAgo(1),
            appliedAt: overrides.applicationAppliedAt ?? daysAgo(1),
          }
        : null,
  }
}

const baseInputs: HealthScoreInputs = {
  activeListings: [],
  applications: [],
  mostRecentCvUploadedAt: daysAgo(5),
  followUpThresholdDays: 7,
  now: NOW,
}

describe("computeHealthScore — empty / healthy state", () => {
  it("returns the healthy default when nothing fires", () => {
    // 1 active listing, recent applications, fresh CV, no overdue, no ghosting
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [makeListing({ vitalityState: "ACTIVE" })],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    expect(result.score).toBe(100)
    expect(result.zone).toBe("GREEN")
    expect(result.activeIndicator).toBeNull()
    expect(result.coachingInstruction).toMatch(/healthy/i)
  })

  it("does NOT fire LOW_PIPELINE_RATIO when there are zero listings", () => {
    // Avoids divide-by-zero / "stale" classification of an empty board.
    const result = computeHealthScore(baseInputs)
    expect(result.activeIndicator).toBe("LOW_RECENT_ACTIVITY")
    // LOW_RECENT_ACTIVITY fires (no apps); STALE_CV doesn't (CV is fresh);
    // LOW_PIPELINE_RATIO doesn't (no listings).
    expect(result.score).toBe(80)
  })
})

describe("LOW_PIPELINE_RATIO", () => {
  it("fires when >60% of active listings are stale", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "COLD" }),
        makeListing({ vitalityState: "COOLING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "HOT" }), // 1/4 fresh = 75% stale
      ],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    expect(result.activeIndicator).toBe("LOW_PIPELINE_RATIO")
    expect(result.coachingInstruction).toMatch(/Add fresh listings/)
  })

  it("does not fire at exactly 60% (strictly greater)", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "COLD" }),
        makeListing({ vitalityState: "COOLING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "HOT" }),
        makeListing({ vitalityState: "ACTIVE" }), // 3/5 = 60% exactly
      ],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    expect(result.activeIndicator).not.toBe("LOW_PIPELINE_RATIO")
  })
})

describe("LOW_RECENT_ACTIVITY", () => {
  it("fires when fewer than 2 applications happened in the last 7 days", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [makeListing({ vitalityState: "HOT" })],
      applications: [{ appliedAt: daysAgo(1) }], // only 1 in window
    })
    expect(result.activeIndicator).toBe("LOW_RECENT_ACTIVITY")
    expect(result.coachingInstruction).toMatch(/Apply to 2 more jobs/)
  })

  it("ignores older applications when counting the window", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [makeListing({ vitalityState: "HOT" })],
      applications: [
        { appliedAt: daysAgo(8) },
        { appliedAt: daysAgo(9) },
        { appliedAt: daysAgo(10) },
      ],
    })
    expect(result.activeIndicator).toBe("LOW_RECENT_ACTIVITY")
  })

  it("does not fire with exactly 2 in the last 7 days", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [makeListing({ vitalityState: "HOT" })],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(3) },
      ],
    })
    expect(result.activeIndicator).toBeNull()
  })
})

describe("HIGH_GHOSTING_DRAG", () => {
  it("fires when more than 3 listings are GHOSTING", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }), // 4 ghosting
        makeListing({ vitalityState: "ACTIVE" }),
        // Pad with fresh ACTIVE listings so LOW_PIPELINE_RATIO doesn't take
        // priority. 4/8 = 50% stale = under threshold.
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
      ],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    expect(result.activeIndicator).toBe("HIGH_GHOSTING_DRAG")
    expect(result.coachingInstruction).toMatch(/Archive your ghosted/)
  })

  it("does not fire with exactly 3 GHOSTING listings", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
      ],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    expect(result.activeIndicator).not.toBe("HIGH_GHOSTING_DRAG")
  })
})

describe("OVERDUE_FOLLOWUPS", () => {
  it("fires and names the specific listing", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({
          vitalityState: "ACTIVE",
          applicationStatus: "APPLIED",
          applicationUpdatedAt: daysAgo(10),
          title: "Senior Frontend",
          company: "Acme",
        }),
      ],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    expect(result.activeIndicator).toBe("OVERDUE_FOLLOWUPS")
    expect(result.coachingInstruction).toBe(
      "Follow up on Senior Frontend (Acme) today",
    )
  })

  it("never names a listing on an unrelated indicator", () => {
    // No overdue followups, but other indicators fire
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }), // ghosting fires
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
        makeListing({ vitalityState: "ACTIVE" }),
      ],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    // HIGH_GHOSTING_DRAG fires; the message should not name a listing.
    expect(result.activeIndicator).toBe("HIGH_GHOSTING_DRAG")
    expect(result.coachingInstruction).not.toMatch(/Acme|Senior Frontend/)
  })
})

describe("STALE_CV", () => {
  it("fires when most recent CV is older than 30 days", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [makeListing({ vitalityState: "HOT" })],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
      mostRecentCvUploadedAt: daysAgo(31),
    })
    expect(result.activeIndicator).toBe("STALE_CV")
    expect(result.coachingInstruction).toMatch(/CV hasn't been updated/)
  })

  it("does not fire when there is no CV at all (engine doesn't pretend old)", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [makeListing({ vitalityState: "HOT" })],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
      mostRecentCvUploadedAt: null,
    })
    // No indicators fire.
    expect(result.activeIndicator).toBeNull()
  })
})

describe("priority ordering", () => {
  it("LOW_PIPELINE_RATIO beats LOW_RECENT_ACTIVITY when both fire", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "COLD" }),
        makeListing({ vitalityState: "COOLING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "HOT" }),
      ],
      applications: [], // 0 in window
    })
    expect(result.activeIndicator).toBe("LOW_PIPELINE_RATIO")
  })

  it("OVERDUE_FOLLOWUPS beats STALE_CV when both fire", () => {
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({
          vitalityState: "ACTIVE",
          applicationStatus: "APPLIED",
          applicationUpdatedAt: daysAgo(10),
        }),
      ],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
      mostRecentCvUploadedAt: daysAgo(40),
    })
    expect(result.activeIndicator).toBe("OVERDUE_FOLLOWUPS")
  })

  it("score reflects breadth (multiple firing → lower score)", () => {
    // Three indicators fire: LOW_PIPELINE_RATIO, LOW_RECENT_ACTIVITY, STALE_CV
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "COLD" }),
        makeListing({ vitalityState: "COOLING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "HOT" }),
      ],
      applications: [],
      mostRecentCvUploadedAt: daysAgo(40),
    })
    expect(result.score).toBe(40)
    expect(result.zone).toBe("YELLOW")
  })
})

describe("zone bands", () => {
  it("≥70 → GREEN", () => {
    // No indicators fire
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [makeListing({ vitalityState: "HOT" })],
      applications: [
        { appliedAt: daysAgo(1) },
        { appliedAt: daysAgo(2) },
      ],
    })
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.zone).toBe("GREEN")
  })

  it("40–69 → YELLOW", () => {
    // Three indicators fire (60-point deduction → 40)
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "COLD" }),
        makeListing({ vitalityState: "COOLING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "HOT" }),
      ],
      applications: [],
      mostRecentCvUploadedAt: daysAgo(40),
    })
    expect(result.score).toBe(40)
    expect(result.zone).toBe("YELLOW")
  })

  it("<40 → RED", () => {
    // Five indicators fire (100-point deduction → 0)
    const result = computeHealthScore({
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({
          vitalityState: "GHOSTING",
          applicationStatus: "APPLIED",
          applicationUpdatedAt: daysAgo(20),
        }),
      ],
      applications: [],
      mostRecentCvUploadedAt: daysAgo(45),
    })
    expect(result.score).toBeLessThan(40)
    expect(result.zone).toBe("RED")
  })
})

describe("purity", () => {
  it("does not mutate its inputs", () => {
    const inputs: HealthScoreInputs = {
      ...baseInputs,
      activeListings: [
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
        makeListing({ vitalityState: "GHOSTING" }),
      ],
      applications: [],
    }
    const snapshot = JSON.parse(JSON.stringify(inputs))
    computeHealthScore(inputs)
    expect(JSON.parse(JSON.stringify(inputs))).toEqual(snapshot)
  })
})
