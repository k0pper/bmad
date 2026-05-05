import { describe, it, expect, vi, beforeEach } from "vitest"
import { getPreferenceProfile, createPreferenceProfile, updatePreferenceProfile } from "./service"

vi.mock("@/lib/db", () => ({
  prisma: {
    preferenceProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"

type MockPrisma = {
  preferenceProfile: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

const mock = prisma as unknown as MockPrisma
const mockFindUnique = vi.mocked(mock.preferenceProfile.findUnique)
const mockCreate = vi.mocked(mock.preferenceProfile.create)
const mockUpdate = vi.mocked(mock.preferenceProfile.update)

beforeEach(() => {
  mockFindUnique.mockReset()
  mockCreate.mockReset()
  mockUpdate.mockReset()
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

describe("updatePreferenceProfile", () => {
  it("updates existing profile when one is found", async () => {
    mockFindUnique.mockResolvedValue({ id: "pref-1" })
    mockUpdate.mockResolvedValue({ ...baseProfile, jobFunction: "Design" })

    const result = await updatePreferenceProfile("user-1", { jobFunction: "Design" })

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { jobFunction: "Design" },
    })
    expect(result.jobFunction).toBe("Design")
  })

  it("creates profile when none exists", async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ ...baseProfile, jobFunction: "Design" })

    await updatePreferenceProfile("user-1", { jobFunction: "Design" })

    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", jobFunction: "Design" },
    })
    expect(mockUpdate).not.toHaveBeenCalled()
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
    const minimal = {
      id: "pref-2",
      userId: "user-2",
      preferredLocations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
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
