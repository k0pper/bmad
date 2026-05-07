import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@vercel/blob", () => ({ del: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    cvVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}))
vi.mock("@/lib/services/entitlement-service", () => ({
  checkCvVersionCap: vi.fn(),
}))

import {
  checkCvDuplicate,
  confirmCvUpload,
  listCvVersions,
  renameCvVersion,
  restoreCvVersion,
  deleteCvVersion,
} from "./manage-cv"
import { auth } from "@/lib/auth"
import { del } from "@vercel/blob"
import { prisma } from "@/lib/db"
import { checkCvVersionCap } from "@/lib/services/entitlement-service"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn> & {
  mockResolvedValue: (v: unknown) => void
}
const mockDel = del as unknown as ReturnType<typeof vi.fn>
const mockCheckCap = checkCvVersionCap as unknown as ReturnType<typeof vi.fn>

type MockPrisma = {
  cvVersion: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
}
const mockPrisma = prisma as unknown as MockPrisma

const session = { user: { id: "user-1" } }
const VALID_HASH = "a".repeat(64)
const VALID_BLOB_URL = "https://abc.public.blob.vercel-storage.com/cv-1.pdf"

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session)
  mockCheckCap.mockResolvedValue({ allowed: true, count: 1, cap: 5, isPro: false })
})

describe("checkCvDuplicate", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await checkCvDuplicate({ fileHash: VALID_HASH })
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns existing match when one exists for this user", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue({
      id: "cv-1",
      name: "Senior CV",
    })
    const r = await checkCvDuplicate({ fileHash: VALID_HASH })
    expect(r).toEqual({
      data: { existing: { id: "cv-1", name: "Senior CV" } },
      error: null,
    })
    expect(mockPrisma.cvVersion.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", fileHash: VALID_HASH },
      select: { id: true, name: true },
    })
  })

  it("returns null when no match", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(null)
    const r = await checkCvDuplicate({ fileHash: VALID_HASH })
    expect(r).toEqual({ data: { existing: null }, error: null })
  })
})

describe("confirmCvUpload", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "x",
      fileSize: 100,
      fileHash: VALID_HASH,
    })
    expect(r.error).toBe("Unauthorized")
  })

  it.each([
    "http://example.com/cv.pdf",
    "javascript:alert(1)",
    "https://evil.com/<script>",
  ])("rejects invalid blob URL: %s", async (badUrl) => {
    const r = await confirmCvUpload({
      blobUrl: badUrl,
      name: "x",
      fileSize: 100,
      fileHash: VALID_HASH,
    })
    expect(r.error).toBe("Invalid blob URL")
  })

  it("rejects invalid file size", async () => {
    const r = await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "x",
      fileSize: 0,
      fileHash: VALID_HASH,
    })
    expect(r.error).toBe("Invalid file size")
  })

  it("rejects oversize files", async () => {
    const r = await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "x",
      fileSize: 11 * 1024 * 1024,
      fileHash: VALID_HASH,
    })
    expect(r.error).toBe("Invalid file size")
  })

  it("rejects malformed file hash", async () => {
    const r = await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "x",
      fileSize: 100,
      fileHash: "short",
    })
    expect(r.error).toBe("Invalid file hash")
  })

  it("creates a row with s3Key = blobUrl on the happy path", async () => {
    mockPrisma.cvVersion.create.mockResolvedValue({ id: "cv-1" })
    const r = await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "Senior CV",
      fileSize: 1024,
      fileHash: VALID_HASH,
    })
    expect(r.error).toBeNull()
    expect(mockPrisma.cvVersion.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Senior CV",
        s3Key: VALID_BLOB_URL,
        fileSize: 1024,
        fileHash: VALID_HASH,
      },
    })
  })

  it("defaults blank/whitespace names to a date-stamped fallback", async () => {
    mockPrisma.cvVersion.create.mockResolvedValue({ id: "cv-1" })
    await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "   ",
      fileSize: 1024,
      fileHash: VALID_HASH,
    })
    const callArg = mockPrisma.cvVersion.create.mock.calls[0][0]
    expect(callArg.data.name).toMatch(/^CV — \d{4}-\d{2}-\d{2}$/)
  })

  it("on unique-constraint race, deletes the orphan blob and returns the duplicate error", async () => {
    mockPrisma.cvVersion.create.mockRejectedValue({ code: "P2002" })
    const r = await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "Senior CV",
      fileSize: 1024,
      fileHash: VALID_HASH,
    })
    expect(r).toEqual({
      data: null,
      error: "This file is already uploaded",
    })
    expect(mockDel).toHaveBeenCalledWith(VALID_BLOB_URL)
  })

  it("swallows generic DB errors and returns a friendly message", async () => {
    mockPrisma.cvVersion.create.mockRejectedValue(new Error("kaboom"))
    const r = await confirmCvUpload({
      blobUrl: VALID_BLOB_URL,
      name: "Senior CV",
      fileSize: 1024,
      fileHash: VALID_HASH,
    })
    expect(r.error).toBe("Failed to save CV version")
  })
})

describe("listCvVersions", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await listCvVersions()
    expect(r.error).toBe("Unauthorized")
  })

  it("returns the user's versions newest first", async () => {
    const rows = [{ id: "cv-1" }, { id: "cv-2" }]
    mockPrisma.cvVersion.findMany.mockResolvedValue(rows)
    const r = await listCvVersions()
    expect(r.data).toEqual(rows)
    expect(mockPrisma.cvVersion.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { uploadedAt: "desc" },
    })
  })
})

