import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@vercel/blob", () => ({ del: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { delete: vi.fn() },
    cvVersion: { findMany: vi.fn() },
    cvSnapshot: { findMany: vi.fn() },
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
  cvSnapshot: { findMany: ReturnType<typeof vi.fn> }
  gmailToken: {
    findFirst: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

const mock = prisma as unknown as MockPrisma
const mockUserDelete = vi.mocked(mock.user.delete)
const mockCvFindMany = vi.mocked(mock.cvVersion.findMany)
const mockSnapshotFindMany = vi.mocked(mock.cvSnapshot.findMany)
const mockGmailFindFirst = vi.mocked(mock.gmailToken.findFirst)
const mockGmailDelete = vi.mocked(mock.gmailToken.delete)
const mockDel = del as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no snapshots — most tests don't care.
  mockSnapshotFindMany.mockResolvedValue([])
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

  it("also deletes CvSnapshot blobs scoped via Application", async () => {
    mockCvFindMany.mockResolvedValue([
      { s3Key: "https://abc.private.blob.vercel-storage.com/cv-1.pdf" },
    ])
    mockSnapshotFindMany.mockResolvedValue([
      { s3Key: "https://abc.private.blob.vercel-storage.com/snap-1.pdf" },
      { s3Key: "https://abc.private.blob.vercel-storage.com/snap-2.pdf" },
    ])
    mockUserDelete.mockResolvedValue({ id: "user-1" })

    await deleteAccount("user-1")

    expect(mockSnapshotFindMany).toHaveBeenCalledWith({
      where: { application: { userId: "user-1" } },
      select: { s3Key: true },
    })
    expect(mockDel).toHaveBeenCalledWith([
      "https://abc.private.blob.vercel-storage.com/cv-1.pdf",
      "https://abc.private.blob.vercel-storage.com/snap-1.pdf",
      "https://abc.private.blob.vercel-storage.com/snap-2.pdf",
    ])
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
    mockGmailFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "ya29.x",
    })
    mockGmailDelete.mockResolvedValue({ id: "token-1" })
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchSpy)

    await revokeGmailAccess("user-1")

    expect(mockGmailFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true, accessToken: true },
    })
    // Best-effort revocation call to Google
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke?token=ya29.x",
      { method: "POST" },
    )
    expect(mockGmailDelete).toHaveBeenCalledWith({ where: { id: "token-1" } })
    vi.unstubAllGlobals()
  })

  it("still deletes the row when the Google revoke call fails", async () => {
    mockGmailFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "ya29.x",
    })
    mockGmailDelete.mockResolvedValue({ id: "token-1" })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    )

    await revokeGmailAccess("user-1")

    expect(mockGmailDelete).toHaveBeenCalledWith({ where: { id: "token-1" } })
    vi.unstubAllGlobals()
  })

  it("is a no-op when no token exists (no Google call, no DB delete)", async () => {
    mockGmailFindFirst.mockResolvedValue(null)
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    await revokeGmailAccess("user-1")

    expect(mockGmailDelete).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("does not touch JobListing or Application data", async () => {
    // The mock surface only exposes `gmailToken.*` and `cv*` /  `user.*`.
    // No `jobListing` or `application` access methods are even mocked, so
    // any call that touched them would throw `... is not a function`.
    // This serves as a typed regression assertion for AC8.
    mockGmailFindFirst.mockResolvedValue({
      id: "token-1",
      accessToken: "ya29.x",
    })
    mockGmailDelete.mockResolvedValue({ id: "token-1" })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    )

    await expect(revokeGmailAccess("user-1")).resolves.not.toThrow()

    expect("jobListing" in mock).toBe(false)
    expect("application" in mock).toBe(false)
    vi.unstubAllGlobals()
  })
})
