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

// Known job-board hosts whose JSON-LD `hiringOrganization.url` often points
// back at themselves (e.g. a Stepstone profile page) when the employer's
// own URL is unknown. Treating those as the company domain would have the
// Gmail signal processor search for messages from the job board instead of
// the actual employer — exactly the bug `companyDomain=stepstone.de` causes.
// Match suffix-wise so `xing.com` also catches `www.xing.com`, and
// `linkedin.com` also catches `de.linkedin.com`.
const JOB_BOARD_HOSTS = [
  "stepstone.de",
  "stepstone.com",
  "linkedin.com",
  "indeed.com",
  "indeed.de",
  "glassdoor.com",
  "glassdoor.de",
  "xing.com",
  "monster.com",
  "monster.de",
  "ziprecruiter.com",
  "lever.co",
  "greenhouse.io",
  "workable.com",
  "smartrecruiters.com",
  "jobs.de",
  "jobware.de",
  "kimeta.de",
  "joblift.de",
  "jobvector.de",
  "honeypot.io",
  "wellfound.com",
  "angel.co",
  "builtin.com",
  "remote.co",
  "weworkremotely.com",
  "arbeitsagentur.de",
  "stellenanzeigen.de",
  "metajob.de",
  "yourfirm.de",
] as const

export function isJobBoardHost(host: string): boolean {
  const lower = host.toLowerCase()
  return JOB_BOARD_HOSTS.some(
    (jb) => lower === jb || lower.endsWith(`.${jb}`),
  )
}

function extractCompanyDomain(urlString: string): string | null {
  try {
    const { hostname } = new URL(urlString)
    // Strip leading "www." but otherwise preserve the full host. We used to
    // collapse to the last two labels (e.g. `careers.example.co.uk` → `co.uk`),
    // which is wrong for ccTLDs and inconsistent with what users actually
    // type into Gmail's search ("from:<host>").
    const stripped = hostname.replace(/^www\./, "").toLowerCase()
    if (stripped.length === 0) return null
    if (isJobBoardHost(stripped)) return null
    return stripped
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromJobPosting(parsed: any): ScrapeResult {
  const result: ScrapeResult = {}

  if (parsed.title) result.title = String(parsed.title)
  if (parsed.hiringOrganization?.name) result.company = String(parsed.hiringOrganization.name)

  // Prefer the employer's own URL for the company domain — the source URL
  // host is wrong for any job-board listing (Stepstone, LinkedIn, Indeed,
  // …). Only set if the JSON-LD includes a usable hiringOrganization.url
  // and that URL doesn't itself point back at a known job board. Callers
  // fall back to leaving the field null otherwise.
  if (parsed.hiringOrganization?.url) {
    const domain = extractCompanyDomain(String(parsed.hiringOrganization.url))
    if (domain) result.companyDomain = domain
  } else if (parsed.hiringOrganization?.sameAs) {
    const domain = extractCompanyDomain(String(parsed.hiringOrganization.sameAs))
    if (domain) result.companyDomain = domain
  }

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
    // Do NOT fall back to the source URL host — it points at the job board
    // (stepstone.de, linkedin.com, indeed.com, …) which is never the
    // employer's email domain. If JSON-LD didn't supply hiringOrganization.url,
    // leave companyDomain null and let the user fill it in via the edit form.

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
