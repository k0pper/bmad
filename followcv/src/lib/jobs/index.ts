import { PgBoss } from "pg-boss"
import { handleVitalityRecompute } from "./vitality-recompute"
import { handleGmailIngestSignals } from "./gmail-ingest-signals"

export const JOB_VITALITY_RECOMPUTE = "vitality-recompute"
const JOB_VITALITY_RECOMPUTE_DLQ = "vitality-recompute-dlq"

export const JOB_GMAIL_INGEST_SIGNALS = "gmail-ingest-signals"
const JOB_GMAIL_INGEST_SIGNALS_DLQ = "gmail-ingest-signals-dlq"

export function createBoss(): PgBoss {
  const url = new URL(process.env.DATABASE_URL!)
  url.searchParams.delete("channel_binding")
  return new PgBoss(url.toString())
}

export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_VITALITY_RECOMPUTE_DLQ)
  await boss.createQueue(JOB_VITALITY_RECOMPUTE, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    policy: "stately",
    deadLetter: JOB_VITALITY_RECOMPUTE_DLQ,
  })

  await boss.createQueue(JOB_GMAIL_INGEST_SIGNALS_DLQ)
  await boss.createQueue(JOB_GMAIL_INGEST_SIGNALS, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    policy: "stately",
    deadLetter: JOB_GMAIL_INGEST_SIGNALS_DLQ,
  })
}

export const JOB_HANDLERS: Record<string, () => Promise<unknown>> = {
  [JOB_VITALITY_RECOMPUTE]: handleVitalityRecompute,
  [JOB_GMAIL_INGEST_SIGNALS]: handleGmailIngestSignals,
}

/**
 * Ordered list used by `/api/jobs/process` to drain jobs each tick.
 * Gmail ingest runs before vitality recompute so audit rows it writes
 * are visible to the recompute pass on the same tick (Story 6.2 AC7).
 */
export const JOB_PROCESS_ORDER: string[] = [
  JOB_GMAIL_INGEST_SIGNALS,
  JOB_VITALITY_RECOMPUTE,
]
