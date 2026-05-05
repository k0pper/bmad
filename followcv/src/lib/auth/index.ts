import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/db"
import { jwtCallback, sessionCallback, authorizedCallback } from "./callbacks"

export { IDLE_TIMEOUT_MS } from "./constants"

export const { handlers, auth, signIn, signOut } = NextAuth({
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
      jwtCallback(params, (email, name) =>
        prisma.user.upsert({
          where: { email },
          create: { email, name },
          update: {},
          select: { id: true, role: true, subscriptionTier: true },
        })
      ),
    session: sessionCallback,
    authorized: authorizedCallback,
  },
})
