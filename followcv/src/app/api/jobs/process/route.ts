import {
  createBoss,
  ensureQueues,
  JOB_HANDLERS,
  JOB_PROCESS_ORDER,
} from "@/lib/jobs"

export const maxDuration = 60

type JobOutcome =
  | { status: "no-pending-job" }
  | { status: "completed"; jobId: string; result: unknown }
  | { status: "failed"; jobId: string; error: string }

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

    // Send each job once per tick (stately policy makes this a no-op if one
    // is already queued or active). Then drain in order.
    const results: Record<string, JobOutcome> = {}
    let anyFailed = false

    for (const jobName of JOB_PROCESS_ORDER) {
      await boss.send(jobName, {})
      const jobs = await boss.fetch(jobName)
      if (!jobs || jobs.length === 0) {
        results[jobName] = { status: "no-pending-job" }
        continue
      }
      const [job] = jobs
      try {
        const handler = JOB_HANDLERS[jobName]
        const result = await handler()
        await boss.complete(jobName, job.id, result as object)
        results[jobName] = { status: "completed", jobId: job.id, result }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await boss.fail(jobName, job.id, { error: message })
        results[jobName] = { status: "failed", jobId: job.id, error: message }
        anyFailed = true
      }
    }

    return Response.json({ results }, { status: anyFailed ? 500 : 200 })
  } finally {
    await boss.stop({ graceful: false })
  }
}
