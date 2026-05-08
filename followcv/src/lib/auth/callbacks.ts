import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import type { JWT } from "@auth/core/jwt"
import type { Session, User } from "next-auth"
import type { AdapterUser } from "@auth/core/adapters"
import type { UserRole, SubscriptionTier } from "@/generated/prisma/client"
import { IDLE_TIMEOUT_MS } from "./constants"

type JwtCallbackParams = {
  token: JWT
  user?: User | AdapterUser | null
  trigger?: "signIn" | "signUp" | "update"
  /**
   * The payload passed to `unstable_update()`. Auth.js calls the JWT
   * callback with `trigger === "update"` when an explicit session update
   * is requested (e.g. after Gmail OAuth connect). The shape is
   * `Partial<Session> | { user: Partial<Session["user"]> }`.
   */
  session?: { user?: Partial<{ gmailConnected: boolean }> } | null
}

type SessionCallbackParams = {
  session: Session
  token: JWT
}

type AuthorizedCallbackParams = {
  auth: Session | null
  request: NextRequest
}

type DbUser = { id: string; role: UserRole; subscriptionTier: SubscriptionTier }

export async function jwtCallback(
  { token, user, trigger, session }: JwtCallbackParams,
  findOrCreateUser: (email: string, name: string | null) => Promise<DbUser>
): Promise<JWT> {
  if (user?.email) {
    const dbUser = await findOrCreateUser(user.email, user.name ?? null)
    token.userId = dbUser.id
    token.role = dbUser.role
    token.subscriptionTier = dbUser.subscriptionTier
    token.gmailConnected = false
  }
  // `unstable_update({ user: { gmailConnected } })` flows through here.
  // The JWT-cached `gmailConnected` is a UI hint only — every server-side
  // gate must re-read from the DB (see story 6.1 dev notes).
  if (trigger === "update" && session?.user) {
    if (typeof session.user.gmailConnected === "boolean") {
      token.gmailConnected = session.user.gmailConnected
    }
  }
  token.lastActivity = Date.now()
  return token
}

export function sessionCallback({ session, token }: SessionCallbackParams): Session {
  session.user.id = (token.userId ?? "") as string
  session.user.role = (token.role ?? "USER") as UserRole
  session.user.subscriptionTier = (token.subscriptionTier ?? "FREE") as SubscriptionTier
  session.user.gmailConnected = (token.gmailConnected ?? false) as boolean
  session.lastActivity = (token.lastActivity ?? 0) as number
  return session
}

export function authorizedCallback({ auth: session, request }: AuthorizedCallbackParams): boolean | NextResponse {
  const { pathname } = request.nextUrl

  if (session?.lastActivity) {
    const idleMs = Date.now() - session.lastActivity
    if (idleMs > IDLE_TIMEOUT_MS) {
      return false
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!session) return false
    if (session.user.role !== ("ADMIN" as UserRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return true
  }

  const isDashboard =
    pathname.startsWith("/board") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/onboarding")
  if (isDashboard) return !!session

  return true
}
