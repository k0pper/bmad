"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { checkListingCap } from "@/lib/services/entitlement-service"
import { scrapeJobListing } from "@/lib/services/scraper-service"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"
import { urlImportSchema } from "@/lib/schemas/listing"
import { revalidateTag } from "next/cache"
import type { VitalityState } from "@/generated/prisma/client"

type ImportData =
  | { status: "created"; listing: { id: string; title: string; company: string; vitalityState: VitalityState } }
  | { status: "duplicate"; existingId: string; title: string; company: string }
  | { status: "cap_reached"; count: number; cap: number }

type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

export async function importFromUrl(formData: FormData): Promise<ActionResult<ImportData>> {
  const session = await auth()
  if (!session?.user?.id) return { data: null, error: "Unauthorized" }

  const userId = session.user.id

  const parsed = urlImportSchema.safeParse({ url: formData.get("url") })
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues?.[0]?.message ?? "Invalid URL" }
  }
  const url = parsed.data.url

  const cap = await checkListingCap(userId)
  if (!cap.allowed) {
    return { data: { status: "cap_reached", count: cap.count, cap: cap.cap }, error: null }
  }

  const existing = await prisma.jobListing.findFirst({ where: { userId, sourceUrl: url, deletedAt: null } })
  if (existing) {
    return {
      data: { status: "duplicate", existingId: existing.id, title: existing.title, company: existing.company },
      error: null,
    }
  }

  const scraped = await scrapeJobListing(url, userId)
  if (scraped.data === null) {
    return { data: null, error: scraped.error }
  }

  const now = new Date()
  const vitalityState = computeVitalityState({
    postedAt: scraped.data.postedAt ?? null,
    closingDate: scraped.data.closingDate ?? null,
    application: null,
    gmailSignalAt: null,
    overrideState: null,
    overrideSource: null,
    isArchived: false,
    now,
  }) ?? "COOLING"

  const listing = await prisma.jobListing.create({
    data: {
      userId,
      title: scraped.data.title ?? url,
      company: scraped.data.company ?? "Unknown",
      companyDomain: scraped.data.companyDomain ?? null,
      location: scraped.data.location ?? null,
      salaryMin: scraped.data.salaryMin ?? null,
      salaryMax: scraped.data.salaryMax ?? null,
      salaryCurrency: scraped.data.salaryCurrency ?? "USD",
      sourceUrl: url,
      importSource: "URL_IMPORT",
      vitalityState,
      lastComputedAt: now,
    },
  })

  try {
    await prisma.auditLog.create({
      data: {
        source: "SYSTEM_RECOMPUTE",
        userId,
        listingId: listing.id,
        newState: vitalityState,
        computedAt: now,
      },
    })
  } catch {
    // non-critical — log creation failure should not block import
  }

  revalidateTag(`board-${userId}`, {})

  return {
    data: {
      status: "created",
      listing: { id: listing.id, title: listing.title, company: listing.company, vitalityState: listing.vitalityState },
    },
    error: null,
  }
}

export async function importFromUrlForced(url: string): Promise<ActionResult<ImportData>> {
  const session = await auth()
  if (!session?.user?.id) return { data: null, error: "Unauthorized" }

  const userId = session.user.id

  const cap = await checkListingCap(userId)
  if (!cap.allowed) {
    return { data: { status: "cap_reached", count: cap.count, cap: cap.cap }, error: null }
  }

  const scraped = await scrapeJobListing(url, userId)
  if (scraped.data === null) {
    return { data: null, error: scraped.error }
  }

  const now = new Date()
  const vitalityState = computeVitalityState({
    postedAt: scraped.data.postedAt ?? null,
    closingDate: scraped.data.closingDate ?? null,
    application: null,
    gmailSignalAt: null,
    overrideState: null,
    overrideSource: null,
    isArchived: false,
    now,
  }) ?? "COOLING"

  const listing = await prisma.jobListing.create({
    data: {
      userId,
      title: scraped.data.title ?? url,
      company: scraped.data.company ?? "Unknown",
      companyDomain: scraped.data.companyDomain ?? null,
      location: scraped.data.location ?? null,
      salaryMin: scraped.data.salaryMin ?? null,
      salaryMax: scraped.data.salaryMax ?? null,
      salaryCurrency: scraped.data.salaryCurrency ?? "USD",
      sourceUrl: url,
      importSource: "URL_IMPORT",
      vitalityState,
      lastComputedAt: now,
    },
  })

  try {
    await prisma.auditLog.create({
      data: {
        source: "SYSTEM_RECOMPUTE",
        userId,
        listingId: listing.id,
        newState: vitalityState,
        computedAt: now,
      },
    })
  } catch {
    // non-critical
  }

  revalidateTag(`board-${userId}`, {})

  return {
    data: {
      status: "created",
      listing: { id: listing.id, title: listing.title, company: listing.company, vitalityState: listing.vitalityState },
    },
    error: null,
  }
}
