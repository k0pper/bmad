import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@vercel/blob", () => ({ del: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    cvVersion: {
      findFirst: vi.fn(),
    },
    cvSnapshot: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    application: {
      create: vi.fn(),
    },
  },
}))
vi.mock("@/lib/services/cv-snapshot-service", () => ({
  createSnapshot: vi.fn(),
}))

import { applyToJob } from "./apply-to-job"
import { auth } from "@/lib/auth"
import { del } from "@vercel/blob"
import { prisma } from "@/lib/db"
import { createSnapshot } from "@/lib/services/cv-snapshot-service"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockDel = del as unknown as ReturnType<typeof vi.fn>
const mockCreateSnapshot = createSnapshot as unknown as ReturnType<typeof vi.fn>

type MockPrisma = {
  jobListing: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  cvVersion: { findFirst: ReturnType<typeof vi.fn> }
  cvSnapshot: {
    create: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  application: { create: ReturnType<typeof vi.fn> }
}
const mock = prisma as unknown as MockPrisma

const SNAPSHOT_ID = "snapshot-uuid"
const SNAPSHOT_URL = "https://abc.private.blob.vercel-storage.com/cv/user-1/snap.pdf"

const baseListing = {
  id: "listing-1",
  userId: "user-1",
  archived: false,
  vitalityState: "COOLING" as const,
  overrideState: null,
  overrideSource: null,
  postedAt: new Date("2026-04-15"),
  closingDate: null,
  application: null,
}

const baseCv = {
  id: "cv-1",
  s3Key: "https://abc.private.blob.vercel-storage.com/cv-versions/foo.pdf",
}

const validInput = {
  jobListingId: "listing-1",
  cvVersionId: "cv-1",
  appliedAt: new Date("2026-05-08"),
  notes: "fingers crossed",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "user-1" } })
  mockCreateSnapshot.mockResolvedValue({
    snapshotId: SNAPSHOT_ID,
    snapshotUrl: SNAPSHOT_URL,
  })
})

