import { describe, expect, it } from "vitest"
import { buildContentDisposition } from "./contentDisposition"

describe("buildContentDisposition", () => {
  it("emits both filename and filename* parts for an ASCII name", () => {
    expect(buildContentDisposition("inline", "report.pdf")).toBe(
      `inline; filename="report.pdf"; filename*=UTF-8''report.pdf`
    )
  })

  it("replaces non-ASCII chars in filename= with underscores", () => {
    // U+2014 em-dash is the regression case (CV — 2026).
    expect(
      buildContentDisposition("inline", "CV — 2026-05-06.pdf")
    ).toBe(
      `inline; filename="CV _ 2026-05-06.pdf"; filename*=UTF-8''CV%20%E2%80%94%202026-05-06.pdf`
    )
  })

  it("preserves the original UTF-8 in filename* via percent-encoding", () => {
    const out = buildContentDisposition("attachment", "café résumé.pdf")
    expect(out).toContain('filename="caf_ r_sum_.pdf"')
    expect(out).toContain(
      "filename*=UTF-8''caf%C3%A9%20r%C3%A9sum%C3%A9.pdf"
    )
  })

  it("strips header-unsafe quote / backslash / CR / LF in the ASCII fallback", () => {
    const out = buildContentDisposition("inline", `weird"name\\with\rline\nbreaks.pdf`)
    expect(out).toContain('filename="weird_name_with_line_breaks.pdf"')
  })

  it.each([
    "CV — 2026-05-06.pdf",
    "naïve_📄.pdf",
    "報告.pdf",
    `quoted"name.pdf`,
    "all\rnew\nlines.pdf",
  ])(
    "produces a valid ByteString header for: %s",
    (name) => {
      const out = buildContentDisposition("inline", name)
      // ByteString = each char's code point ≤ 255.
      for (let i = 0; i < out.length; i++) {
        expect(out.charCodeAt(i)).toBeLessThanOrEqual(255)
      }
    }
  )

  it("supports the attachment disposition", () => {
    expect(buildContentDisposition("attachment", "x.pdf")).toMatch(
      /^attachment;/
    )
  })
})
