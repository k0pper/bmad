import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/db"
import { jwtCallback, sessionCallback, authorizedCallback } from "./callbacks"

export { IDLE_TIMEOUT_MS } from "./constants"

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  providers: [Google],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30-day sliding cookie expiry
    updateAge: 0, // re-issue JWT on every authenticated request to keep lastActivity fresh
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    jwt: (params) =>
      jwtCallback(params, async (email, name) => {
        // upsert is not supported by PrismaNeonHttp (no transactions in HTTP mode)
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, subscriptionTier: true },
        })
        if (existing) return existing
        return prisma.user.create({
          data: { email, name },
          select: { id: true, role: true, subscriptionTier: true },
        })
      }),
    session: sessionCallback,
    authorized: authorizedCallback,
  },
})
