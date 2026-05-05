import { describe, it, expect, vi, beforeEach } from "vitest"
import { checkListingCap } from "./entitlement-service"

vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: { count: vi.fn() },
    appConfig: { findUnique: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"

type MockPrisma = {
  jobListing: { count: ReturnType<typeof vi.fn> }
  appConfig: { findUnique: ReturnType<typeof vi.fn> }
}

const mock = prisma as unknown as MockPrisma
const mockCount = vi.mocked(mock.jobListing.count)
const mockFindUnique = vi.mocked(mock.appConfig.findUnique)

beforeEach(() => {
  mockCount.mockReset()
  mockFindUnique.mockReset()
})

describe("checkListingCap", () => {
  it("returns allowed: true when under cap", async () => {
    mockCount.mockResolvedValue(5)
    mockFindUnique.mockResolvedValue(null)

    const result = await checkListingCap("user-1")

    expect(result).toEqual({ allowed: true, count: 5, cap: 25 })
  })

  it("returns allowed: false when at cap", async () => {
    mockCount.mockResolvedValue(25)
    mockFindUnique.mockResolvedValue(null)

    const result = await checkListingCap("user-1")

    expect(result).toEqual({ allowed: false, count: 25, cap: 25 })
  })

  it("uses cap from AppConfig when present", async () => {
    mockCount.mockResolvedValue(10)
    mockFindUnique.mockResolvedValue({ key: "listing_cap_free", value: "50" })

    const result = await checkListingCap("user-1")

    expect(result).toEqual({ allowed: true, count: 10, cap: 50 })
  })

  it("falls back to 25 when AppConfig row not found", async () => {
    mockCount.mockResolvedValue(0)
    mockFindUnique.mockResolvedValue(null)

    const result = await checkListingCap("user-1")

    expect(result.cap).toBe(25)
  })

  it("counts only non-archived non-deleted listings", async () => {
    mockCount.mockResolvedValue(3)
    mockFindUnique.mockResolvedValue(null)

    await checkListingCap("user-1")

    expect(mockCount).toHaveBeenCalledWith({
      where: { userId: "user-1", archived: false, deletedAt: null },
    })
  })
})
