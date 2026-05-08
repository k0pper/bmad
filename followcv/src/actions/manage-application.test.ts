import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    application: {
      update: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
    },
  },
}))

import {
  updateApplicationStatus,
  updateApplicationNotes,
  updateListingNotes,
} from "./manage-application"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>

type MockPrisma = {
  jobListing: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  application: { update: ReturnType<typeof vi.fn> }
  auditLog: { findFirst: ReturnType<typeof vi.fn> }
}
const mock = prisma as unknown as MockPrisma

const baseListing = {
  id: "listing-1",
  userId: "user-1",
  archived: false,
  vitalityState: "ACTIVE" as const,
  overrideState: null,
  overrideSource: null,
  postedAt: new Date("2026-04-15"),
  closingDate: null,
  application: {
    id: "app-1",
    appliedAt: new Date("2026-05-01"),
    status: "APPLIED" as const,
    notes: null,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "user-1" } })
  mock.auditLog.findFirst.mockResolvedValue(null)
})

describe("updateApplicationStatus", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await updateApplicationStatus({
      listingId: "listing-1",
      status: "INTERVIEWING",
    })
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("rejects an unknown status", async () => {
    const r = await updateApplicationStatus({
      listingId: "listing-1",
      status: "BOGUS" as never,
    })
    expect(r).toEqual({ data: null, error: "Invalid status" })
  })

  it("returns Not found for a listing the user doesn't own", async () => {
    mock.jobListing.findFirst.mockResolvedValue(null)
    const r = await updateApplicationStatus({
      listingId: "listing-x",
      status: "INTERVIEWING",
    })
    expect(r).toEqual({ data: null, error: "Not found" })
  })

  it("rejects when no Application is recorded for the listing", async () => {
    mock.jobListing.findFirst.mockResolvedValue({
      ...baseListing,
      application: null,
    })
    const r = await updateApplicationStatus({
      listingId: "listing-1",
      status: "INTERVIEWING",
    })
    expect(r).toEqual({
      data: null,
      error: "No application recorded for this listing",
    })
    expect(mock.application.update).not.toHaveBeenCalled()
  })

  it("updates status and recomputes vitality (REJECTED → CLOSED)", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.application.update.mockResolvedValue({})
    mock.jobListing.update.mockResolvedValue({})

    const r = await updateApplicationStatus({
      listingId: "listing-1",
      status: "REJECTED",
    })

    expect(r).toEqual({ data: { vitalityState: "CLOSED" }, error: null })
    expect(mock.application.update).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { status: "REJECTED" },
    })
    const update = mock.jobListing.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: "listing-1" })
    expect(update.data.vitalityState).toBe("CLOSED")
    expect(update.data.stateChangedAt).toBeInstanceOf(Date)
    expect(update.data.lastComputedAt).toBeInstanceOf(Date)
  })

  it("only writes lastComputedAt when state is unchanged (INTERVIEWING stays ACTIVE)", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.application.update.mockResolvedValue({})
    mock.jobListing.update.mockResolvedValue({})

    const r = await updateApplicationStatus({
      listingId: "listing-1",
      status: "INTERVIEWING",
    })

    expect(r).toEqual({ data: { vitalityState: "ACTIVE" }, error: null })
    const update = mock.jobListing.update.mock.calls[0][0]
    expect(update.data.vitalityState).toBeUndefined()
    expect(update.data.stateChangedAt).toBeUndefined()
    expect(update.data.lastComputedAt).toBeInstanceOf(Date)
  })

  it("vitality update miss is acceptable — returns success", async () => {
    mock.jobListing.findFirst.mockResolvedValue(baseListing)
    mock.application.update.mockResolvedValue({})
    mock.jobListing.update.mockRejectedValue(new Error("network"))

    const r = await updateApplicationStatus({
      listingId: "listing-1",
      status: "REJECTED",
    })
    expect(r).toEqual({ data: { vitalityState: "CLOSED" }, error: null })
  })
})

describe("updateApplicationNotes", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await updateApplicationNotes({
      listingId: "listing-1",
      notes: "x",
    })
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("rejects notes over 5000 characters", async () => {
    const r = await updateApplicationNotes({
      listingId: "listing-1",
      notes: "x".repeat(5001),
    })
    expect(r.error).toMatch(/too long/)
  })

  it("returns Not found when the listing is missing or has no application", async () => {
    mock.jobListing.findFirst.mockResolvedValue(null)
    const r = await updateApplicationNotes({
      listingId: "listing-1",
      notes: "hi",
    })
    expect(r).toEqual({ data: null, error: "Not found" })
  })

  it("trims and saves; returns ok on the happy path", async () => {
    mock.jobListing.findFirst.mockResolvedValue({
      application: { id: "app-1" },
    })
    mock.application.update.mockResolvedValue({})

    const r = await updateApplicationNotes({
      listingId: "listing-1",
      notes: "  fingers crossed  ",
    })

    expect(r).toEqual({ data: { ok: true }, error: null })
    expect(mock.application.update).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { notes: "fingers crossed" },
    })
  })

  it("stores null when notes are empty after trim", async () => {
    mock.jobListing.findFirst.mockResolvedValue({
      application: { id: "app-1" },
    })
    mock.application.update.mockResolvedValue({})

    await updateApplicationNotes({ listingId: "listing-1", notes: "   " })

    expect(mock.application.update).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { notes: null },
    })
  })
})

describe("updateListingNotes", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await updateListingNotes({ listingId: "listing-1", notes: "x" })
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("rejects notes over 5000 characters", async () => {
    const r = await updateListingNotes({
      listingId: "listing-1",
      notes: "x".repeat(5001),
    })
    expect(r.error).toMatch(/too long/)
  })

  it("returns Not found when the listing is missing", async () => {
    mock.jobListing.findFirst.mockResolvedValue(null)
    const r = await updateListingNotes({ listingId: "listing-x", notes: "hi" })
    expect(r).toEqual({ data: null, error: "Not found" })
  })

  it("trims and saves; returns ok on the happy path", async () => {
    mock.jobListing.findFirst.mockResolvedValue({ id: "listing-1" })
    mock.jobListing.update.mockResolvedValue({})

    const r = await updateListingNotes({
      listingId: "listing-1",
      notes: "  reach out via LinkedIn  ",
    })

    expect(r).toEqual({ data: { ok: true }, error: null })
    expect(mock.jobListing.update).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { notes: "reach out via LinkedIn" },
    })
  })

  it("stores null when notes are empty after trim", async () => {
    mock.jobListing.findFirst.mockResolvedValue({ id: "listing-1" })
    mock.jobListing.update.mockResolvedValue({})

    await updateListingNotes({ listingId: "listing-1", notes: "" })

    expect(mock.jobListing.update).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { notes: null },
    })
  })
})
