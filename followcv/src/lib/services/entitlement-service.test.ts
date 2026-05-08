import { describe, it, expect, vi, beforeEach } from "vitest"
import { checkCvVersionCap, checkListingCap } from "./entitlement-service"

vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: { count: vi.fn() },
    cvVersion: { count: vi.fn() },
    appConfig: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"

type MockPrisma = {
  jobListing: { count: ReturnType<typeof vi.fn> }
  cvVersion: { count: ReturnType<typeof vi.fn> }
  appConfig: { findUnique: ReturnType<typeof vi.fn> }
  user: { findUnique: ReturnType<typeof vi.fn> }
}

const mock = prisma as unknown as MockPrisma
const mockCount = vi.mocked(mock.jobListing.count)
const mockCvCount = vi.mocked(mock.cvVersion.count)
const mockFindUnique = vi.mocked(mock.appConfig.findUnique)
const mockUserFindUnique = vi.mocked(mock.user.findUnique)

beforeEach(() => {
  mockCount.mockReset()
  mockCvCount.mockReset()
  mockFindUnique.mockReset()
  mockUserFindUnique.mockReset()
})

describe("checkListingCap", () => {
  it("returns allowed: true when under cap (free tier)", async () => {
    mockCount.mockResolvedValue(5)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    const result = await checkListingCap("user-1")

    expect(result).toEqual({
      allowed: true,
      count: 5,
      cap: 25,
      isPro: false,
    })
  })

  it("returns allowed: false when at cap (free tier)", async () => {
    mockCount.mockResolvedValue(25)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    const result = await checkListingCap("user-1")

    expect(result).toEqual({
      allowed: false,
      count: 25,
      cap: 25,
      isPro: false,
    })
  })

  it("Pro users always allowed regardless of count; cap is null", async () => {
    mockCount.mockResolvedValue(500)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "PRO" })

    const result = await checkListingCap("user-1")

    expect(result).toEqual({
      allowed: true,
      count: 500,
      cap: null,
      isPro: true,
    })
  })

  it("uses cap from AppConfig when present (free tier)", async () => {
    mockCount.mockResolvedValue(10)
    mockFindUnique.mockResolvedValue({ key: "listing_cap_free", value: "50" })
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    const result = await checkListingCap("user-1")

    expect(result).toEqual({
      allowed: true,
      count: 10,
      cap: 50,
      isPro: false,
    })
  })

  it("falls back to 25 when AppConfig row not found", async () => {
    mockCount.mockResolvedValue(0)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    const result = await checkListingCap("user-1")

    expect(result.cap).toBe(25)
  })

  it("counts only non-archived non-deleted listings", async () => {
    mockCount.mockResolvedValue(3)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    await checkListingCap("user-1")

    expect(mockCount).toHaveBeenCalledWith({
      where: { userId: "user-1", archived: false, deletedAt: null },
    })
  })
})

describe("checkCvVersionCap", () => {
  it("returns isPro=true and cap=null for Pro users (no cap applies)", async () => {
    mockCvCount.mockResolvedValue(42)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "PRO" })

    const r = await checkCvVersionCap("user-1")
    expect(r).toEqual({ allowed: true, count: 42, cap: null, isPro: true })
  })

  it("uses the AppConfig override when present (free tier)", async () => {
    mockCvCount.mockResolvedValue(2)
    mockFindUnique.mockResolvedValue({ key: "cv_version_cap_free", value: "10" })
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    const r = await checkCvVersionCap("user-1")
    expect(r).toEqual({ allowed: true, count: 2, cap: 10, isPro: false })
  })

  it("falls back to a default cap of 5 when no AppConfig row exists", async () => {
    mockCvCount.mockResolvedValue(2)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    const r = await checkCvVersionCap("user-1")
    expect(r).toEqual({ allowed: true, count: 2, cap: 5, isPro: false })
  })

  it("returns allowed=false when count equals or exceeds the cap", async () => {
    mockCvCount.mockResolvedValue(5)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    const r = await checkCvVersionCap("user-1")
    expect(r).toEqual({ allowed: false, count: 5, cap: 5, isPro: false })
  })

  it("scopes the count to the user", async () => {
    mockCvCount.mockResolvedValue(0)
    mockFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    await checkCvVersionCap("user-1")

    expect(mockCvCount).toHaveBeenCalledWith({ where: { userId: "user-1" } })
  })
})
