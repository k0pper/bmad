import { prisma } from "@/lib/db"

type ScrapeResult = {
  title?: string
  company?: string
  location?: string
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  postedAt?: Date
  closingDate?: Date
  companyDomain?: string
}

export type ScraperOutput =
  | { data: ScrapeResult; partial: boolean; error: null }
  | { data: Partial<ScrapeResult>; partial: true; error: string }
  | { data: null; partial: false; error: string }

function extractCompanyDomain(urlString: string): string | null {
  try {
    const { hostname } = new URL(urlString)
    const parts = hostname.split(".")
    return parts.length >= 2 ? parts.slice(-2).join(".") : hostname
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromJobPosting(parsed: any): ScrapeResult {
  const result: ScrapeResult = {}

  if (parsed.title) result.title = String(parsed.title)
  if (parsed.hiringOrganization?.name) result.company = String(parsed.hiringOrganization.name)

  const jobLocation = Array.isArray(parsed.jobLocation)
    ? parsed.jobLocation[0]
    : parsed.jobLocation
  if (jobLocation?.address?.addressLocality) {
    result.location = String(jobLocation.address.addressLocality)
  }

  if (parsed.baseSalary?.value?.minValue != null) {
    result.salaryMin = Number(parsed.baseSalary.value.minValue)
  }
  if (parsed.baseSalary?.value?.maxValue != null) {
    result.salaryMax = Number(parsed.baseSalary.value.maxValue)
  }
  if (parsed.baseSalary?.currency) {
    result.salaryCurrency = String(parsed.baseSalary.currency)
  }

  if (parsed.datePosted) {
    const d = new Date(parsed.datePosted)
    if (!isNaN(d.getTime())) result.postedAt = d
  }
  if (parsed.validThrough) {
    const d = new Date(parsed.validThrough)
    if (!isNaN(d.getTime())) result.closingDate = d
  }

  return result
}

const ALL_FIELDS: (keyof ScrapeResult)[] = [
  "title",
  "company",
  "location",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "postedAt",
  "closingDate",
]

export async function scrapeJobListing(url: string, userId: string): Promise<ScraperOutput> {
  const startTime = Date.now()
  let fetchError: Error | null = null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    let html: string
    try {
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      html = await response.text()
    } catch (err) {
      clearTimeout(timeoutId)
      const error = err as Error
      if (error.name === "AbortError") {
        fetchError = new Error("Import timed out — the page took too long to respond")
      } else {
        fetchError = error
      }
      throw fetchError
    }

    const scriptMatches =
      html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? []

    let jobPosting: object | null = null
    for (const scriptTag of scriptMatches) {
      const jsonContent = scriptTag.replace(/<script[^>]*>|<\/script>/gi, "").trim()
      try {
        const parsed = JSON.parse(jsonContent)
        if (parsed?.["@type"] === "JobPosting") {
          jobPosting = parsed
          break
        }
        // handle @graph array
        if (Array.isArray(parsed?.["@graph"])) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found = parsed["@graph"].find((item: any) => item?.["@type"] === "JobPosting")
          if (found) {
            jobPosting = found
            break
          }
        }
      } catch {
        // malformed JSON-LD — skip
      }
    }

    if (!jobPosting) {
      const duration = Date.now() - startTime
      await prisma.scrapeLog.create({
        data: { userId, url, status: "FAILED", fieldsExtracted: [], duration, errorMessage: "No JobPosting JSON-LD found" },
      })
      return { data: null, partial: false, error: "No JobPosting JSON-LD found on this page" }
    }

    const extracted = extractFromJobPosting(jobPosting)
    extracted.companyDomain = extractCompanyDomain(url) ?? undefined

    const fieldsExtracted = ALL_FIELDS.filter((f) => extracted[f] != null)
    const allFilled = ALL_FIELDS.every((f) => extracted[f] != null)
    const partial = !allFilled
    const duration = Date.now() - startTime

    await prisma.scrapeLog.create({
      data: {
        userId,
        url,
        status: partial ? "PARTIAL" : "SUCCESS",
        fieldsExtracted,
        duration,
        errorMessage: null,
      },
    })

    return { data: extracted, partial, error: null }
  } catch (err) {
    const error = (err as Error).message === "Import timed out — the page took too long to respond"
      ? (err as Error)
      : (err as Error)
    const duration = Date.now() - startTime

    await prisma.scrapeLog.create({
      data: {
        userId,
        url,
        status: "FAILED",
        fieldsExtracted: [],
        duration,
        errorMessage: error.message,
      },
    })

    if ((err as Error).name === "AbortError") {
      return { data: null, partial: false, error: "Import timed out — the page took too long to respond" }
    }

    return { data: null, partial: false, error: (err as Error).message ?? "Failed to fetch page" }
  }
}
