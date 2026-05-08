import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { auth, unstable_update } from "@/lib/auth"
import { setGmailToken } from "@/lib/services/gmail-token-service"
import { getAppUrl } from "@/lib/app-url"
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth-state"

// Reads cookies + secrets, dispatches network calls, must not be cached.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SETTINGS_PATH = "/settings/gmail"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_PROFILE_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/profile"

type ResolvedCookieStore = Awaited<ReturnType<typeof cookies>>

function clearStateCookie(store: ResolvedCookieStore): void {
  store.set(GMAIL_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/oauth/gmail",
    maxAge: 0,
  })
}

function settingsRedirect(query: string): NextResponse {
  return NextResponse.redirect(`${getAppUrl()}${SETTINGS_PATH}${query}`)
}

/**
 * Custom Google OAuth 2.0 callback for the Gmail-readonly grant.
 * Reuses the AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET Google Cloud client —
 * register `/api/oauth/gmail` as an authorized redirect URI alongside
 * the Auth.js callback.
 *
 * The flow is *separate* from Auth.js login (architecture lines 47, 168–173).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url)
  const error = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieStore = await cookies()

  // ── Branch 1: Google reported an error (typically access_denied) ─────────
  if (error === "access_denied") {
    clearStateCookie(cookieStore)
    return settingsRedirect("?denied=1")
  }
  if (error) {
    clearStateCookie(cookieStore)
    return settingsRedirect(`?error=${encodeURIComponent(error)}`)
  }

  // ── Branch 2: missing code/state from a malformed callback ───────────────
  if (!code || !state) {
    clearStateCookie(cookieStore)
    return new NextResponse("Missing code or state", { status: 400 })
  }

  // ── Branch 3: CSRF state validation ──────────────────────────────────────
  const stateCookie = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value
  if (!stateCookie || stateCookie !== state) {
    clearStateCookie(cookieStore)
    return new NextResponse("Invalid OAuth state", { status: 400 })
  }

  // ── Branch 4: user must be signed in ─────────────────────────────────────
  const session = await auth()
  if (!session?.user?.id) {
    clearStateCookie(cookieStore)
    return NextResponse.redirect(`${getAppUrl()}/login`)
  }

  const clientId = process.env.AUTH_GOOGLE_ID
  const clientSecret = process.env.AUTH_GOOGLE_SECRET
  if (!clientId || !clientSecret) {
    clearStateCookie(cookieStore)
    return new NextResponse("Google OAuth not configured", { status: 500 })
  }

  // ── Branch 5: token exchange ─────────────────────────────────────────────
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${getAppUrl()}/api/oauth/gmail`,
      grant_type: "authorization_code",
    }),
  })

  if (!tokenRes.ok) {
    clearStateCookie(cookieStore)
    return settingsRedirect("?error=token_exchange_failed")
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!tokenJson.access_token) {
    clearStateCookie(cookieStore)
    return settingsRedirect("?error=no_access_token")
  }
  if (!tokenJson.refresh_token) {
    // `prompt=consent` should make this impossible — defend anyway.
    clearStateCookie(cookieStore)
    return settingsRedirect("?error=no_refresh_token")
  }

  // ── Branch 6: read the connected email via Gmail profile ─────────────────
  const profileRes = await fetch(GMAIL_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  if (!profileRes.ok) {
    clearStateCookie(cookieStore)
    return settingsRedirect("?error=profile_fetch_failed")
  }
  const profile = (await profileRes.json()) as { emailAddress?: string }
  if (!profile.emailAddress) {
    clearStateCookie(cookieStore)
    return settingsRedirect("?error=no_email")
  }

  // ── Branch 7: persist token + flip JWT flag ──────────────────────────────
  const expiresAt = new Date(
    Date.now() + (tokenJson.expires_in ?? 3600) * 1000,
  )
  await setGmailToken({
    userId: session.user.id,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt,
    connectedEmail: profile.emailAddress,
  })

  await unstable_update({ user: { gmailConnected: true } })

  clearStateCookie(cookieStore)
  return settingsRedirect("?connected=1")
}
