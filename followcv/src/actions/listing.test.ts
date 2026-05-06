import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))
vi.mock("@/lib/services/vitality-state-machine", () => ({
  computeVitalityState: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

import {
  overrideVitality,
  clearVitalityOverride,
  undoVitalityOverride,
  archiveListing,
  unarchiveListing,
  updateListing,
} from "./listing"
import { auth } from "@/lib/auth"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"
import { prisma } from "@/lib/db"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockResolvedValue: (v: any) => void
}
const mockCompute = vi.mocked(computeVitalityState)

type MockPrisma = {
  jobListing: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  auditLog: {
    create: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
  }
}
const mockPrisma = prisma as unknown as MockPrisma

const validSession = { user: { id: "user-1" } }
const otherSession = { user: { id: "user-2" } }

const baseListing = {
  id: "listing-1",
  userId: "user-1",
  title: "Senior Engineer",
  company: "Acme",
  location: "Remote",
  salaryMin: 100000,
  salaryMax: 150000,
  salaryCurrency: "USD",
  sourceUrl: null,
  notes: null,
  importSource: "MANUAL",
  vitalityState: "HOT",
  overrideState: null,
  overrideSource: null,
  archived: false,
  stateChangedAt: new Date("2026-05-01T00:00:00Z"),
  lastComputedAt: new Date("2026-05-05T00:00:00Z"),
  postedAt: new Date("2026-05-01T00:00:00Z"),
  closingDate: null,
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.auditLog.create.mockResolvedValue({})
})

describe("overrideVitality", () => {
  it("rejects unauthenticated callers", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await overrideVitality("listing-1", "IN_DIALOGUE")
    expect(result).toEqual({ data: null, error: "Unauthorized" })
    expect(mockPrisma.jobListing.findFirst).not.toHaveBeenCalled()
  })

  it("rejects when the listing belongs to another user", async () => {
    mockAuth.mockResolvedValue(otherSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue(null)
    const result = await overrideVitality("listing-1", "IN_DIALOGUE")
    expect(result).toEqual({ data: null, error: "Listing not found" })
    expect(mockPrisma.jobListing.findFirst).toHaveBeenCalledWith({
      where: { id: "listing-1", userId: "user-2", deletedAt: null },
    })
  })

  it("writes the override fields and returns the pre-override snapshot", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue(baseListing)

    const result = await overrideVitality("listing-1", "IN_DIALOGUE")

    expect(result.error).toBeNull()
    expect(result.data?.snapshot).toEqual({
      vitalityState: "HOT",
      overrideState: null,
      overrideSource: null,
      stateChangedAt: baseListing.stateChangedAt,
    })

    const updateCall = mockPrisma.jobListing.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: "listing-1" })
    expect(updateCall.data).toMatchObject({
      vitalityState: "IN_DIALOGUE",
      overrideState: "IN_DIALOGUE",
      overrideSource: "USER",
    })
    expect(updateCall.data.stateChangedAt).toBeInstanceOf(Date)
    expect(updateCall.data.lastComputedAt).toBeInstanceOf(Date)
  })

  it("writes a USER_OVERRIDE audit log with previous and new states", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue(baseListing)

    await overrideVitality("listing-1", "IN_DIALOGUE")

    const auditCall = mockPrisma.auditLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({
      source: "USER_OVERRIDE",
      userId: "user-1",
      listingId: "listing-1",
      previousState: "HOT",
      newState: "IN_DIALOGUE",
    })
  })

  it("does not throw when audit log creation fails", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue(baseListing)
    mockPrisma.auditLog.create.mockRejectedValue(new Error("audit log down"))

    const result = await overrideVitality("listing-1", "IN_DIALOGUE")
    expect(result.error).toBeNull()
  })
})

describe("clearVitalityOverride", () => {
  it("clears override fields, recomputes state, and writes USER_OVERRIDE_CLEARED audit log", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue({
      ...baseListing,
      vitalityState: "IN_DIALOGUE",
      overrideState: "IN_DIALOGUE",
      overrideSource: "USER",
      application: null,
    })
    mockPrisma.auditLog.findFirst.mockResolvedValue(null)
    mockCompute.mockReturnValue("HOT")

    const result = await clearVitalityOverride("listing-1")

    expect(result.error).toBeNull()
    expect(result.data?.newState).toBe("HOT")
    expect(result.data?.snapshot).toMatchObject({
      vitalityState: "IN_DIALOGUE",
      overrideState: "IN_DIALOGUE",
      overrideSource: "USER",
    })

    const updateCall = mockPrisma.jobListing.update.mock.calls[0][0]
    expect(updateCall.data).toMatchObject({
      overrideState: null,
      overrideSource: null,
      vitalityState: "HOT",
    })
    // State changed (IN_DIALOGUE → HOT) so stateChangedAt is set.
    expect(updateCall.data.stateChangedAt).toBeInstanceOf(Date)

    const auditCall = mockPrisma.auditLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({
      source: "USER_OVERRIDE_CLEARED",
      previousState: "IN_DIALOGUE",
      newState: "HOT",
    })
  })

  it("does not write stateChangedAt when the recomputed state matches the current state", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue({
      ...baseListing,
      vitalityState: "HOT",
      overrideState: "HOT",
      overrideSource: "USER",
      application: null,
    })
    mockPrisma.auditLog.findFirst.mockResolvedValue(null)
    mockCompute.mockReturnValue("HOT")

    await clearVitalityOverride("listing-1")

    const updateCall = mockPrisma.jobListing.update.mock.calls[0][0]
    expect(updateCall.data.stateChangedAt).toBeUndefined()
  })
})

