import { describe, expect, it } from "vitest"
import { computeFileHash } from "./computeFileHash"

describe("computeFileHash", () => {
  it("matches the SHA-256 of an empty input", async () => {
    const empty = new Blob([])
    expect(await computeFileHash(empty)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
  })

  it('matches the SHA-256 of "hello"', async () => {
    const hello = new Blob(["hello"])
    expect(await computeFileHash(hello)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    )
  })

  it("returns the same hash for identical content regardless of filename", async () => {
    const a = new Blob(["abc123"])
    const b = new Blob(["abc123"])
    expect(await computeFileHash(a)).toBe(await computeFileHash(b))
  })

  it("returns different hashes for different content", async () => {
    const a = new Blob(["abc123"])
    const b = new Blob(["abc124"])
    expect(await computeFileHash(a)).not.toBe(await computeFileHash(b))
  })
})
