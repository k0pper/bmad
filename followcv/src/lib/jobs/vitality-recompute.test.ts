import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: { findMany: vi.fn(), update: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock("@/lib/services/vitality-state-machine", () => ({
  computeVitalityState: vi.fn(),
}))

import { handleVitalityRecompute } from "./vitality-recompute"
import { prisma } from "@/lib/db"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"

const mockPrisma = prisma as unknown as {
  jobListing: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  auditLog: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
}
const mockCompute = vi.mocked(computeVitalityState)

function makeListing(overrides: Partial<{
  id: string; userId: string; vitalityState: string; archived: boolean;
  postedAt: Date | null; closingDate: Date | null; application: null | object;
  overrideState: null; overrideSource: null;
}> = {}) {
  return {
    id: "listing-1",
    userId: "user-1",
    vitalityState: "COOLING",
    archived: false,
    deletedAt: null,
    postedAt: null,
    closingDate: null,
    application: null,
    overrideState: null,
    overrideSource: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.auditLog.findMany.mockResolvedValue([])
  mockPrisma.jobListing.update.mockResolvedValue({})
  mockPrisma.auditLog.create.mockResolvedValue({})
})

describe("handleVitalityRecompute", () => {
  it("returns zero counts when no listings exist", async () => {
    mockPrisma.jobListing.findMany.mockResolvedValue([])
    const result = await handleVitalityRecompute()
    expect(result).toEqual({ processed: 0, changed: 0, errors: 0 })
  })

  it("updates lastComputedAt even when state is unchanged", async () => {
    mockPrisma.jobListing.findMany.mockResolvedValue([makeListing({ vitalityState: "COOLING" })])
    mockCompute.mockReturnValue("COOLING")

    await handleVitalityRecompute()

    expect(mockPrisma.jobListing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastComputedAt: expect.any(Date) }),
      })
    )
    // stateChangedAt should NOT be in the update when state is unchanged
    const callData = mockPrisma.jobListing.update.mock.calls[0][0].data
    expect(callData.stateChangedAt).toBeUndefined()
  })

  it("updates vitalityState and stateChangedAt when state changes", async () => {
    mockPrisma.jobListing.findMany.mockResolvedValue([makeListing({ vitalityState: "COOLING" })])
    mockCompute.mockReturnValue("COLD")

    const result = await handleVitalityRecompute()

    expect(result.changed).toBe(1)
    expect(mockPrisma.jobListing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vitalityState: "COLD",
          stateChangedAt: expect.any(Date),
          lastComputedAt: expect.any(Date),
        }),
      })
    )
  })

  it("writes audit log entry only when state changes", async () => {
    mockPrisma.jobListing.findMany.mockResolvedValue([makeListing({ vitalityState: "COOLING" })])
    mockCompute.mockReturnValue("COLD")

    await handleVitalityRecompute()

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "SYSTEM_RECOMPUTE",
          previousState: "COOLING",
          newState: "COLD",
        }),
      })
    )
  })

  it("does not write audit log when state is unchanged", async () => {
    mockPrisma.jobListing.findMany.mockResolvedValue([makeListing({ vitalityState: "COOLING" })])
    mockCompute.mockReturnValue("COOLING")

    await handleVitalityRecompute()

    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled()
  })

  it("skips archived listings via the query filter (returns processed=0 for empty result)", async () => {
    // Query already filters archived:false, so archived listings never reach the handler
    mockPrisma.jobListing.findMany.mockResolvedValue([])
    const result = await handleVitalityRecompute()
    expect(result.processed).toBe(0)
  })

  it("skips listing and counts error when computeVitalityState throws", async () => {
    mockPrisma.jobListing.findMany.mockResolvedValue([makeListing()])
    mockCompute.mockImplementation(() => { throw new Error("boom") })

    const result = await handleVitalityRecompute()

    expect(result.errors).toBe(1)
    expect(result.changed).toBe(0)
    expect(mockPrisma.jobListing.update).not.toHaveBeenCalled()
  })

  it("passes gmail signal from auditLog to computeVitalityState", async () => {
    const gmailAt = new Date("2025-06-10T10:00:00Z")
    mockPrisma.jobListing.findMany.mockResolvedValue([makeListing({ id: "l1" })])
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { listingId: "l1", computedAt: gmailAt, source: "GMAIL_SIGNAL" },
    ])
    mockCompute.mockReturnValue("IN_DIALOGUE")

    await handleVitalityRecompute()

    expect(mockCompute).toHaveBeenCalledWith(
      expect.objectContaining({ gmailSignalAt: gmailAt })
    )
  })

  it("processes multiple listings and reports correct counts", async () => {
    mockPrisma.jobListing.findMany.mockResolvedValue([
      makeListing({ id: "l1", vitalityState: "HOT" }),
      makeListing({ id: "l2", vitalityState: "COOLING" }),
      makeListing({ id: "l3", vitalityState: "COLD" }),
    ])
    mockCompute
      .mockReturnValueOnce("COOLING") // l1 changed
      .mockReturnValueOnce("COOLING") // l2 unchanged
      .mockReturnValueOnce("COLD")    // l3 unchanged

    const result = await handleVitalityRecompute()

    expect(result).toEqual({ processed: 3, changed: 1, errors: 0 })
  })
})
