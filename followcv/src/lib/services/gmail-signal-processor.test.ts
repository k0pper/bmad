import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    jobListing: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock("./gmail-token-service", () => ({
  getSignalCheckpoint: vi.fn(),
  refreshAccessToken: vi.fn(),
  setLastSignalCheckAt: vi.fn(),
}))
vi.mock("@/lib/account/service", () => ({
  revokeGmailAccess: vi.fn(),
}))

import { processGmailSignalsForUser } from "./gmail-signal-processor"
import { prisma } from "@/lib/db"
import {
  getSignalCheckpoint,
  refreshAccessToken,
  setLastSignalCheckAt,
} from "./gmail-token-service"
import { revokeGmailAccess } from "@/lib/account/service"

type MockPrisma = {
  jobListing: { findMany: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

const mockedPrisma = prisma as unknown as MockPrisma
const mockedCheckpoint = getSignalCheckpoint as unknown as ReturnType<typeof vi.fn>
const mockedRefresh = refreshAccessToken as unknown as ReturnType<typeof vi.fn>
const mockedSetWatermark = setLastSignalCheckAt as unknown as ReturnType<typeof vi.fn>
const mockedRevoke = revokeGmailAccess as unknown as ReturnType<typeof vi.fn>

const NOW = new Date("2026-05-08T12:00:00Z")
const CONNECTED_AT = new Date("2026-05-01T00:00:00Z")
const APPLIED_AT = new Date("2026-05-02T10:00:00Z")

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(global, "fetch").mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("processGmailSignalsForUser", () => {
  it("returns no-token when the user has no GmailToken row", async () => {
    mockedCheckpoint.mockResolvedValue(null)

    const result = await processGmailSignalsForUser("user-1", NOW)

    expect(result).toEqual({ status: "no-token", checked: 0, found: 0 })
    expect(mockedRefresh).not.toHaveBeenCalled()
    expect(mockedSetWatermark).not.toHaveBeenCalled()
  })

  it("returns revoked + calls revokeGmailAccess on invalid_grant", async () => {
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({ status: "revoked" })

    const result = await processGmailSignalsForUser("user-1", NOW)

    expect(result).toEqual({ status: "revoked", checked: 0, found: 0 })
    expect(mockedRevoke).toHaveBeenCalledWith("user-1")
    expect(mockedSetWatermark).not.toHaveBeenCalled()
    expect(mockedPrisma.jobListing.findMany).not.toHaveBeenCalled()
  })

  it("ok with no listings: still updates the watermark to now", async () => {
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([])

    const result = await processGmailSignalsForUser("user-1", NOW)

    expect(result).toMatchObject({ status: "ok", checked: 0, found: 0 })
    expect(mockedSetWatermark).toHaveBeenCalledWith("user-1", NOW)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("ok with no Gmail matches: writes 0 audit logs and updates watermark", async () => {
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "acme.com",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultSizeEstimate: 0 }), { status: 200 }),
    )

    const result = await processGmailSignalsForUser("user-1", NOW)

    expect(result).toEqual({ status: "ok", checked: 1, found: 0, errors: 0 })
    expect(mockedPrisma.auditLog.create).not.toHaveBeenCalled()
    expect(mockedSetWatermark).toHaveBeenCalledWith("user-1", NOW)
  })

  it("ok with matches: writes one audit row per affected listing per domain", async () => {
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    // Two listings on the same domain (acme.com) + one on a different domain.
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "acme.com",
        application: { appliedAt: APPLIED_AT },
      },
      {
        id: "listing-2",
        companyDomain: "acme.com",
        application: { appliedAt: APPLIED_AT },
      },
      {
        id: "listing-3",
        companyDomain: "other.com",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ resultSizeEstimate: 1 }), { status: 200 }),
    )

    const result = await processGmailSignalsForUser("user-1", NOW)

    // 2 distinct domains queried; 3 listings affected (2 acme + 1 other)
    expect(result).toEqual({ status: "ok", checked: 2, found: 3, errors: 0 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledTimes(3)
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        source: "GMAIL_SIGNAL",
        userId: "user-1",
        listingId: "listing-1",
        computedAt: NOW,
      },
    })
  })

  it("uses lastSignalCheckAt as the floor when present, not createdAt", async () => {
    const watermark = new Date("2026-05-07T00:00:00Z")
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: watermark,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "acme.com",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultSizeEstimate: 0 }), { status: 200 }),
    )

    await processGmailSignalsForUser("user-1", NOW)

    const url = new URL(fetchSpy.mock.calls[0][0] as string)
    const expectedFloor = Math.floor(watermark.getTime() / 1000)
    expect(url.searchParams.get("q")).toBe(
      `from:acme.com after:${expectedFloor}`,
    )
    expect(url.searchParams.get("maxResults")).toBe("1")
    expect(url.pathname).toBe("/gmail/v1/users/me/messages")
    expect(url.host).toBe("gmail.googleapis.com")
  })

  it("uses createdAt as the floor on the first run (lastSignalCheckAt null)", async () => {
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "acme.com",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultSizeEstimate: 0 }), { status: 200 }),
    )

    await processGmailSignalsForUser("user-1", NOW)

    const url = new URL(fetchSpy.mock.calls[0][0] as string)
    const expectedFloor = Math.floor(CONNECTED_AT.getTime() / 1000)
    expect(url.searchParams.get("q")).toContain(`after:${expectedFloor}`)
  })

  it("sends the bearer token in the Authorization header", async () => {
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.SUPER",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "acme.com",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultSizeEstimate: 0 }), { status: 200 }),
    )

    await processGmailSignalsForUser("user-1", NOW)

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer ya29.SUPER")
  })

  it("isolates per-domain Gmail API failures: counts the error, advances watermark, and writes audits for healthy domains", async () => {
    // A 5xx (or any non-2xx) on one domain used to abort the whole user's
    // tick — leaving the watermark un-advanced and re-writing audit logs
    // on the next tick for already-processed domains. Now we count the
    // failure, skip that domain, and continue.
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "broken.com",
        application: { appliedAt: APPLIED_AT },
      },
      {
        id: "listing-2",
        companyDomain: "healthy.com",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(input as string)
      if (url.searchParams.get("q")?.includes("broken.com")) {
        return new Response("internal", { status: 500 })
      }
      return new Response(JSON.stringify({ resultSizeEstimate: 1 }), { status: 200 })
    })

    const result = await processGmailSignalsForUser("user-1", NOW)

    expect(result).toEqual({ status: "ok", checked: 2, found: 1, errors: 1 })
    expect(mockedSetWatermark).toHaveBeenCalledWith("user-1", NOW)
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        source: "GMAIL_SIGNAL",
        userId: "user-1",
        listingId: "listing-2",
        computedAt: NOW,
      },
    })
  })

  it("never fetches a single message body (privacy hard rule)", async () => {
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "acme.com",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          resultSizeEstimate: 1,
          messages: [{ id: "msg-1", threadId: "thread-1" }],
        }),
        { status: 200 },
      ),
    )

    await processGmailSignalsForUser("user-1", NOW)

    // Every fetch URL must end at the list endpoint, never `/messages/<id>`.
    for (const call of fetchSpy.mock.calls) {
      const u = new URL(call[0] as string)
      expect(u.pathname).toMatch(/\/messages$/)
      expect(u.pathname).not.toMatch(/\/messages\//)
    }
  })

  it("does not write an audit row when applied is in the future relative to now", async () => {
    const futureApply = new Date(NOW.getTime() + 60_000)
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-1",
        companyDomain: "acme.com",
        application: { appliedAt: futureApply },
      },
    ])
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultSizeEstimate: 5 }), { status: 200 }),
    )

    const result = await processGmailSignalsForUser("user-1", NOW)

    expect(result.found).toBe(0)
    expect(mockedPrisma.auditLog.create).not.toHaveBeenCalled()
  })

  it("never-real domain (RFC-2606 .invalid TLD) yields no signal, no transition", async () => {
    // A listing whose companyDomain can never appear in any real email
    // (`.invalid` is reserved by RFC 2606 and unresolvable). Gmail returns
    // an empty result; the processor must not write an audit row, so the
    // recompute step has nothing to act on and the listing stays put.
    mockedCheckpoint.mockResolvedValue({
      lastSignalCheckAt: null,
      createdAt: CONNECTED_AT,
    })
    mockedRefresh.mockResolvedValue({
      status: "ok",
      accessToken: "ya29.token",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    })
    mockedPrisma.jobListing.findMany.mockResolvedValue([
      {
        id: "listing-negative",
        companyDomain: "vitality-test-no-match-zxq.invalid",
        application: { appliedAt: APPLIED_AT },
      },
    ])
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ resultSizeEstimate: 0 }), { status: 200 }),
    )

    const result = await processGmailSignalsForUser("user-1", NOW)

    expect(result).toEqual({ status: "ok", checked: 1, found: 0, errors: 0 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(mockedPrisma.auditLog.create).not.toHaveBeenCalled()
    // Watermark must still advance even on a no-match tick — otherwise the
    // floor would never move forward and we'd re-scan the same window.
    expect(mockedSetWatermark).toHaveBeenCalledWith("user-1", NOW)

    const url = new URL(fetchSpy.mock.calls[0][0] as string)
    expect(url.searchParams.get("q")).toBe(
      `from:vitality-test-no-match-zxq.invalid after:${Math.floor(
        CONNECTED_AT.getTime() / 1000,
      )}`,
    )
  })
})
