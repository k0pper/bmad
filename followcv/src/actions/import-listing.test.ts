import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))
vi.mock("@/lib/services/entitlement-service", () => ({
  checkListingCap: vi.fn(),
}))
vi.mock("@/lib/services/scraper-service", () => ({
  scrapeJobListing: vi.fn(),
}))
vi.mock("@/lib/services/vitality-state-machine", () => ({
  computeVitalityState: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}))

import { importFromUrl, manualImportListing } from "./import-listing"
import { auth } from "@/lib/auth"
import { checkListingCap } from "@/lib/services/entitlement-service"
import { scrapeJobListing } from "@/lib/services/scraper-service"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"
import { prisma } from "@/lib/db"
import { revalidateTag } from "next/cache"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as unknown as ReturnType<typeof vi.fn> & { mockResolvedValue: (v: any) => void }
const mockCheckCap = vi.mocked(checkListingCap)
const mockScrape = vi.mocked(scrapeJobListing)
const mockCompute = vi.mocked(computeVitalityState)
const mockRevalidate = vi.mocked(revalidateTag)

type MockPrisma = {
  jobListing: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}
const mockPrisma = prisma as unknown as MockPrisma

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.auditLog.create.mockResolvedValue({})
})

const validSession = { user: { id: "user-1", email: "test@example.com" } }
const testUrl = "https://jobs.example.com/engineer"

function makeFormData(url: string): FormData {
  const fd = new FormData()
  fd.append("url", url)
  return fd
}

describe("importFromUrl", () => {
  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    const result = await importFromUrl(makeFormData(testUrl))

    expect(result).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns error when URL is invalid", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })

    const result = await importFromUrl(makeFormData("not-a-url"))

    expect(result.error).toBeTruthy()
    expect(result.data).toBeNull()
  })

  it("returns cap_reached when at listing limit", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: false, count: 25, cap: 25, isPro: false })

    const result = await importFromUrl(makeFormData(testUrl))

    expect(result.data).toEqual({ status: "cap_reached", count: 25, cap: 25 })
    expect(result.error).toBeNull()
  })

  it("returns duplicate when URL already tracked", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 5, cap: 25, isPro: false })
    mockPrisma.jobListing.findFirst.mockResolvedValue({
      id: "listing-1",
      title: "Senior Engineer",
      company: "Acme Corp",
    })

    const result = await importFromUrl(makeFormData(testUrl))

    expect(result.data).toEqual({
      status: "duplicate",
      existingId: "listing-1",
      title: "Senior Engineer",
      company: "Acme Corp",
    })
    expect(result.error).toBeNull()
  })

  it("returns error when scrape fails", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 5, cap: 25, isPro: false })
    mockPrisma.jobListing.findFirst.mockResolvedValue(null)
    mockScrape.mockResolvedValue({ data: null, partial: false, error: "Timed out" })

    const result = await importFromUrl(makeFormData(testUrl))

    expect(result).toEqual({ data: null, error: "Timed out" })
  })

  it("creates listing and returns created status on success", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 5, cap: 25, isPro: false })
    mockPrisma.jobListing.findFirst.mockResolvedValue(null)
    mockScrape.mockResolvedValue({
      data: { title: "Senior Engineer", company: "Acme Corp", companyDomain: "example.com" },
      partial: false,
      error: null,
    })
    mockCompute.mockReturnValue("HOT")
    mockPrisma.jobListing.create.mockResolvedValue({
      id: "listing-new",
      title: "Senior Engineer",
      company: "Acme Corp",
      vitalityState: "HOT",
    })

    const result = await importFromUrl(makeFormData(testUrl))

    expect(result.data).toEqual({
      status: "created",
      listing: {
        id: "listing-new",
        title: "Senior Engineer",
        company: "Acme Corp",
        vitalityState: "HOT",
      },
    })
    expect(result.error).toBeNull()
  })

  it("does not call revalidateTag (board uses direct Prisma query + router.refresh)", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })
    mockPrisma.jobListing.findFirst.mockResolvedValue(null)
    mockScrape.mockResolvedValue({
      data: { title: "Dev", company: "Corp" },
      partial: true,
      error: null,
    })
    mockCompute.mockReturnValue("COOLING")
    mockPrisma.jobListing.create.mockResolvedValue({
      id: "listing-2",
      title: "Dev",
      company: "Corp",
      vitalityState: "COOLING",
    })

    await importFromUrl(makeFormData(testUrl))

    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("uses URL as title fallback when scrape returns no title", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })
    mockPrisma.jobListing.findFirst.mockResolvedValue(null)
    mockScrape.mockResolvedValue({ data: {}, partial: true, error: null })
    mockCompute.mockReturnValue("COOLING")
    mockPrisma.jobListing.create.mockResolvedValue({
      id: "listing-3",
      title: testUrl,
      company: "Unknown",
      vitalityState: "COOLING",
    })

    await importFromUrl(makeFormData(testUrl))

    expect(mockPrisma.jobListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: testUrl, company: "Unknown" }),
      })
    )
  })
})

