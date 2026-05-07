import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  put: vi.fn(),
}))

import { createSnapshot } from "./cv-snapshot-service"
import { get, put } from "@vercel/blob"

const mockGet = get as unknown as ReturnType<typeof vi.fn>
const mockPut = put as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

function makeStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

describe("createSnapshot", () => {
  it("reads source bytes via get() and writes them to a fresh path via put()", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    mockGet.mockResolvedValue({ stream: makeStream(bytes) })
    mockPut.mockResolvedValue({
      url: "https://abc.private.blob.vercel-storage.com/cv/user-1/abc.pdf",
    })

    const result = await createSnapshot({
      userId: "user-1",
      cvVersion: { s3Key: "https://example/source.pdf" },
    })

    expect(mockGet).toHaveBeenCalledWith("https://example/source.pdf", {
      access: "private",
    })
    expect(mockPut).toHaveBeenCalledTimes(1)
    const [pathArg, bufferArg, opts] = mockPut.mock.calls[0]
    expect(pathArg).toMatch(/^cv\/user-1\/[0-9a-fA-F-]{36}\.pdf$/)
    expect(bufferArg).toBeInstanceOf(ArrayBuffer)
    expect(opts).toEqual({
      access: "private",
      contentType: "application/pdf",
    })
    expect(result.snapshotId).toMatch(/^[0-9a-fA-F-]{36}$/)
    expect(result.snapshotUrl).toBe(
      "https://abc.private.blob.vercel-storage.com/cv/user-1/abc.pdf",
    )
  })

  it("throws when the source blob is missing", async () => {
    mockGet.mockResolvedValue(null)

    await expect(
      createSnapshot({
        userId: "user-1",
        cvVersion: { s3Key: "https://example/missing.pdf" },
      }),
    ).rejects.toThrow(/Failed to read source CV/)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it("throws when get() rejects", async () => {
    mockGet.mockRejectedValue(new Error("network"))

    await expect(
      createSnapshot({
        userId: "user-1",
        cvVersion: { s3Key: "https://example/source.pdf" },
      }),
    ).rejects.toThrow(/Failed to read source CV/)
  })

  it("throws when put() rejects (no DB writes here, caller cleans up)", async () => {
    mockGet.mockResolvedValue({ stream: makeStream(new Uint8Array([0])) })
    mockPut.mockRejectedValue(new Error("storage outage"))

    await expect(
      createSnapshot({
        userId: "user-1",
        cvVersion: { s3Key: "https://example/source.pdf" },
      }),
    ).rejects.toThrow(/Failed to write snapshot/)
  })
})