describe("applyToJob", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await applyToJob(validInput)
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns Not found when the listing does not belong to the user", async () => {
    mock.jobListing.findFirst.mockResolvedValue(null)
    const r = await applyToJob(validInput)
    expect(r).toEqual({ data: null, error: "Not found" })
  })

  it("rejects when the listing is archived", async () => {
    mock.jobListing.findFirst.mockResolvedValue({ ...baseListing, archived: true })
    const r = await applyToJob(validInput)
    expect(r).toEqual({
      data: null,
      error: "Cannot apply to an archived listing",
    })
    expect(mockCreateSnapshot).not.toHaveBeenCalled()
  })

  it("rejects when an Application already exists for the listing", async () => {
    mock.jobListing.findFirst.mockResolvedValue({
      ...baseListing,
      application: { id: "app-existing" },
    })
    const r = await applyToJob(validInput)
    expect(r).toEqual({
      data: null,
      error: "You have already applied to this listing.",
    })
    expect(mockCreateSnapshot).not.toHaveBeenCalled()
  })

  it("returns CV version not found when the cvVersionId belongs to another user", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.cvVersion.findFirst.mockResolvedValue(null)
    const r = await applyToJob(validInput)
    expect(r).toEqual({ data: null, error: "CV version not found" })
    expect(mockCreateSnapshot).not.toHaveBeenCalled()
  })

  it("happy path: creates snapshot row, application row, and updates listing to ACTIVE", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.cvVersion.findFirst.mockResolvedValue(baseCv)
    mock.cvSnapshot.create.mockResolvedValue({ id: SNAPSHOT_ID })
    mock.application.create.mockResolvedValue({
      id: "app-1",
      status: "APPLIED",
      appliedAt: validInput.appliedAt,
    })
    mock.jobListing.update.mockResolvedValue({})

    const r = await applyToJob(validInput)

    expect(r).toEqual({
      data: { applicationId: "app-1", vitalityState: "ACTIVE" },
      error: null,
    })

    // Snapshot row created with the snapshot id from the service
    expect(mock.cvSnapshot.create).toHaveBeenCalledWith({
      data: {
        id: SNAPSHOT_ID,
        cvVersionId: "cv-1",
        s3Key: SNAPSHOT_URL,
      },
    })

    // Application links to the snapshot id
    expect(mock.application.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        jobListingId: "listing-1",
        cvSnapshotId: SNAPSHOT_ID,
        appliedAt: validInput.appliedAt,
        notes: "fingers crossed",
        status: "APPLIED",
      },
      select: { id: true, status: true, appliedAt: true },
    })

    // Listing transitions from COOLING -> ACTIVE; stateChangedAt is set.
    const updateCall = mock.jobListing.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: "listing-1" })
    expect(updateCall.data.vitalityState).toBe("ACTIVE")
    expect(updateCall.data.lastComputedAt).toBeInstanceOf(Date)
    expect(updateCall.data.stateChangedAt).toBeInstanceOf(Date)
  })

  it("on snapshot row create failure, deletes the orphan blob", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.cvVersion.findFirst.mockResolvedValue(baseCv)
    mock.cvSnapshot.create.mockRejectedValue(new Error("constraint"))

    const r = await applyToJob(validInput)

    expect(r.error).toBe("Failed to save snapshot record")
    expect(mockDel).toHaveBeenCalledWith(SNAPSHOT_URL)
    expect(mock.application.create).not.toHaveBeenCalled()
  })

  it("on application create failure, deletes both the orphan blob and the snapshot row", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.cvVersion.findFirst.mockResolvedValue(baseCv)
    mock.cvSnapshot.create.mockResolvedValue({ id: SNAPSHOT_ID })
    mock.application.create.mockRejectedValue(new Error("constraint"))

    const r = await applyToJob(validInput)

    expect(r.error).toBe("Failed to save application")
    expect(mockDel).toHaveBeenCalledWith(SNAPSHOT_URL)
    expect(mock.cvSnapshot.delete).toHaveBeenCalledWith({
      where: { id: SNAPSHOT_ID },
    })
  })

  it("vitality update miss is acceptable — returns success anyway", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.cvVersion.findFirst.mockResolvedValue(baseCv)
    mock.cvSnapshot.create.mockResolvedValue({ id: SNAPSHOT_ID })
    mock.application.create.mockResolvedValue({
      id: "app-1",
      status: "APPLIED",
      appliedAt: validInput.appliedAt,
    })
    mock.jobListing.update.mockRejectedValue(new Error("network blip"))

    const r = await applyToJob(validInput)

    expect(r).toEqual({
      data: { applicationId: "app-1", vitalityState: "ACTIVE" },
      error: null,
    })
  })

  it("does NOT include stateChangedAt when the computed state matches the current state", async () => {
    // Listing is already ACTIVE — nothing changes.
    mock.jobListing.findFirst.mockResolvedValue({
      ...baseListing,
      vitalityState: "ACTIVE",
    })
    mock.cvVersion.findFirst.mockResolvedValue(baseCv)
    mock.cvSnapshot.create.mockResolvedValue({ id: SNAPSHOT_ID })
    mock.application.create.mockResolvedValue({
      id: "app-1",
      status: "APPLIED",
      appliedAt: validInput.appliedAt,
    })
    mock.jobListing.update.mockResolvedValue({})

    await applyToJob(validInput)

    const updateCall = mock.jobListing.update.mock.calls[0][0]
    expect(updateCall.data.vitalityState).toBe("ACTIVE")
    expect(updateCall.data.lastComputedAt).toBeInstanceOf(Date)
    expect(updateCall.data.stateChangedAt).toBeUndefined()
  })

  it("on snapshot service failure (blob copy), no DB writes happen", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.cvVersion.findFirst.mockResolvedValue(baseCv)
    mockCreateSnapshot.mockRejectedValue(new Error("read failed"))

    const r = await applyToJob(validInput)

    expect(r.error).toBe("Failed to snapshot CV")
    expect(mock.cvSnapshot.create).not.toHaveBeenCalled()
    expect(mock.application.create).not.toHaveBeenCalled()
    expect(mockDel).not.toHaveBeenCalled()
  })
})