describe("renameCvVersion", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await renameCvVersion({ id: "cv-1", name: "New Name" })
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns Not found when version does not belong to user", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(null)
    const r = await renameCvVersion({ id: "cv-999", name: "New Name" })
    expect(r).toEqual({ data: null, error: "Not found" })
  })

  it("rejects empty name", async () => {
    const r = await renameCvVersion({ id: "cv-1", name: "   " })
    expect(r).toEqual({ data: null, error: "Name cannot be empty" })
    expect(mockPrisma.cvVersion.findFirst).not.toHaveBeenCalled()
  })

  it("updates the name on happy path", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue({ id: "cv-1" })
    mockPrisma.cvVersion.update.mockResolvedValue({ id: "cv-1", name: "Updated" })
    const r = await renameCvVersion({ id: "cv-1", name: "  Updated  " })
    expect(r).toEqual({ data: { id: "cv-1", name: "Updated" }, error: null })
    expect(mockPrisma.cvVersion.update).toHaveBeenCalledWith({
      where: { id: "cv-1" },
      data: { name: "Updated" },
    })
  })
})

describe("restoreCvVersion", () => {
  const original = {
    id: "cv-1",
    userId: "user-1",
    name: "Senior CV",
    s3Key: VALID_BLOB_URL,
    fileSize: 1024,
    fileHash: VALID_HASH,
    uploadedAt: new Date("2026-05-01T00:00:00Z"),
  }

  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await restoreCvVersion({ id: "cv-1" })
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns Not found when version does not belong to user", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(null)
    const r = await restoreCvVersion({ id: "cv-999" })
    expect(r).toEqual({ data: null, error: "Not found" })
  })

  it("rejects when called on the already-active version", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(original)
    mockPrisma.cvVersion.count.mockResolvedValue(0) // no newer versions exist
    const r = await restoreCvVersion({ id: "cv-1" })
    expect(r).toEqual({
      data: null,
      error: "This CV is already the active version.",
    })
    expect(mockPrisma.cvVersion.create).not.toHaveBeenCalled()
  })

  it("returns cap error when limit is reached", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(original)
    mockPrisma.cvVersion.count.mockResolvedValue(2) // newer versions exist, so this isn't active
    mockCheckCap.mockResolvedValue({ allowed: false, count: 5, cap: 5, isPro: false })
    const r = await restoreCvVersion({ id: "cv-1" })
    expect(r.error).toContain("CV version limit reached")
    expect(mockPrisma.cvVersion.create).not.toHaveBeenCalled()
  })

  it("creates a new entry with same name and fileHash null", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(original)
    mockPrisma.cvVersion.count.mockResolvedValue(2)
    mockPrisma.cvVersion.create.mockResolvedValue({ id: "cv-3" })
    const r = await restoreCvVersion({ id: "cv-1" })
    expect(r.error).toBeNull()
    expect(mockPrisma.cvVersion.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Senior CV",
        s3Key: VALID_BLOB_URL,
        fileSize: 1024,
        fileHash: null,
      },
    })
  })
})

describe("deleteCvVersion", () => {
  const cv = {
    id: "cv-1",
    userId: "user-1",
    s3Key: VALID_BLOB_URL,
    snapshots: [],
  }

  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await deleteCvVersion({ id: "cv-1" })
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("returns Not found when version does not belong to user", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(null)
    const r = await deleteCvVersion({ id: "cv-999" })
    expect(r).toEqual({ data: null, error: "Not found" })
  })

  it("returns error when snapshots reference this version", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue({
      ...cv,
      snapshots: [{ id: "snap-1" }],
    })
    const r = await deleteCvVersion({ id: "cv-1" })
    expect(r).toEqual({
      data: null,
      error: "This CV is attached to an application and cannot be deleted.",
    })
    expect(mockPrisma.cvVersion.delete).not.toHaveBeenCalled()
  })

  it("deletes record and blob when no other version shares the s3Key", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(cv)
    mockPrisma.cvVersion.count.mockResolvedValue(0)
    mockPrisma.cvVersion.delete.mockResolvedValue(cv)
    const r = await deleteCvVersion({ id: "cv-1" })
    expect(r).toEqual({ data: { deleted: true }, error: null })
    expect(mockPrisma.cvVersion.delete).toHaveBeenCalledWith({ where: { id: "cv-1" } })
    expect(mockDel).toHaveBeenCalledWith(VALID_BLOB_URL)
  })

  it("deletes record but NOT blob when another version shares the same s3Key", async () => {
    mockPrisma.cvVersion.findFirst.mockResolvedValue(cv)
    mockPrisma.cvVersion.count.mockResolvedValue(1) // another version uses the same blob
    mockPrisma.cvVersion.delete.mockResolvedValue(cv)
    const r = await deleteCvVersion({ id: "cv-1" })
    expect(r).toEqual({ data: { deleted: true }, error: null })
    expect(mockPrisma.cvVersion.delete).toHaveBeenCalledWith({ where: { id: "cv-1" } })
    expect(mockDel).not.toHaveBeenCalled()
  })
})
