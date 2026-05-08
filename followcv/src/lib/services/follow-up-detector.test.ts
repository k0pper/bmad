import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    appConfig: {
      findUnique: vi.fn(),
    },
  },
}))

import { isFollowUpDue, getFollowUpThresholdDays } from "./follow-up-detector"
import { prisma } from "@/lib/db"

const mockFindUnique = (prisma as unknown as {
  appConfig: { findUnique: ReturnType<typeof vi.fn> }
}).appConfig.findUnique

beforeEach(() => {
  vi.clearAllMocks()
})

const NOW = new Date("2026-05-08T12:00:00Z")
const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000)
const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000)

describe("isFollowUpDue", () => {
  it("returns false when archived", () => {
    expect(
      isFollowUpDue({
        application: { status: "APPLIED", updatedAt: eightDaysAgo },
        archived: true,
        thresholdDays: 7,
        now: NOW,
      }),
    ).toBe(false)
  })

  it("returns false when there is no application", () => {
    expect(
      isFollowUpDue({
        application: null,
        archived: false,
        thresholdDays: 7,
        now: NOW,
      }),
    ).toBe(false)
  })

  it("returns true for APPLIED beyond the threshold", () => {
    expect(
      isFollowUpDue({
        application: { status: "APPLIED", updatedAt: eightDaysAgo },
        archived: false,
        thresholdDays: 7,
        now: NOW,
      }),
    ).toBe(true)
  })

  it("returns false for APPLIED within the threshold", () => {
    expect(
      isFollowUpDue({
        application: { status: "APPLIED", updatedAt: fiveDaysAgo },
        archived: false,
        thresholdDays: 7,
        now: NOW,
      }),
    ).toBe(false)
  })

  it.each(["INTERVIEWING", "ON_HOLD"] as const)(
    "returns true for %s beyond the threshold",
    (status) => {
      expect(
        isFollowUpDue({
          application: { status, updatedAt: eightDaysAgo },
          archived: false,
          thresholdDays: 7,
          now: NOW,
        }),
      ).toBe(true)
    },
  )

  it.each(["REJECTED", "WITHDRAWN", "OFFER_RECEIVED", "GHOSTED"] as const)(
    "never flags terminal statuses (%s)",
    (status) => {
      expect(
        isFollowUpDue({
          application: { status, updatedAt: eightDaysAgo },
          archived: false,
          thresholdDays: 7,
          now: NOW,
        }),
      ).toBe(false)
    },
  )

  it("respects a custom threshold", () => {
    // 5 days ago, threshold = 3 days → due
    expect(
      isFollowUpDue({
        application: { status: "APPLIED", updatedAt: fiveDaysAgo },
        archived: false,
        thresholdDays: 3,
        now: NOW,
      }),
    ).toBe(true)
  })

  it("does NOT flag exactly at the threshold (strictly greater)", () => {
    const exactlyAtThreshold = new Date(
      NOW.getTime() - 7 * 24 * 60 * 60 * 1000,
    )
    expect(
      isFollowUpDue({
        application: { status: "APPLIED", updatedAt: exactlyAtThreshold },
        archived: false,
        thresholdDays: 7,
        now: NOW,
      }),
    ).toBe(false)
  })
})

describe("getFollowUpThresholdDays", () => {
  it("returns 7 by default when no AppConfig row exists", async () => {
    mockFindUnique.mockResolvedValue(null)
    expect(await getFollowUpThresholdDays()).toBe(7)
  })

  it("reads the configured value from AppConfig", async () => {
    mockFindUnique.mockResolvedValue({ value: "14" })
    expect(await getFollowUpThresholdDays()).toBe(14)
  })

  it("falls back to 7 when the configured value is invalid", async () => {
    mockFindUnique.mockResolvedValue({ value: "abc" })
    expect(await getFollowUpThresholdDays()).toBe(7)
  })

  it("falls back to 7 when the configured value is non-positive", async () => {
    mockFindUnique.mockResolvedValue({ value: "0" })
    expect(await getFollowUpThresholdDays()).toBe(7)
  })
})
