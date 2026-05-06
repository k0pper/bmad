import { PgBoss } from "pg-boss"
import { handleVitalityRecompute } from "./vitality-recompute"

export const JOB_VITALITY_RECOMPUTE = "vitality-recompute"
const JOB_VITALITY_RECOMPUTE_DLQ = "vitality-recompute-dlq"

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
}

export const JOB_HANDLERS: Record<string, () => Promise<unknown>> = {
  [JOB_VITALITY_RECOMPUTE]: handleVitalityRecompute,
}
