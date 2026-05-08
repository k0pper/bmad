import { describe, it, expect } from "vitest"
import { manualImportSchema, updateListingSchema } from "./listing"

describe("listing schemas — companyDomain normalisation", () => {
  it("lower-cases bare hosts on manual import", () => {
    const parsed = manualImportSchema.parse({
      title: "Dev",
      company: "Acme",
      companyDomain: "ACME.COM",
    })
    expect(parsed.companyDomain).toBe("acme.com")
  })

  it("lower-cases full URLs and strips www on manual import", () => {
    const parsed = manualImportSchema.parse({
      title: "Dev",
      company: "Acme",
      companyDomain: "https://WWW.Careers.Acme.COM/jobs",
    })
    expect(parsed.companyDomain).toBe("careers.acme.com")
  })

  it("trims whitespace and yields a clean lower-cased host on update", () => {
    const parsed = updateListingSchema.parse({
      title: "Dev",
      company: "Acme",
      companyDomain: "  ACME.COM  ",
      salaryCurrency: "USD",
    })
    expect(parsed.companyDomain).toBe("acme.com")
  })

  it("treats empty/whitespace companyDomain as null on update (no spurious value stored)", () => {
    const parsed = updateListingSchema.parse({
      title: "Dev",
      company: "Acme",
      companyDomain: "   ",
      salaryCurrency: "USD",
    })
    expect(parsed.companyDomain).toBeNull()
  })

  it("rejects job-board hosts a user pastes into the domain field", () => {
    // The user-reported bug: typing/pasting "stepstone.de" into the
    // companyDomain field would silently make Gmail signals search for
    // emails from the job board. Schema-level deny-list closes the gap.
    for (const board of ["stepstone.de", "https://www.stepstone.de", "linkedin.com/company/acme"]) {
      const parsed = updateListingSchema.parse({
        title: "Dev",
        company: "Acme",
        companyDomain: board,
        salaryCurrency: "USD",
      })
      expect(parsed.companyDomain, `denied for ${board}`).toBeNull()
    }
  })

  it("rejects path-only / free-text junk that the URL parser can't handle", () => {
    // The catch path used to lower-case the raw input and store it
    // verbatim — `"/jobs/123"` would become an unusable companyDomain.
    for (const junk of ["/jobs/123", "hello world", "acme", "..."]) {
      const parsed = updateListingSchema.parse({
        title: "Dev",
        company: "Acme",
        companyDomain: junk,
        salaryCurrency: "USD",
      })
      expect(parsed.companyDomain, `rejected for ${junk}`).toBeNull()
    }
  })
})
