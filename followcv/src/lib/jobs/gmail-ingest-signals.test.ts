import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: { user: { findMany: vi.fn() } },
}))
vi.mock("@/lib/services/gmail-signal-processor", () => ({
  processGmailSignalsForUser: vi.fn(),
}))

import { handleGmailIngestSignals } from "./gmail-ingest-signals"
import { prisma } from "@/lib/db"
import { processGmailSignalsForUser } from "@/lib/services/gmail-signal-processor"

const mockedFindMany = (prisma.user.findMany as unknown) as ReturnType<typeof vi.fn>
const mockedProcessor = processGmailSignalsForUser as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("handleGmailIngestSignals", () => {
  it("returns zero counts when no eligible users", async () => {
    mockedFindMany.mockResolvedValue([])
    const result = await handleGmailIngestSignals()
    expect(result).toEqual({ users: 0, found: 0, revoked: 0, domainErrors: 0, errors: [] })
    expect(mockedProcessor).not.toHaveBeenCalled()
  })

  it("filters by subscriptionTier=PRO AND gmailToken=isNot null", async () => {
    mockedFindMany.mockResolvedValue([])
    await handleGmailIngestSignals()
    expect(mockedFindMany).toHaveBeenCalledWith({
      where: {
        subscriptionTier: "PRO",
        gmailToken: { isNot: null },
      },
      select: { id: true },
    })
  })

  it("aggregates results across all users (ok + revoked + no-token)", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "user-ok" },
      { id: "user-revoked" },
      { id: "user-no-token" },
    ])
    mockedProcessor.mockImplementation(async (userId: string) => {
      if (userId === "user-ok") return { status: "ok", checked: 2, found: 3, errors: 1 }
      if (userId === "user-revoked") return { status: "revoked", checked: 0, found: 0 }
      return { status: "no-token", checked: 0, found: 0 }
    })

    const result = await handleGmailIngestSignals()

    expect(result).toEqual({
      users: 3,
      found: 3,
      revoked: 1,
      domainErrors: 1,
      errors: [],
    })
    expect(mockedProcessor).toHaveBeenCalledTimes(3)
  })

  it("isolates per-user errors: one user throwing does NOT abort the batch", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "user-1" },
      { id: "user-blows-up" },
      { id: "user-3" },
    ])
    mockedProcessor.mockImplementation(async (userId: string) => {
      if (userId === "user-blows-up") {
        throw new Error("Gmail API permission denied")
      }
      return { status: "ok", checked: 1, found: 1 }
    })

    const result = await handleGmailIngestSignals()

    expect(result.users).toBe(3)
    expect(result.found).toBe(2) // two ok users at 1 each
    expect(result.revoked).toBe(0)
    expect(result.errors).toEqual([
      { userId: "user-blows-up", error: "Gmail API permission denied" },
    ])
    // The third user must have been processed despite the second one throwing
    expect(mockedProcessor).toHaveBeenCalledTimes(3)
  })

  it("propagates a system-level exception (e.g. user.findMany fails) — pg-boss DLQ territory", async () => {
    mockedFindMany.mockRejectedValue(new Error("connection lost"))
    await expect(handleGmailIngestSignals()).rejects.toThrow(/connection lost/)
  })
})
