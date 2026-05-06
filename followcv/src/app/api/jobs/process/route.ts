import { createBoss, ensureQueues, JOB_VITALITY_RECOMPUTE, JOB_HANDLERS } from "@/lib/jobs"

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization")
  const secret = authHeader?.replace("Bearer ", "")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const boss = createBoss()
  boss.on("error", (err: unknown) => console.error("[pg-boss]", err))

  try {
    await boss.start()
    await ensureQueues(boss)

    // Send a new job (stately policy: no-op if one is already queued or active)
    await boss.send(JOB_VITALITY_RECOMPUTE, {})

    // Fetch any pending job (could be the one just sent or a retry from earlier)
    const jobs = await boss.fetch(JOB_VITALITY_RECOMPUTE)

    if (!jobs || jobs.length === 0) {
      return Response.json({ message: "no pending jobs" })
    }

    const [job] = jobs

    try {
      const result = await JOB_HANDLERS[JOB_VITALITY_RECOMPUTE]()
      await boss.complete(JOB_VITALITY_RECOMPUTE, job.id, result as object)
      return Response.json({ jobId: job.id, ...(result as object) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await boss.fail(JOB_VITALITY_RECOMPUTE, job.id, { error: message })
      return Response.json({ error: message }, { status: 500 })
    }
  } finally {
    await boss.stop({ graceful: false })
  }
}
