import { prisma } from "@/lib/db"
import { computeVitalityState } from "@/lib/services/vitality-state-machine"
import type { ApplicationStatus, OverrideSource, VitalityState } from "@/generated/prisma/client"

export type RecomputeSummary = {
  processed: number
  changed: number
  errors: number
}

export async function handleVitalityRecompute(): Promise<RecomputeSummary> {
  const now = new Date()
  let changed = 0
  let errors = 0

  const listings = await prisma.jobListing.findMany({
    where: { archived: false, deletedAt: null },
    include: { application: true },
  })

  if (listings.length === 0) return { processed: 0, changed: 0, errors: 0 }

  // Fetch latest GMAIL_SIGNAL per listing in a single query (avoid N+1)
  const gmailSignals = await prisma.auditLog.findMany({
    where: { source: "GMAIL_SIGNAL", listingId: { in: listings.map((l) => l.id) } },
    orderBy: { computedAt: "desc" },
    distinct: ["listingId"],
  })
  const gmailSignalMap = new Map(
    gmailSignals.filter((s) => s.listingId !== null).map((s) => [s.listingId!, s.computedAt])
  )

  for (const listing of listings) {
    try {
      const freshState = computeVitalityState({
        postedAt: listing.postedAt,
        closingDate: listing.closingDate,
        application: listing.application
          ? {
              appliedAt: listing.application.appliedAt,
              status: listing.application.status as ApplicationStatus,
            }
          : null,
        gmailSignalAt: gmailSignalMap.get(listing.id) ?? null,
        overrideState: listing.overrideState as VitalityState | null,
        overrideSource: listing.overrideSource as OverrideSource | null,
        isArchived: listing.archived,
        now,
      })

      // Archived listings return null — skip (filtered out above, but guard anyway)
      if (freshState === null) continue

      const stateChanged = freshState !== listing.vitalityState

      await prisma.jobListing.update({
        where: { id: listing.id },
        data: {
          vitalityState: freshState,
          lastComputedAt: now,
          ...(stateChanged ? { stateChangedAt: now } : {}),
        },
      })

      if (stateChanged) {
        changed++
        try {
          await prisma.auditLog.create({
            data: {
              source: "SYSTEM_RECOMPUTE",
              userId: listing.userId,
              listingId: listing.id,
              previousState: listing.vitalityState,
              newState: freshState,
              computedAt: now,
            },
          })
        } catch {
          // non-critical — audit log failure should not abort the recompute
        }
      }
    } catch {
      errors++
    }
  }

  return { processed: listings.length, changed, errors }
}
