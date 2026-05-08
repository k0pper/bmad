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
})
