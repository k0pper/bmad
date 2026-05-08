import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { GmailConnectPromptClient } from "./GmailConnectPromptClient"

/**
 * Sidebar prompt that nudges Pro users to connect Gmail once they've
 * imported a few listings. Story 6.1 AC10.
 *
 * Server-side gate: subscription === PRO AND no GmailToken row AND active
 * listings count >= 3. Returns null when the gate fails — including for
 * free-tier users (they have a different surface, the ProGatePattern on
 * /settings/gmail). Dismissal is handled client-side via localStorage.
 */
export async function GmailConnectPrompt(): Promise<React.ReactElement | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const [user, gmailToken, listingCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    }),
    prisma.gmailToken.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
    prisma.jobListing.count({
      where: { userId: session.user.id, deletedAt: null },
    }),
  ])

  if (user?.subscriptionTier !== "PRO") return null
  if (gmailToken) return null
  if (listingCount < 3) return null

  return <GmailConnectPromptClient />
}
