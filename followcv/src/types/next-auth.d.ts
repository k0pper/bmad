import type { DefaultSession } from "next-auth"
import type { UserRole, SubscriptionTier } from "@/generated/prisma/client"

declare module "next-auth" {
  interface Session {
    lastActivity: number
    user: {
      id: string
      role: UserRole
      subscriptionTier: SubscriptionTier
      gmailConnected: boolean
    } & DefaultSession["user"]
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string
    role?: UserRole
    subscriptionTier?: SubscriptionTier
    gmailConnected?: boolean
    lastActivity?: number
  }
}
