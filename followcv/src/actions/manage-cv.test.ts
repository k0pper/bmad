import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@vercel/blob", () => ({ del: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    cvVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import {
  checkCvDuplicate,
  confirmCvUpload,
  listCvVersions,
} from "./manage-cv"
import { auth } from "@/lib/auth"
import { del } from "@vercel/blob"
import { prisma } from "@/lib/db"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn> & {
  mockResolvedValue: (v: unknown) => void
}
const mockDel = del as unknown as ReturnType<typeof vi.fn>

type MockPrisma = {
  cvVersion: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}
const mockPrisma = prisma as unknown as MockPrisma

const session = { user: { id: "user-1" } }
const VALID_HASH = "a".repeat(64)
const VALID_BLOB_URL = "https://abc.public.blob.vercel-storage.com/cv-1.pdf"

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session)
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