describe("undoVitalityOverride", () => {
  it("restores the snapshot fields and writes USER_OVERRIDE audit log with undo metadata", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue({
      ...baseListing,
      vitalityState: "IN_DIALOGUE",
      overrideState: "IN_DIALOGUE",
      overrideSource: "USER",
    })

    const snapshot = {
      vitalityState: "HOT" as const,
      overrideState: null,
      overrideSource: null,
      stateChangedAt: new Date("2026-04-01T00:00:00Z"),
    }

    const result = await undoVitalityOverride("listing-1", snapshot)

    expect(result.error).toBeNull()

    const updateCall = mockPrisma.jobListing.update.mock.calls[0][0]
    expect(updateCall.data).toMatchObject({
      vitalityState: "HOT",
      overrideState: null,
      overrideSource: null,
      stateChangedAt: snapshot.stateChangedAt,
    })

    const auditCall = mockPrisma.auditLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({
      source: "USER_OVERRIDE",
      previousState: "IN_DIALOGUE",
      newState: "HOT",
      metadata: { undo: true },
    })
  })
})

describe("archiveListing / unarchiveListing", () => {
  it("archives a listing after verifying ownership", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue({ id: "listing-1" })

    const result = await archiveListing("listing-1")

    expect(result.error).toBeNull()
    expect(mockPrisma.jobListing.findFirst).toHaveBeenCalledWith({
      where: { id: "listing-1", userId: "user-1", deletedAt: null },
      select: { id: true },
    })
    expect(mockPrisma.jobListing.update).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { archived: true },
    })
  })

  it("returns an error when the listing is not found", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue(null)

    const result = await archiveListing("listing-1")
    expect(result).toEqual({ data: null, error: "Listing not found" })
    expect(mockPrisma.jobListing.update).not.toHaveBeenCalled()
  })

  it("unarchives a listing", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue({ id: "listing-1" })

    const result = await unarchiveListing("listing-1")
    expect(result.error).toBeNull()
    expect(mockPrisma.jobListing.update).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { archived: false },
    })
  })
})

describe("updateListing", () => {
  function makeFormData(values: Record<string, string>): FormData {
    const fd = new FormData()
    for (const [k, v] of Object.entries(values)) fd.append(k, v)
    return fd
  }

  it("validates required fields", async () => {
    mockAuth.mockResolvedValue(validSession)
    const result = await updateListing("listing-1", makeFormData({ title: "", company: "Acme" }))
    expect(result.error).not.toBeNull()
    expect(mockPrisma.jobListing.update).not.toHaveBeenCalled()
  })

  it("rejects salaryMax less than salaryMin", async () => {
    mockAuth.mockResolvedValue(validSession)
    const result = await updateListing(
      "listing-1",
      makeFormData({
        title: "Senior Engineer",
        company: "Acme",
        salaryMin: "200000",
        salaryMax: "100000",
      })
    )
    expect(result.error).not.toBeNull()
  })

  it("writes parsed fields after verifying ownership", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue({ id: "listing-1" })

    const result = await updateListing(
      "listing-1",
      makeFormData({
        title: "Staff Engineer",
        company: "Acme",
        location: "Berlin",
        salaryMin: "100000",
        salaryMax: "150000",
        salaryCurrency: "EUR",
        notes: "Strong fit",
      })
    )

    expect(result.error).toBeNull()
    expect(mockPrisma.jobListing.findFirst).toHaveBeenCalledWith({
      where: { id: "listing-1", userId: "user-1", deletedAt: null },
      select: { id: true },
    })
    const call = mockPrisma.jobListing.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: "listing-1" })
    expect(call.data).toMatchObject({
      title: "Staff Engineer",
      company: "Acme",
      location: "Berlin",
      salaryMin: 100000,
      salaryMax: 150000,
      salaryCurrency: "EUR",
      notes: "Strong fit",
    })
  })

  it("returns an error when no listing matches the user", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockPrisma.jobListing.findFirst.mockResolvedValue(null)
    const result = await updateListing(
      "listing-1",
      makeFormData({ title: "Staff Engineer", company: "Acme" })
    )
    expect(result).toEqual({ data: null, error: "Listing not found" })
    expect(mockPrisma.jobListing.update).not.toHaveBeenCalled()
  })
})
