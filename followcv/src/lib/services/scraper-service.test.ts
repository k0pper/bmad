import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    scrapeLog: { create: vi.fn() },
  },
}))

import { scrapeJobListing } from "./scraper-service"
import { prisma } from "@/lib/db"

type MockPrisma = {
  scrapeLog: { create: ReturnType<typeof vi.fn> }
}

const mock = prisma as unknown as MockPrisma
const mockScrapeLogCreate = vi.mocked(mock.scrapeLog.create)

function makeHtmlWithJsonLd(jsonLd: object): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head></html>`
}

beforeEach(() => {
  mockScrapeLogCreate.mockReset()
  mockScrapeLogCreate.mockResolvedValue({})
  vi.stubGlobal("fetch", vi.fn())
})

describe("scrapeJobListing", () => {
  it("extracts all fields from a valid JobPosting JSON-LD", async () => {
    const jobPosting = {
      "@type": "JobPosting",
      title: "Senior Engineer",
      hiringOrganization: { name: "Acme Corp" },
      jobLocation: { address: { addressLocality: "San Francisco" } },
      baseSalary: { currency: "USD", value: { minValue: 120000, maxValue: 180000 } },
      datePosted: "2025-06-01",
      validThrough: "2025-07-01",
    }
    const html = makeHtmlWithJsonLd(jobPosting)
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }))

    const result = await scrapeJobListing("https://jobs.example.com/engineer", "user-1")

    expect(result.error).toBeNull()
    expect(result.data?.title).toBe("Senior Engineer")
    expect(result.data?.company).toBe("Acme Corp")
    expect(result.data?.location).toBe("San Francisco")
    expect(result.data?.salaryMin).toBe(120000)
    expect(result.data?.salaryMax).toBe(180000)
    expect(result.data?.salaryCurrency).toBe("USD")
    expect(result.data?.companyDomain).toBe("example.com")
    expect(result.data?.postedAt).toBeInstanceOf(Date)
    expect(result.data?.closingDate).toBeInstanceOf(Date)
  })

  it("extracts domain from URL hostname", async () => {
    const jobPosting = { "@type": "JobPosting", title: "Dev" }
    const html = makeHtmlWithJsonLd(jobPosting)
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }))

    const result = await scrapeJobListing("https://careers.bigcorp.co.uk/jobs/123", "user-1")

    expect(result.data?.companyDomain).toBe("co.uk")
  })

  it("handles array jobLocation", async () => {
    const jobPosting = {
      "@type": "JobPosting",
      title: "Dev",
      jobLocation: [{ address: { addressLocality: "New York" } }],
    }
    const html = makeHtmlWithJsonLd(jobPosting)
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }))

    const result = await scrapeJobListing("https://jobs.example.com/dev", "user-1")

    expect(result.data?.location).toBe("New York")
  })

  it("returns partial when some fields are missing", async () => {
    const jobPosting = { "@type": "JobPosting", title: "Engineer" }
    const html = makeHtmlWithJsonLd(jobPosting)
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }))

    const result = await scrapeJobListing("https://jobs.example.com/eng", "user-1")

    expect(result.partial).toBe(true)
    expect(result.data?.title).toBe("Engineer")
  })

  it("returns FAILED when no JobPosting JSON-LD found", async () => {
    const html = "<html><body>No JSON-LD here</body></html>"
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }))

    const result = await scrapeJobListing("https://jobs.example.com/404", "user-1")

    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it("returns error on fetch timeout (AbortError)", async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error("AbortError"), { name: "AbortError" }))

    const result = await scrapeJobListing("https://slow.example.com/job", "user-1")

    expect(result.data).toBeNull()
    expect(result.error).toContain("timed out")
  })

  it("returns error on fetch network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"))

    const result = await scrapeJobListing("https://dead.example.com/job", "user-1")

    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })

  it("creates a ScrapeLog with SUCCESS status on full extraction", async () => {
    const jobPosting = {
      "@type": "JobPosting",
      title: "Dev",
      hiringOrganization: { name: "Corp" },
      jobLocation: { address: { addressLocality: "NYC" } },
      baseSalary: { currency: "USD", value: { minValue: 100000, maxValue: 150000 } },
      datePosted: "2025-06-01",
      validThrough: "2025-07-01",
    }
    const html = makeHtmlWithJsonLd(jobPosting)
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }))

    await scrapeJobListing("https://jobs.example.com/dev", "user-1")

    expect(mockScrapeLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS" }) })
    )
  })

  it("creates a ScrapeLog with PARTIAL status when some fields missing", async () => {
    const jobPosting = { "@type": "JobPosting", title: "Dev" }
    const html = makeHtmlWithJsonLd(jobPosting)
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }))

    await scrapeJobListing("https://jobs.example.com/dev", "user-1")

    expect(mockScrapeLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIAL" }) })
    )
  })

  it("creates a ScrapeLog with FAILED status on full failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"))

    await scrapeJobListing("https://dead.example.com/job", "user-1")

    expect(mockScrapeLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    )
  })
})
