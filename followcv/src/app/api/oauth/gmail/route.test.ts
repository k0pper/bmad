import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  unstable_update: vi.fn(),
}))
vi.mock("@/lib/app-url", () => ({
  getAppUrl: vi.fn(() => "https://app.example.com"),
}))
vi.mock("@/lib/services/gmail-token-service", () => ({
  setGmailToken: vi.fn(),
}))
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

import { GET } from "./route"
import { auth, unstable_update } from "@/lib/auth"
import { setGmailToken } from "@/lib/services/gmail-token-service"
import { cookies } from "next/headers"
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth-state"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>
const mockUpdate = unstable_update as unknown as ReturnType<typeof vi.fn>
const mockSetToken = setGmailToken as unknown as ReturnType<typeof vi.fn>
const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>

const STATE = "valid-state-token"

const originalEnv = {
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
}

let cookiesSet: ReturnType<typeof vi.fn>
let cookiesGet: ReturnType<typeof vi.fn>

function buildRequest(query: Record<string, string>): NextRequest {
  const url = new URL("https://app.example.com/api/oauth/gmail")
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_GOOGLE_ID = "client-id"
  process.env.AUTH_GOOGLE_SECRET = "client-secret"

  cookiesSet = vi.fn()
  cookiesGet = vi.fn().mockReturnValue({ value: STATE })
  mockCookies.mockResolvedValue({
    set: cookiesSet,
    get: cookiesGet,
    delete: vi.fn(),
  })

  // Default: signed-in user
  mockAuth.mockResolvedValue({ user: { id: "user-1" } })
  mockUpdate.mockResolvedValue(null)
  mockSetToken.mockResolvedValue(undefined)
})

afterEach(() => {
  if (originalEnv.AUTH_GOOGLE_ID === undefined) {
    delete process.env.AUTH_GOOGLE_ID
  } else {
    process.env.AUTH_GOOGLE_ID = originalEnv.AUTH_GOOGLE_ID
  }
  if (originalEnv.AUTH_GOOGLE_SECRET === undefined) {
    delete process.env.AUTH_GOOGLE_SECRET
  } else {
    process.env.AUTH_GOOGLE_SECRET = originalEnv.AUTH_GOOGLE_SECRET
  }
  vi.unstubAllGlobals()
})

describe("GET /api/oauth/gmail", () => {
  it("redirects to /settings/gmail?denied=1 on access_denied", async () => {
    const res = await GET(buildRequest({ error: "access_denied" }))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/settings/gmail?denied=1",
    )
    expect(mockSetToken).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    // State cookie cleared
    expect(cookiesSet).toHaveBeenCalledWith(
      GMAIL_OAUTH_STATE_COOKIE,
      "",
      expect.objectContaining({ maxAge: 0 }),
    )
  })

  it("redirects with ?error= on other Google errors", async () => {
    const res = await GET(buildRequest({ error: "server_error" }))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/settings/gmail?error=server_error",
    )
  })

  it("returns 400 when code or state missing", async () => {
    const res = await GET(buildRequest({}))
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/missing/i)
  })

  it("returns 400 when state cookie does not match query state", async () => {
    cookiesGet.mockReturnValue({ value: "different-state" })
    const res = await GET(buildRequest({ code: "abc", state: STATE }))
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/invalid oauth state/i)
    expect(mockSetToken).not.toHaveBeenCalled()
  })

  it("returns 400 when state cookie missing", async () => {
    cookiesGet.mockReturnValue(undefined)
    const res = await GET(buildRequest({ code: "abc", state: STATE }))
    expect(res.status).toBe(400)
  })

  it("redirects to /login when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(buildRequest({ code: "abc", state: STATE }))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://app.example.com/login")
  })

  it("returns 500 when AUTH_GOOGLE_ID is missing", async () => {
    delete process.env.AUTH_GOOGLE_ID
    const res = await GET(buildRequest({ code: "abc", state: STATE }))
    expect(res.status).toBe(500)
  })

  it("redirects to ?error=token_exchange_failed when Google returns 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("invalid_grant", { status: 400 }),
      ),
    )
    const res = await GET(buildRequest({ code: "abc", state: STATE }))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/settings/gmail?error=token_exchange_failed",
    )
    expect(mockSetToken).not.toHaveBeenCalled()
  })

  it("redirects to ?error=no_refresh_token when Google omits refresh_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "ya29.x", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    )
    const res = await GET(buildRequest({ code: "abc", state: STATE }))
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/settings/gmail?error=no_refresh_token",
    )
  })

  it("redirects to ?error=profile_fetch_failed when Gmail profile call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // 1st call: token exchange — returns access + refresh tokens
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "ya29.x",
              refresh_token: "1//refresh",
              expires_in: 3600,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
        // 2nd call: gmail profile — fails
        .mockResolvedValueOnce(new Response("nope", { status: 500 })),
    )

    const res = await GET(buildRequest({ code: "abc", state: STATE }))
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/settings/gmail?error=profile_fetch_failed",
    )
    expect(mockSetToken).not.toHaveBeenCalled()
  })

  it("happy path: stores token, updates session, redirects to ?connected=1", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "ya29.x",
            refresh_token: "1//refresh",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ emailAddress: "marcus@example.com" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    const res = await GET(buildRequest({ code: "abc", state: STATE }))

    // Token exchange POST shape
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token")
    expect((tokenInit as RequestInit).method).toBe("POST")
    const body = (tokenInit as RequestInit).body as URLSearchParams
    expect(body.get("code")).toBe("abc")
    expect(body.get("client_id")).toBe("client-id")
    expect(body.get("client_secret")).toBe("client-secret")
    expect(body.get("grant_type")).toBe("authorization_code")
    expect(body.get("redirect_uri")).toBe(
      "https://app.example.com/api/oauth/gmail",
    )

    // Profile fetch shape
    const [profileUrl, profileInit] = fetchMock.mock.calls[1]
    expect(profileUrl).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    )
    expect(
      (profileInit as RequestInit).headers as Record<string, string>,
    ).toEqual({ Authorization: "Bearer ya29.x" })

    // Token persisted with the right shape
    expect(mockSetToken).toHaveBeenCalledTimes(1)
    const tokenArg = mockSetToken.mock.calls[0][0]
    expect(tokenArg.userId).toBe("user-1")
    expect(tokenArg.accessToken).toBe("ya29.x")
    expect(tokenArg.refreshToken).toBe("1//refresh")
    expect(tokenArg.connectedEmail).toBe("marcus@example.com")
    expect(tokenArg.expiresAt).toBeInstanceOf(Date)

    // JWT updated
    expect(mockUpdate).toHaveBeenCalledWith({
      user: { gmailConnected: true },
    })

    // Redirect + cookie cleared
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/settings/gmail?connected=1",
    )
    expect(cookiesSet).toHaveBeenCalledWith(
      GMAIL_OAUTH_STATE_COOKIE,
      "",
      expect.objectContaining({ maxAge: 0 }),
    )
  })
})
