"use server"

import { del } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createSnapshot } from "@/lib/services/cv-snapshot-service"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"
import type { VitalityState } from "@/generated/prisma/client"

type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

async function requireUser(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" }
  return { ok: true, userId: session.user.id }
}

async function safeDelBlob(url: string): Promise<void> {
  try {
    await del(url)
  } catch {
    // Best-effort cleanup; an orphaned snapshot blob can be reaped later.
  }
}

export async function applyToJob(input: {
  jobListingId: string
  cvVersionId: string
  appliedAt: Date
  notes?: string
}): Promise<
  ActionResult<{ applicationId: string; vitalityState: VitalityState }>
> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  // 1) Validate listing ownership + non-archived + not already applied
  const listing = await prisma.jobListing.findFirst({
    where: { id: input.jobListingId, userId: session.userId, deletedAt: null },
    include: { application: { select: { id: true } } },
  })
  if (!listing) return { data: null, error: "Not found" }
  if (listing.archived) {
    return { data: null, error: "Cannot apply to an archived listing" }
  }
  if (listing.application) {
    return {
      data: null,
      error: "You have already applied to this listing.",
    }
  }

  // 2) Validate CV version ownership
  const cvVersion = await prisma.cvVersion.findFirst({
    where: { id: input.cvVersionId, userId: session.userId },
    select: { id: true, s3Key: true },
  })
  if (!cvVersion) return { data: null, error: "CV version not found" }

  // 3) Copy the CV blob into a fresh, immutable snapshot blob
  let snapshot: { snapshotId: string; snapshotUrl: string }
  try {
    snapshot = await createSnapshot({
      userId: session.userId,
      cvVersion: { s3Key: cvVersion.s3Key },
    })
  } catch {
    return { data: null, error: "Failed to snapshot CV" }
  }

  // 4) Create the CvSnapshot row. On failure, clean up the orphan blob.
  try {
    await prisma.cvSnapshot.create({
      data: {
        id: snapshot.snapshotId,
        cvVersionId: cvVersion.id,
        s3Key: snapshot.snapshotUrl,
      },
    })
  } catch {
    await safeDelBlob(snapshot.snapshotUrl)
    return { data: null, error: "Failed to save snapshot record" }
  }

  // 5) Create the Application row. On failure, clean up the snapshot row + blob.
  let application
  try {
    application = await prisma.application.create({
      data: {
        userId: session.userId,
        jobListingId: listing.id,
        cvSnapshotId: snapshot.snapshotId,
        appliedAt: input.appliedAt,
        notes: input.notes ?? null,
        status: "APPLIED",
      },
      select: { id: true, status: true, appliedAt: true },
    })
  } catch {
    await safeDelBlob(snapshot.snapshotUrl)
    try {
      await prisma.cvSnapshot.delete({ where: { id: snapshot.snapshotId } })
    } catch {
      // Best-effort; the snapshot row will be cleaned up by future maintenance.
    }
    return { data: null, error: "Failed to save application" }
  }

  // 6) Recompute vitality state and persist if changed.
  const computed = computeVitalityState({
    postedAt: listing.postedAt,
    closingDate: listing.closingDate,
    application: {
      appliedAt: application.appliedAt,
      status: application.status,
    },
    gmailSignalAt: null,
    overrideState: listing.overrideState,
    overrideSource: listing.overrideSource,
    isArchived: listing.archived,
    now: new Date(),
  })

  const newState: VitalityState = computed ?? listing.vitalityState
  try {
    await prisma.jobListing.update({
      where: { id: listing.id },
      data: {
        vitalityState: newState,
        lastComputedAt: new Date(),
        ...(newState !== listing.vitalityState
          ? { stateChangedAt: new Date() }
          : {}),
      },
    })
  } catch {
    // Vitality update miss is acceptable; the application is already saved
    // and a future read or background recompute will heal the state.
  }

  return {
    data: { applicationId: application.id, vitalityState: newState },
    error: null,
  }
}
