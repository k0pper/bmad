"use server"

import crypto from "node:crypto"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { getAppUrl } from "@/lib/app-url"
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth-state"

type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"

/**
 * Initiate the Gmail-readonly OAuth dance. This is a *separate* OAuth flow
 * from the user's Google login (Auth.js v5) — it requests only the
 * `gmail.readonly` scope and stores tokens in a dedicated `GmailToken`
 * table (architecture lines 168–173).
 *
 * Sets a CSRF state cookie scoped to the callback route, then redirects to
 * Google's authorization URL. The callback at `/api/oauth/gmail` validates
 * the state and exchanges the code for tokens.
 *
 * Reuses the existing `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` Google Cloud
 * OAuth client — register `/api/oauth/gmail` as a second authorized
 * redirect URI alongside the existing Auth.js callback.
 *
 * On success this function does not return — `redirect()` throws
 * `NEXT_REDIRECT` which Next.js handles. On error it returns an
 * `ActionResult` for the caller to surface inline.
 */
export async function startGmailOauth(): Promise<ActionResult<never>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { data: null, error: "Unauthorized" }
  }

  const clientId = process.env.AUTH_GOOGLE_ID
  if (!clientId) {
    return { data: null, error: "Google OAuth is not configured on the server" }
  }

  const state = crypto.randomBytes(32).toString("hex")
  const cookieStore = await cookies()
  cookieStore.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/oauth/gmail",
    maxAge: 600,
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getAppUrl()}/api/oauth/gmail`,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    // Forces Google to always return a refresh_token, even for users who
    // previously consented. Without this, returning users sometimes get
    // only an access token and our flow breaks silently.
    prompt: "consent",
    state,
    include_granted_scopes: "true",
  })

  redirect(`${GOOGLE_AUTHORIZE_URL}?${params.toString()}`)
}