describe("manualImportListing", () => {
  function makeManualFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData()
    fd.append("title", overrides.title ?? "Senior Engineer")
    fd.append("company", overrides.company ?? "Acme Corp")
    if (overrides.location) fd.append("location", overrides.location)
    if (overrides.sourceUrl) fd.append("sourceUrl", overrides.sourceUrl)
    if (overrides.notes) fd.append("notes", overrides.notes)
    return fd
  }

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await manualImportListing(makeManualFormData())
    expect(result).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns cap_reached when at listing limit", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: false, count: 25, cap: 25, isPro: false })
    const result = await manualImportListing(makeManualFormData())
    expect(result.data).toEqual({ status: "cap_reached", count: 25, cap: 25 })
    expect(result.error).toBeNull()
  })

  it("returns error when title is missing", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })
    const fd = new FormData()
    fd.append("company", "Acme Corp")
    const result = await manualImportListing(fd)
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it("returns error when company is missing", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })
    const fd = new FormData()
    fd.append("title", "Engineer")
    const result = await manualImportListing(fd)
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it("creates listing with MANUAL importSource on success", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })
    mockCompute.mockReturnValue("COOLING")
    mockPrisma.jobListing.create.mockResolvedValue({
      id: "manual-1",
      title: "Senior Engineer",
      company: "Acme Corp",
      vitalityState: "COOLING",
    })
    const result = await manualImportListing(makeManualFormData())
    expect(result.data).toEqual({
      status: "created",
      listing: { id: "manual-1", title: "Senior Engineer", company: "Acme Corp", vitalityState: "COOLING" },
    })
    expect(result.error).toBeNull()
    expect(mockPrisma.jobListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ importSource: "MANUAL" }),
      })
    )
  })

  it("passes optional fields through to the listing", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })
    mockCompute.mockReturnValue("COOLING")
    mockPrisma.jobListing.create.mockResolvedValue({
      id: "manual-2",
      title: "Engineer",
      company: "Corp",
      vitalityState: "COOLING",
    })
    const fd = new FormData()
    fd.append("title", "Engineer")
    fd.append("company", "Corp")
    fd.append("location", "London")
    fd.append("sourceUrl", "https://jobs.example.com/1")
    fd.append("notes", "Interesting role")
    await manualImportListing(fd)
    expect(mockPrisma.jobListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          location: "London",
          sourceUrl: "https://jobs.example.com/1",
          notes: "Interesting role",
        }),
      })
    )
  })

  it("does not call revalidateTag", async () => {
    mockAuth.mockResolvedValue(validSession)
    mockCheckCap.mockResolvedValue({ allowed: true, count: 0, cap: 25, isPro: false })
    mockCompute.mockReturnValue("COOLING")
    mockPrisma.jobListing.create.mockResolvedValue({
      id: "manual-3",
      title: "Engineer",
      company: "Corp",
      vitalityState: "COOLING",
    })
    await manualImportListing(makeManualFormData())
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})
