import { z } from "zod"
import { isJobBoardHost } from "@/lib/services/scraper-service"

export const urlImportSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
})

export type UrlImportInput = z.infer<typeof urlImportSchema>

export const manualImportSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company name is required"),
  // Email domain used by Story 6.2's Gmail signal processor to match
  // employer replies. Free-form text (e.g. "acme.com"); only the host
  // matters. Optional — the user can fix it via the edit form later.
  companyDomain: z
    .string()
    .max(253)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? undefined : normaliseDomain(v))),
  location: z.string().optional(),
  salaryMin: z.coerce.number().int().positive().optional().or(z.literal("")),
  salaryMax: z.coerce.number().int().positive().optional().or(z.literal("")),
  sourceUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
})

// Lightweight host validator — must look like at least `<label>.<tld>` with
// no spaces or path-like characters. We don't try to be a full RFC-1035
// validator; we just want to refuse free-text junk that the URL parser's
// fallback path lets through (e.g. "/jobs/123", "hello world").
const BARE_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

function normaliseDomain(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  // Accept either a full URL (https://acme.com/jobs) or a bare host (acme.com).
  // Always lower-case the result — Gmail's `from:` search syntax is
  // case-insensitive but downstream code (vitality recompute, distinct-domain
  // grouping) compares strings exactly. Mixed-case storage causes
  // double-counting and missed matches.
  let candidate: string | undefined
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
    const host = u.hostname.replace(/^www\./, "").toLowerCase()
    if (host) candidate = host
  } catch {
    candidate = trimmed.replace(/^www\./, "").toLowerCase()
  }
  if (!candidate) return undefined
  // Reject obvious junk (paths, free text, single-label hosts).
  if (!BARE_HOST_RE.test(candidate)) return undefined
  // Reject job-board hosts so a user pasting "stepstone.de" doesn't end up
  // with the Gmail processor searching for messages from the job board
  // itself instead of the actual employer.
  if (isJobBoardHost(candidate)) return undefined
  return candidate
}

export type ManualImportInput = z.infer<typeof manualImportSchema>

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? null : v))

const optionalPositiveInt = z
  .union([z.coerce.number().int().positive(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v))

const optionalDate = z
  .union([z.coerce.date(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : (v as Date)))

export const updateListingSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    company: z.string().min(1, "Company is required").max(200),
    // Email domain used by Story 6.2's Gmail signal processor. Same shape
    // and normalisation as the manual import field.
    companyDomain: z
      .string()
      .max(253)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" || v === undefined ? null : normaliseDomain(v) ?? null)),
    location: optionalString(200),
    salaryMin: optionalPositiveInt,
    salaryMax: optionalPositiveInt,
    salaryCurrency: z
      .string()
      .length(3)
      .optional()
      .transform((v) => (v === undefined || v === "" ? "USD" : v)),
    closingDate: optionalDate,
  })
  .refine(
    (d) => d.salaryMin === null || d.salaryMax === null || d.salaryMax >= d.salaryMin,
    { message: "Maximum salary must be greater than or equal to minimum", path: ["salaryMax"] }
  )

export type UpdateListingInput = z.infer<typeof updateListingSchema>
