import { describe, it, expect, vi, beforeEach } from "vitest"
import { getPreferenceProfile, createPreferenceProfile } from "./service"

vi.mock("@/lib/db", () => ({
  prisma: {
    preferenceProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"

const mockFindUnique = vi.mocked(
  (prisma as unknown as { preferenceProfile: { findUnique: ReturnType<typeof vi.fn> } })
    .preferenceProfile.findUnique
)
const mockCreate = vi.mocked(
  (prisma as unknown as { preferenceProfile: { create: ReturnType<typeof vi.fn> } })
    .preferenceProfile.create
)

beforeEach(() => {
  mockFindUnique.mockReset()
  mockCreate.mockReset()
})

const baseProfile = {
  id: "pref-1",
  userId: "user-1",
  jobFunction: "Engineering",
  seniorityLevel: "Senior",
  preferredLocations: ["San Francisco", "Remote"],
  workStyle: "Remote",
  targetSalaryMin: 120000,
  targetSalaryMax: 180000,
  salaryCurrency: "USD",
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("getPreferenceProfile", () => {
  it("returns the profile when one exists", async () => {
    mockFindUnique.mockResolvedValue(baseProfile)

    const result = await getPreferenceProfile("user-1")

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } })
    expect(result).toEqual(baseProfile)
  })

  it("returns null when no profile exists", async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await getPreferenceProfile("user-1")

    expect(result).toBeNull()
  })
})

describe("createPreferenceProfile", () => {
  it("creates a profile with all provided fields", async () => {
    const data = {
      jobFunction: "Engineering",
      seniorityLevel: "Senior",
      preferredLocations: ["San Francisco", "Remote"],
      workStyle: "Remote",
      targetSalaryMin: 120000,
      targetSalaryMax: 180000,
      salaryCurrency: "USD",
    }
    mockCreate.mockResolvedValue({ ...baseProfile, ...data })

    const result = await createPreferenceProfile("user-1", data)

    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", ...data },
    })
    expect(result.userId).toBe("user-1")
    expect(result.jobFunction).toBe("Engineering")
  })

  it("creates a profile with no optional fields", async () => {
    const minimal = { id: "pref-2", userId: "user-2", preferredLocations: [], createdAt: new Date(), updatedAt: new Date() }
    mockCreate.mockResolvedValue(minimal)

    await createPreferenceProfile("user-2", {})

    expect(mockCreate).toHaveBeenCalledWith({ data: { userId: "user-2" } })
  })

  it("includes null salary fields when explicitly passed", async () => {
    mockCreate.mockResolvedValue(baseProfile)

    await createPreferenceProfile("user-1", { targetSalaryMin: null, targetSalaryMax: null })

    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", targetSalaryMin: null, targetSalaryMax: null },
    })
  })
})
