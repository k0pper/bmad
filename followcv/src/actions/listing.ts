"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"
import { updateListingSchema } from "@/lib/schemas/listing"
import type { Prisma } from "@/generated/prisma/client"
import type {
  ApplicationStatus,
  OverrideSource,
  VitalityState,
} from "@/generated/prisma/client"

type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

export type VitalityOverrideSnapshot = {
  vitalityState: VitalityState
  overrideState: VitalityState | null
  overrideSource: OverrideSource | null
  stateChangedAt: Date | null
}

async function requireUser(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" }
  return { ok: true, userId: session.user.id }
}

async function writeAuditLog(data: {
  source: "USER_OVERRIDE" | "USER_OVERRIDE_CLEARED"
  userId: string
  listingId: string
  previousState: VitalityState
  newState: VitalityState
  computedAt: Date
  metadata?: Prisma.InputJsonValue
}) {
  try {
    await prisma.auditLog.create({ data })
  } catch {
    // non-critical — audit log failure must never abort a user-initiated mutation
  }
}

export async function overrideVitality(
  listingId: string,
  newState: VitalityState
): Promise<ActionResult<{ snapshot: VitalityOverrideSnapshot }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const listing = await prisma.jobListing.findFirst({
    where: { id: listingId, userId: session.userId, deletedAt: null },
  })
  if (!listing) return { data: null, error: "Listing not found" }

  const snapshot: VitalityOverrideSnapshot = {
    vitalityState: listing.vitalityState,
    overrideState: listing.overrideState,
    overrideSource: listing.overrideSource,
    stateChangedAt: listing.stateChangedAt,
  }

  const now = new Date()
  await prisma.jobListing.update({
    where: { id: listingId },
    data: {
      vitalityState: newState,
      overrideState: newState,
      overrideSource: "USER",
      stateChangedAt: now,
      lastComputedAt: now,
    },
  })

  await writeAuditLog({
    source: "USER_OVERRIDE",
    userId: session.userId,
    listingId,
    previousState: snapshot.vitalityState,
    newState,
    computedAt: now,
  })

  return { data: { snapshot }, error: null }
}

export async function clearVitalityOverride(
  listingId: string
): Promise<ActionResult<{ snapshot: VitalityOverrideSnapshot; newState: VitalityState }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const listing = await prisma.jobListing.findFirst({
    where: { id: listingId, userId: session.userId, deletedAt: null },
    include: { application: true },
  })
  if (!listing) return { data: null, error: "Listing not found" }

  const snapshot: VitalityOverrideSnapshot = {
    vitalityState: listing.vitalityState,
    overrideState: listing.overrideState,
    overrideSource: listing.overrideSource,
    stateChangedAt: listing.stateChangedAt,
  }

  const gmailSignal = await prisma.auditLog.findFirst({
    where: { listingId, source: "GMAIL_SIGNAL" },
    orderBy: { computedAt: "desc" },
  })

  const now = new Date()
  const fresh = computeVitalityState({
    postedAt: listing.postedAt,
    closingDate: listing.closingDate,
    application: listing.application
      ? {
          appliedAt: listing.application.appliedAt,
          status: listing.application.status as ApplicationStatus,
        }
      : null,
    gmailSignalAt: gmailSignal?.computedAt ?? null,
    overrideState: null,
    overrideSource: null,
    isArchived: listing.archived,
    now,
  })

  // Archived returns null, but the recompute job already filters archived listings.
  // For an active listing the state machine always returns a value.
  const newState: VitalityState = fresh ?? "COOLING"
  const stateChanged = newState !== listing.vitalityState

  await prisma.jobListing.update({
    where: { id: listingId },
    data: {
      overrideState: null,
      overrideSource: null,
      vitalityState: newState,
      lastComputedAt: now,
      ...(stateChanged ? { stateChangedAt: now } : {}),
    },
  })

  await writeAuditLog({
    source: "USER_OVERRIDE_CLEARED",
    userId: session.userId,
    listingId,
    previousState: snapshot.vitalityState,
    newState,
    computedAt: now,
  })

  return { data: { snapshot, newState }, error: null }
}

export async function undoVitalityOverride(
  listingId: string,
  snapshot: VitalityOverrideSnapshot
): Promise<ActionResult<{ ok: true }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const listing = await prisma.jobListing.findFirst({
    where: { id: listingId, userId: session.userId, deletedAt: null },
  })
  if (!listing) return { data: null, error: "Listing not found" }

  const now = new Date()
  await prisma.jobListing.update({
    where: { id: listingId },
    data: {
      vitalityState: snapshot.vitalityState,
      overrideState: snapshot.overrideState,
      overrideSource: snapshot.overrideSource,
      stateChangedAt: snapshot.stateChangedAt,
      lastComputedAt: now,
    },
  })

  await writeAuditLog({
    source: "USER_OVERRIDE",
    userId: session.userId,
    listingId,
    previousState: listing.vitalityState,
    newState: snapshot.vitalityState,
    computedAt: now,
    metadata: { undo: true },
  })

  return { data: { ok: true }, error: null }
}

export async function archiveListing(
  listingId: string
): Promise<ActionResult<{ ok: true }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const result = await prisma.jobListing.updateMany({
    where: { id: listingId, userId: session.userId, deletedAt: null },
    data: { archived: true },
  })
  if (result.count === 0) return { data: null, error: "Listing not found" }

  return { data: { ok: true }, error: null }
}

export async function unarchiveListing(
  listingId: string
): Promise<ActionResult<{ ok: true }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const result = await prisma.jobListing.updateMany({
    where: { id: listingId, userId: session.userId, deletedAt: null },
    data: { archived: false },
  })
  if (result.count === 0) return { data: null, error: "Listing not found" }

  return { data: { ok: true }, error: null }
}

export async function updateListing(
  listingId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const parsed = updateListingSchema.safeParse({
    title: formData.get("title"),
    company: formData.get("company"),
    location: formData.get("location") ?? undefined,
    salaryMin: formData.get("salaryMin") ?? undefined,
    salaryMax: formData.get("salaryMax") ?? undefined,
    salaryCurrency: formData.get("salaryCurrency") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    closingDate: formData.get("closingDate") ?? undefined,
  })
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues?.[0]?.message ?? "Invalid input" }
  }

  const result = await prisma.jobListing.updateMany({
    where: { id: listingId, userId: session.userId, deletedAt: null },
    data: {
      title: parsed.data.title,
      company: parsed.data.company,
      location: parsed.data.location,
      salaryMin: parsed.data.salaryMin,
      salaryMax: parsed.data.salaryMax,
      salaryCurrency: parsed.data.salaryCurrency,
      notes: parsed.data.notes,
      closingDate: parsed.data.closingDate,
    },
  })
  if (result.count === 0) return { data: null, error: "Listing not found" }

  return { data: { id: listingId }, error: null }
}
