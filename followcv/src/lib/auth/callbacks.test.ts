import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { jwtCallback, sessionCallback, authorizedCallback } from "./callbacks"
import { IDLE_TIMEOUT_MS } from "./constants"
import type { Session } from "next-auth"
import type { JWT } from "@auth/core/jwt"

// ── jwtCallback ───────────────────────────────────────────────────────────────

describe("jwtCallback", () => {
  const mockFindOrCreate = vi.fn()

  beforeEach(() => {
    mockFindOrCreate.mockReset()
  })

  it("upserts user and populates token on first sign-in", async () => {
    mockFindOrCreate.mockResolvedValue({
      id: "user-1",
      role: "USER",
      subscriptionTier: "FREE",
    })

    const token = await jwtCallback(
      {
        token: {} as JWT,
        user: { id: "google-1", email: "test@example.com", name: "Test User" },
      },
      mockFindOrCreate
    )

    expect(mockFindOrCreate).toHaveBeenCalledWith("test@example.com", "Test User")
    expect(token.userId).toBe("user-1")
    expect(token.role).toBe("USER")
    expect(token.subscriptionTier).toBe("FREE")
    expect(token.gmailConnected).toBe(false)
    expect(token.lastActivity).toBeCloseTo(Date.now(), -2) // within ~100ms
  })

  it("skips upsert and preserves token fields on subsequent calls", async () => {
    const oldActivity = Date.now() - 1000
    const existingToken: JWT = {
      userId: "user-1",
      role: "USER",
      subscriptionTier: "PRO",
      gmailConnected: true,
      lastActivity: oldActivity,
    }

    const token = await jwtCallback(
      { token: existingToken, user: null },
      mockFindOrCreate
    )

    expect(mockFindOrCreate).not.toHaveBeenCalled()
    expect(token.userId).toBe("user-1")
    expect(token.subscriptionTier).toBe("PRO")
    expect(token.gmailConnected).toBe(true)
    // lastActivity should be refreshed to approximately now
    expect(token.lastActivity).toBeGreaterThan(oldActivity)
  })

  it("always updates lastActivity", async () => {
    const before = Date.now()
    const token = await jwtCallback({ token: {} as JWT, user: null }, mockFindOrCreate)
    expect(token.lastActivity).toBeGreaterThanOrEqual(before)
  })
})

// ── sessionCallback ───────────────────────────────────────────────────────────

describe("sessionCallback", () => {
  it("populates session.user from token fields", () => {
    const session = {
      user: { name: "Test", email: "test@example.com", image: null },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as unknown as Session

    const token: JWT = {
      userId: "user-1",
      role: "ADMIN",
      subscriptionTier: "PRO",
      gmailConnected: true,
      lastActivity: 1234567890,
    }

    const result = sessionCallback({ session, token })

    expect(result.user.id).toBe("user-1")
    expect(result.user.role).toBe("ADMIN")
    expect(result.user.subscriptionTier).toBe("PRO")
    expect(result.user.gmailConnected).toBe(true)
    expect(result.lastActivity).toBe(1234567890)
  })

  it("defaults gmailConnected to false when not on token", () => {
    const session = {
      user: { name: "Test", email: "test@example.com", image: null },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as unknown as Session

    const result = sessionCallback({ session, token: {} as JWT })
    expect(result.user.gmailConnected).toBe(false)
  })
})

// ── authorizedCallback ────────────────────────────────────────────────────────

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3000"))
}

function makeSession(overrides: Partial<Session["user"]> & { lastActivity?: number } = {}): Session {
  const { lastActivity = Date.now(), ...userOverrides } = overrides
  return {
    user: {
      id: "user-1",
      name: "Test",
      email: "test@example.com",
      image: null,
      role: "USER" as const,
      subscriptionTier: "FREE" as const,
      gmailConnected: false,
      ...userOverrides,
    },
    lastActivity,
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as unknown as Session
}

describe("authorizedCallback", () => {
  describe("idle timeout", () => {
    it("rejects session idle for more than 24 hours", () => {
      const staleActivity = Date.now() - IDLE_TIMEOUT_MS - 1000
      const session = makeSession({ lastActivity: staleActivity })
      const result = authorizedCallback({
        auth: session,
        request: makeRequest("/board"),
      })
      expect(result).toBe(false)
    })

    it("allows session active within 24 hours", () => {
      const recentActivity = Date.now() - 1000
      const session = makeSession({ lastActivity: recentActivity })
      const result = authorizedCallback({
        auth: session,
        request: makeRequest("/board"),
      })
      expect(result).toBe(true)
    })
  })

  describe("dashboard routes (/board, /settings, /onboarding)", () => {
    it("redirects to login when unauthenticated", () => {
      const result = authorizedCallback({
        auth: null,
        request: makeRequest("/board"),
      })
      expect(result).toBe(false)
    })

    it("allows access when authenticated", () => {
      const result = authorizedCallback({
        auth: makeSession(),
        request: makeRequest("/board"),
      })
      expect(result).toBe(true)
    })

    it("protects /settings routes", () => {
      const result = authorizedCallback({
        auth: null,
        request: makeRequest("/settings/account"),
      })
      expect(result).toBe(false)
    })

    it("redirects to login when unauthenticated on /onboarding", () => {
      const result = authorizedCallback({
        auth: null,
        request: makeRequest("/onboarding"),
      })
      expect(result).toBe(false)
    })

    it("allows authenticated access to /onboarding", () => {
      const result = authorizedCallback({
        auth: makeSession(),
        request: makeRequest("/onboarding"),
      })
      expect(result).toBe(true)
    })
  })

  describe("admin routes (/admin)", () => {
    it("returns 403 for authenticated USER accessing /admin", async () => {
      const result = authorizedCallback({
        auth: makeSession({ role: "USER" as const }),
        request: makeRequest("/admin"),
      })
      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      expect(response.status).toBe(403)
    })

    it("returns false (redirect to login) for unauthenticated /admin access", () => {
      const result = authorizedCallback({
        auth: null,
        request: makeRequest("/admin"),
      })
      expect(result).toBe(false)
    })

    it("allows ADMIN users to access /admin", () => {
      const result = authorizedCallback({
        auth: makeSession({ role: "ADMIN" as const }),
        request: makeRequest("/admin/dashboard"),
      })
      expect(result).toBe(true)
    })
  })

  describe("public routes", () => {
    it("allows unauthenticated access to /login", () => {
      const result = authorizedCallback({
        auth: null,
        request: makeRequest("/login"),
      })
      expect(result).toBe(true)
    })

    it("allows unauthenticated access to root", () => {
      const result = authorizedCallback({
        auth: null,
        request: makeRequest("/"),
      })
      expect(result).toBe(true)
    })
  })
})
