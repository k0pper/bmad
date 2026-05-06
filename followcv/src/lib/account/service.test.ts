import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@vercel/blob", () => ({ del: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { delete: vi.fn() },
    cvVersion: { findMany: vi.fn() },
    gmailToken: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { deleteAccount, revokeGmailAccess } from "./service"
import { del } from "@vercel/blob"
import { prisma } from "@/lib/db"

type MockPrisma = {
  user: { delete: ReturnType<typeof vi.fn> }
  cvVersion: { findMany: ReturnType<typeof vi.fn> }
  gmailToken: {
    findFirst: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

const mock = prisma as unknown as MockPrisma
const mockUserDelete = vi.mocked(mock.user.delete)
const mockCvFindMany = vi.mocked(mock.cvVersion.findMany)
const mockGmailFindFirst = vi.mocked(mock.gmailToken.findFirst)
const mockGmailDelete = vi.mocked(mock.gmailToken.delete)
const mockDel = del as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteAccount", () => {
  it("deletes the user's CV blobs from Vercel Blob and then deletes the user", async () => {
    const deleted = { id: "user-1", email: "test@example.com" }
    mockCvFindMany.mockResolvedValue([
      { s3Key: "https://abc.private.blob.vercel-storage.com/cv-1.pdf" },
      { s3Key: "https://abc.private.blob.vercel-storage.com/cv-2.pdf" },
    ])
    mockUserDelete.mockResolvedValue(deleted)

    const result = await deleteAccount("user-1")

    expect(mockCvFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { s3Key: true },
    })
    expect(mockDel).toHaveBeenCalledWith([
      "https://abc.private.blob.vercel-storage.com/cv-1.pdf",
      "https://abc.private.blob.vercel-storage.com/cv-2.pdf",
    ])
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "user-1" } })
    expect(result).toEqual(deleted)
  })

  it("skips the blob delete call when the user has no CVs", async () => {
    const deleted = { id: "user-1" }
    mockCvFindMany.mockResolvedValue([])
    mockUserDelete.mockResolvedValue(deleted)

    await deleteAccount("user-1")

    expect(mockDel).not.toHaveBeenCalled()
    expect(mockUserDelete).toHaveBeenCalled()
  })

  it("still deletes the user when blob deletion fails (best-effort)", async () => {
    const deleted = { id: "user-1" }
    mockCvFindMany.mockResolvedValue([
      { s3Key: "https://abc.private.blob.vercel-storage.com/cv-1.pdf" },
    ])
    mockDel.mockRejectedValue(new Error("storage outage"))
    mockUserDelete.mockResolvedValue(deleted)

    const result = await deleteAccount("user-1")

    expect(result).toEqual(deleted)
    expect(mockUserDelete).toHaveBeenCalled()
  })
})

describe("revokeGmailAccess", () => {
  it("deletes the gmail token row by id (no deleteMany — Neon HTTP rule)", async () => {
    mockGmailFindFirst.mockResolvedValue({ id: "token-1" })
    mockGmailDelete.mockResolvedValue({ id: "token-1" })

    await revokeGmailAccess("user-1")

    expect(mockGmailFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    })
    expect(mockGmailDelete).toHaveBeenCalledWith({ where: { id: "token-1" } })
  })

  it("is a no-op when no token exists", async () => {
    mockGmailFindFirst.mockResolvedValue(null)

    await revokeGmailAccess("user-1")

    expect(mockGmailDelete).not.toHaveBeenCalled()
  })
})
