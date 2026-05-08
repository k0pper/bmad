import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/app-url", () => ({
  getAppUrl: vi.fn(() => "https://app.example.com"),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((): never => {
    const err = new Error("NEXT_REDIRECT")
    ;(err as Error & { digest?: string }).digest = "NEXT_REDIRECT;replace"
    throw err
  }),
}))

import { startGmailOauth } from "./connect-gmail"
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth-state"
import { auth } from "@/lib/auth"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const mockedCookies = cookies as unknown as ReturnType<typeof vi.fn>
const redirectFn = redirect as unknown as ReturnType<typeof vi.fn>
let cookiesSet: ReturnType<typeof vi.fn>

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>

const originalClientId = process.env.AUTH_GOOGLE_ID

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_GOOGLE_ID = "test-client-id.apps.googleusercontent.com"
  cookiesSet = vi.fn()
  mockedCookies.mockResolvedValue({
    set: cookiesSet,
    get: vi.fn(),
    delete: vi.fn(),
  })
})

afterEach(() => {
  if (originalClientId === undefined) {
    delete process.env.AUTH_GOOGLE_ID
  } else {
    process.env.AUTH_GOOGLE_ID = originalClientId
  }
})

describe("startGmailOauth", () => {
  it("returns Unauthorized when no session", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await startGmailOauth()
    expect(r).toEqual({ data: null, error: "Unauthorized" })
    expect(cookiesSet).not.toHaveBeenCalled()
    expect(redirectFn).not.toHaveBeenCalled()
  })

  it("returns config error when AUTH_GOOGLE_ID is missing", async () => {
    delete process.env.AUTH_GOOGLE_ID
    mockAuth.mockResolvedValue({ user: { id: "user-1" } })
    const r = await startGmailOauth()
    expect(r).toEqual({
      data: null,
      error: "Google OAuth is not configured on the server",
    })
    expect(redirectFn).not.toHaveBeenCalled()
  })

  it("sets a state cookie and redirects to Google's authorize URL", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } })

    await expect(startGmailOauth()).rejects.toThrow("NEXT_REDIRECT")

    // Cookie set with secure attributes
    expect(cookiesSet).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookiesSet.mock.calls[0]
    expect(name).toBe(GMAIL_OAUTH_STATE_COOKIE)
    expect(value).toMatch(/^[0-9a-f]{64}$/)
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/api/oauth/gmail",
      maxAge: 600,
    })

    // Redirect URL composition
    expect(redirectFn).toHaveBeenCalledTimes(1)
    const url = new URL(redirectFn.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    )
    expect(url.searchParams.get("client_id")).toBe(
      "test-client-id.apps.googleusercontent.com",
    )
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/oauth/gmail",
    )
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.readonly",
    )
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.get("include_granted_scopes")).toBe("true")
    // state in URL must match the cookie value
    expect(url.searchParams.get("state")).toBe(value)
  })
})
