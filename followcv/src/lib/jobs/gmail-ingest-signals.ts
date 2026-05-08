import { prisma } from "@/lib/db"
import { processGmailSignalsForUser } from "@/lib/services/gmail-signal-processor"

/**
 * pg-boss job handler: gmail-ingest-signals (Story 6.2).
 *
 * Iterates all Pro users with a connected Gmail account and drives
 * `processGmailSignalsForUser` for each one. Per-user errors are caught
 * and accumulated; the batch never aborts because of a single user. Only
 * a system-level exception (DB unreachable, etc.) propagates out and
 * sends the job to pg-boss's DLQ.
 */

export type GmailIngestSummary = {
  users: number
  found: number
  revoked: number
  errors: { userId: string; error: string }[]
}

export async function handleGmailIngestSignals(): Promise<GmailIngestSummary> {
  const now = new Date()

  const eligible = await prisma.user.findMany({
    where: {
      subscriptionTier: "PRO",
      gmailToken: { isNot: null },
    },
    select: { id: true },
  })

  let found = 0
  let revoked = 0
  const errors: { userId: string; error: string }[] = []

  for (const { id: userId } of eligible) {
    try {
      const result = await processGmailSignalsForUser(userId, now)
      found += result.found
      if (result.status === "revoked") revoked++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[gmail-ingest-signals]", { userId, error: message })
      errors.push({ userId, error: message })
    }
  }

  return { users: eligible.length, found, revoked, errors }
}
