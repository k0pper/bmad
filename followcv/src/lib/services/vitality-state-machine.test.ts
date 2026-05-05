import { describe, it, expect } from "vitest"
import { computeVitalityState } from "./vitality-state-machine"
import type { VitalityInputs } from "./vitality-state-machine"

const now = new Date("2025-06-15T12:00:00Z")

function inputs(overrides: Partial<VitalityInputs> = {}): VitalityInputs {
  return {
    postedAt: null,
    closingDate: null,
    application: null,
    gmailSignalAt: null,
    overrideState: null,
    overrideSource: null,
    isArchived: false,
    now,
    ...overrides,
  }
}

describe("computeVitalityState", () => {
  describe("Rule 1: isArchived", () => {
    it("returns null (skip) when archived", () => {
      expect(computeVitalityState(inputs({ isArchived: true }))).toBeNull()
    })

    it("still evaluates when not archived", () => {
      expect(computeVitalityState(inputs({ isArchived: false }))).not.toBeNull()
    })
  })

  describe("Rule 2: application rejected or withdrawn", () => {
    it("returns CLOSED when application status is REJECTED", () => {
      const result = computeVitalityState(
        inputs({ application: { appliedAt: new Date("2025-06-01T12:00:00Z"), status: "REJECTED" } })
      )
      expect(result).toBe("CLOSED")
    })

    it("returns CLOSED when application status is WITHDRAWN", () => {
      const result = computeVitalityState(
        inputs({ application: { appliedAt: new Date("2025-06-01T12:00:00Z"), status: "WITHDRAWN" } })
      )
      expect(result).toBe("CLOSED")
    })
  })

  describe("Rule 3: USER override", () => {
    it("returns overrideState when overrideSource is USER", () => {
      const result = computeVitalityState(
        inputs({ overrideSource: "USER", overrideState: "HOT" })
      )
      expect(result).toBe("HOT")
    })

    it("USER override wins even if application is rejected", () => {
      const result = computeVitalityState(
        inputs({
          overrideSource: "USER",
          overrideState: "ACTIVE",
          application: { appliedAt: new Date("2025-06-01T12:00:00Z"), status: "REJECTED" },
        })
      )
      // Rule 2 fires first — rejected beats user override
      expect(result).toBe("CLOSED")
    })
  })

  describe("Rule 4: DEADLINE (closing within 48h)", () => {
    it("returns DEADLINE when closing in 24h", () => {
      const closingDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ closingDate }))).toBe("DEADLINE")
    })

    it("returns DEADLINE when closing in exactly 48h", () => {
      const closingDate = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ closingDate }))).toBe("DEADLINE")
    })

    it("does not return DEADLINE when closing in 49h", () => {
      const closingDate = new Date(now.getTime() + 49 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ closingDate }))).not.toBe("DEADLINE")
    })

    it("does not return DEADLINE when closing date is in the past", () => {
      const closingDate = new Date(now.getTime() - 1 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ closingDate }))).not.toBe("DEADLINE")
    })
  })

  describe("Rule 5: IN_DIALOGUE", () => {
    it("returns IN_DIALOGUE when gmail signal is after appliedAt", () => {
      const appliedAt = new Date("2025-06-01T12:00:00Z")
      const gmailSignalAt = new Date("2025-06-05T12:00:00Z")
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "APPLIED" }, gmailSignalAt })
      )
      expect(result).toBe("IN_DIALOGUE")
    })

    it("does not return IN_DIALOGUE when gmail signal is before appliedAt", () => {
      const appliedAt = new Date("2025-06-05T12:00:00Z")
      const gmailSignalAt = new Date("2025-06-01T12:00:00Z")
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "APPLIED" }, gmailSignalAt })
      )
      expect(result).not.toBe("IN_DIALOGUE")
    })
  })

  describe("Rule 6: GHOSTING (14+ days since application, still Applied)", () => {
    it("returns GHOSTING when applied 15 days ago with APPLIED status", () => {
      const appliedAt = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "APPLIED" } })
      )
      expect(result).toBe("GHOSTING")
    })

    it("does not return GHOSTING when applied 13 days ago", () => {
      const appliedAt = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "APPLIED" } })
      )
      expect(result).not.toBe("GHOSTING")
    })

    it("does not return GHOSTING when status is INTERVIEWING (not APPLIED)", () => {
      const appliedAt = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "INTERVIEWING" } })
      )
      expect(result).not.toBe("GHOSTING")
    })
  })

  describe("Rule 7: ACTIVE (applied, interviewing, on hold)", () => {
    it("returns ACTIVE for APPLIED status (recent)", () => {
      const appliedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "APPLIED" } })
      )
      expect(result).toBe("ACTIVE")
    })

    it("returns ACTIVE for INTERVIEWING", () => {
      const appliedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "INTERVIEWING" } })
      )
      expect(result).toBe("ACTIVE")
    })

    it("returns ACTIVE for ON_HOLD", () => {
      const appliedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const result = computeVitalityState(
        inputs({ application: { appliedAt, status: "ON_HOLD" } })
      )
      expect(result).toBe("ACTIVE")
    })
  })

  describe("Rule 8: HOT (posted ≤7 days ago)", () => {
    it("returns HOT when posted 5 days ago", () => {
      const postedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ postedAt }))).toBe("HOT")
    })

    it("returns HOT when posted exactly 7 days ago", () => {
      const postedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ postedAt }))).toBe("HOT")
    })

    it("does not return HOT when posted 8 days ago", () => {
      const postedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ postedAt }))).not.toBe("HOT")
    })
  })

  describe("Rule 9: COOLING (8–21 days since posting)", () => {
    it("returns COOLING when posted 8 days ago", () => {
      const postedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ postedAt }))).toBe("COOLING")
    })

    it("returns COOLING when posted 21 days ago", () => {
      const postedAt = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ postedAt }))).toBe("COOLING")
    })
  })

  describe("Rule 10: COLD (posted >21 days ago)", () => {
    it("returns COLD when posted 22 days ago", () => {
      const postedAt = new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ postedAt }))).toBe("COLD")
    })

    it("returns COLD when posted 60 days ago", () => {
      const postedAt = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
      expect(computeVitalityState(inputs({ postedAt }))).toBe("COLD")
    })
  })

  describe("Rule 11: COOLING fallback (postedAt null)", () => {
    it("returns COOLING when postedAt is null and no other signals", () => {
      expect(computeVitalityState(inputs({ postedAt: null }))).toBe("COOLING")
    })
  })
})
