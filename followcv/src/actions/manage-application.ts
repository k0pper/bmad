"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"
import type {
  ApplicationStatus,
  VitalityState,
} from "@/generated/prisma/client"

type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

const STATUS_VALUES: ApplicationStatus[] = [
  "APPLIED",
  "INTERVIEWING",
  "OFFER_RECEIVED",
  "REJECTED",
  "WITHDRAWN",
  "ON_HOLD",
  "GHOSTED",
]

const NOTES_MAX_LENGTH = 5000

async function requireUser(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" }
  return { ok: true, userId: session.user.id }
}

/**
 * Update the application status for a listing the user owns.
 *
 * Status changes drive the vitality state machine (REJECTED/WITHDRAWN →
 * CLOSED; APPLIED with no recent activity → GHOSTING; APPLIED/
 * INTERVIEWING/ON_HOLD → ACTIVE; etc.). After persisting the status, this
 * action recomputes vitality and persists any change to the listing.
 */
export async function updateApplicationStatus(input: {
  listingId: string
  status: ApplicationStatus
}): Promise<ActionResult<{ vitalityState: VitalityState }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  if (!STATUS_VALUES.includes(input.status)) {
    return { data: null, error: "Invalid status" }
  }

  const listing = await prisma.jobListing.findFirst({
    where: { id: input.listingId, userId: session.userId, deletedAt: null },
    include: { application: true },
  })
  if (!listing) return { data: null, error: "Not found" }
  if (!listing.application) {
    return { data: null, error: "No application recorded for this listing" }
  }

  await prisma.application.update({
    where: { id: listing.application.id },
    data: { status: input.status },
  })

  // Recompute vitality with the new status. Use the most recent gmail signal
  // if any (mirrors the listing detail page's pattern).
  const gmailSignalLog = await prisma.auditLog.findFirst({
    where: { listingId: listing.id, source: "GMAIL_SIGNAL" },
    orderBy: { computedAt: "desc" },
  })

  const now = new Date()
  const computed = computeVitalityState({
    postedAt: listing.postedAt,
    closingDate: listing.closingDate,
    application: {
      appliedAt: listing.application.appliedAt,
      status: input.status,
    },
    gmailSignalAt: gmailSignalLog?.computedAt ?? null,
    overrideState: listing.overrideState,
    overrideSource: listing.overrideSource,
    isArchived: listing.archived,
    now,
  })

  const newState: VitalityState = computed ?? listing.vitalityState
  if (newState !== listing.vitalityState) {
    try {
      await prisma.jobListing.update({
        where: { id: listing.id },
        data: {
          vitalityState: newState,
          stateChangedAt: now,
          lastComputedAt: now,
        },
      })
    } catch {
      // Vitality update miss is acceptable; the application status is saved
      // and a future read or background recompute will heal the state.
    }
  } else {
    try {
      await prisma.jobListing.update({
        where: { id: listing.id },
        data: { lastComputedAt: now },
      })
    } catch {
      // best-effort
    }
  }

  return { data: { vitalityState: newState }, error: null }
}

/**
 * Update the notes on a user's Application by listing id.
 */
export async function updateApplicationNotes(input: {
  listingId: string
  notes: string
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  if (input.notes.length > NOTES_MAX_LENGTH) {
    return {
      data: null,
      error: `Notes are too long (max ${NOTES_MAX_LENGTH} characters)`,
    }
  }

  const listing = await prisma.jobListing.findFirst({
    where: { id: input.listingId, userId: session.userId, deletedAt: null },
    select: { application: { select: { id: true } } },
  })
  if (!listing?.application) {
    return { data: null, error: "Not found" }
  }

  const trimmed = input.notes.trim()
  await prisma.application.update({
    where: { id: listing.application.id },
    data: { notes: trimmed.length > 0 ? trimmed : null },
  })

  return { data: { ok: true }, error: null }
}

/**
 * Update the notes on a user's JobListing without touching any other field.
 *
 * `updateListing` exists for the full edit form; this action exists so the
 * inline on-blur notes editor can save just the notes field.
 */
export async function updateListingNotes(input: {
  listingId: string
  notes: string
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  if (input.notes.length > NOTES_MAX_LENGTH) {
    return {
      data: null,
      error: `Notes are too long (max ${NOTES_MAX_LENGTH} characters)`,
    }
  }

  const listing = await prisma.jobListing.findFirst({
    where: { id: input.listingId, userId: session.userId, deletedAt: null },
    select: { id: true },
  })
  if (!listing) return { data: null, error: "Not found" }

  const trimmed = input.notes.trim()
  await prisma.jobListing.update({
    where: { id: listing.id },
    data: { notes: trimmed.length > 0 ? trimmed : null },
  })

  return { data: { ok: true }, error: null }
}
