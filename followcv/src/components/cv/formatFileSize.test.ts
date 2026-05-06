import { describe, expect, it } from "vitest"
import { formatFileSize } from "./formatFileSize"

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1500, "1.5 KB"],
    [1024 * 1024 - 1, "1024.0 KB"],
    [1024 * 1024, "1.0 MB"],
    [2_345_000, "2.2 MB"],
    [10 * 1024 * 1024, "10.0 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected)
  })

  it("returns a placeholder for negative or non-finite inputs", () => {
    expect(formatFileSize(-1)).toBe("—")
    expect(formatFileSize(Infinity)).toBe("—")
    expect(formatFileSize(NaN)).toBe("—")
  })
})
