import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { fakeBoss, handlers } = vi.hoisted(() => ({
  fakeBoss: {
    on: vi.fn(),
    start: vi.fn(async () => {}),
    send: vi.fn(async () => "sent-id"),
    fetch: vi.fn(),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  },
  handlers: {
    "gmail-ingest-signals": vi.fn(),
    "vitality-recompute": vi.fn(),
  },
}))

vi.mock("@/lib/jobs", () => ({
  createBoss: vi.fn(() => fakeBoss),
  ensureQueues: vi.fn(async () => {}),
  JOB_HANDLERS: handlers,
  JOB_PROCESS_ORDER: ["gmail-ingest-signals", "vitality-recompute"],
}))

import { POST } from "./route"

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  Object.values(fakeBoss).forEach((fn) => {
    if (typeof fn === "function" && "mockClear" in fn) (fn as ReturnType<typeof vi.fn>).mockClear()
  })
  handlers["gmail-ingest-signals"].mockReset()
  handlers["vitality-recompute"].mockReset()
  process.env.CRON_SECRET = "test-secret"
})

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
})

function makeRequest(secret: string | null): Request {
  const headers = new Headers()
  if (secret !== null) headers.set("authorization", `Bearer ${secret}`)
  return new Request("http://localhost/api/jobs/process", {
    method: "POST",
    headers,
  })
}

describe("POST /api/jobs/process", () => {
  it("rejects requests without the CRON_SECRET", async () => {
    const res = await POST(makeRequest("wrong"))
    expect(res.status).toBe(401)
    expect(fakeBoss.start).not.toHaveBeenCalled()
  })

  it("rejects when CRON_SECRET env is unset", async () => {
    delete process.env.CRON_SECRET
    const res = await POST(makeRequest("anything"))
    expect(res.status).toBe(401)
  })

  it("sends and drains BOTH jobs in order, returning per-job results", async () => {
    fakeBoss.fetch
      .mockResolvedValueOnce([{ id: "job-gmail-1" }])
      .mockResolvedValueOnce([{ id: "job-recompute-1" }])
    handlers["gmail-ingest-signals"].mockResolvedValue({ users: 5, found: 2, revoked: 0, errors: [] })
    handlers["vitality-recompute"].mockResolvedValue({ processed: 12, changed: 3, errors: 0 })

    const res = await POST(makeRequest("test-secret"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      results: {
        "gmail-ingest-signals": {
          status: "completed",
          jobId: "job-gmail-1",
          result: { users: 5, found: 2, revoked: 0, errors: [] },
        },
        "vitality-recompute": {
          status: "completed",
          jobId: "job-recompute-1",
          result: { processed: 12, changed: 3, errors: 0 },
        },
      },
    })

    // Order matters: gmail must be sent + processed before recompute
    expect(fakeBoss.send.mock.calls.map((c) => c[0])).toEqual([
      "gmail-ingest-signals",
      "vitality-recompute",
    ])
    expect(handlers["gmail-ingest-signals"]).toHaveBeenCalled()
    expect(handlers["vitality-recompute"]).toHaveBeenCalled()
    expect(fakeBoss.complete).toHaveBeenCalledTimes(2)
    expect(fakeBoss.fail).not.toHaveBeenCalled()
    expect(fakeBoss.stop).toHaveBeenCalledWith({ graceful: false })
  })

  it("reports no-pending-job when fetch returns empty (stately no-op)", async () => {
    fakeBoss.fetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "job-recompute-1" }])
    handlers["vitality-recompute"].mockResolvedValue({ processed: 0, changed: 0, errors: 0 })

    const res = await POST(makeRequest("test-secret"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.results["gmail-ingest-signals"]).toEqual({ status: "no-pending-job" })
    expect(body.results["vitality-recompute"].status).toBe("completed")
    expect(handlers["gmail-ingest-signals"]).not.toHaveBeenCalled()
  })

  it("marks one job failed and continues to the next, returning 500 if any failed", async () => {
    fakeBoss.fetch
      .mockResolvedValueOnce([{ id: "job-gmail-1" }])
      .mockResolvedValueOnce([{ id: "job-recompute-1" }])
    handlers["gmail-ingest-signals"].mockRejectedValue(new Error("boom"))
    handlers["vitality-recompute"].mockResolvedValue({ processed: 0, changed: 0, errors: 0 })

    const res = await POST(makeRequest("test-secret"))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.results["gmail-ingest-signals"]).toEqual({
      status: "failed",
      jobId: "job-gmail-1",
      error: "boom",
    })
    expect(body.results["vitality-recompute"].status).toBe("completed")
    expect(fakeBoss.fail).toHaveBeenCalledWith("gmail-ingest-signals", "job-gmail-1", { error: "boom" })
    expect(fakeBoss.stop).toHaveBeenCalled()
  })
})
