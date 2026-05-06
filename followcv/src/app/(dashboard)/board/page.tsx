import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPreferenceProfile } from "@/lib/preferences/service"
import { prisma } from "@/lib/db"
import { BoardClient, type BoardListing } from "@/components/board/BoardClient"
import { StalenessBanner } from "@/components/board/StalenessBanner"
import type { OverrideSource, VitalityState, ImportSource } from "@/generated/prisma/client"

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

function getBoardListings(userId: string, archived: boolean) {
  return prisma.jobListing.findMany({
    where: { userId, archived, deletedAt: null },
    orderBy: { createdAt: "desc" },
  })
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const profile = await getPreferenceProfile(session.user.id)
  if (!profile) redirect("/onboarding")

  const params = await searchParams
  const showArchived = params.archived === "true"

  const [listings, user] = await Promise.all([
    getBoardListings(session.user.id, showArchived),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { lastVisitAt: true } }),
  ])

  const previousVisitAt = user?.lastVisitAt ?? null

  // Update lastVisitAt only when viewing the active board (the recency dot is for active listings).
  if (!showArchived) {
    prisma.user.update({ where: { id: session.user.id }, data: { lastVisitAt: new Date() } }).catch(() => {})
  }

  const nowMs = new Date().getTime()
  const hasStaleListings = !showArchived && listings.some(
    (l) => l.lastComputedAt !== null && nowMs - l.lastComputedAt.getTime() > TWO_HOURS_MS
  )

  // Pre-compute the recency flag per listing on the server so the client
  // doesn't need to re-derive it on every filter change. The math depends on
  // `lastVisitAt`, which is only known to the server.
  const boardListings: BoardListing[] = listings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    company: listing.company,
    location: listing.location,
    vitalityState: listing.vitalityState as VitalityState,
    overrideSource: listing.overrideSource as OverrideSource | null,
    importSource: listing.importSource as ImportSource,
    postedAt: listing.postedAt,
    createdAt: listing.createdAt,
    salaryMin: listing.salaryMin,
    salaryMax: listing.salaryMax,
    salaryCurrency: listing.salaryCurrency,
    archived: listing.archived,
    notes: listing.notes,
    closingDate: listing.closingDate,
    isRecent:
      !showArchived &&
      listing.stateChangedAt !== null &&
      previousVisitAt !== null &&
      listing.stateChangedAt > previousVisitAt &&
      nowMs - listing.stateChangedAt.getTime() < FORTY_EIGHT_HOURS_MS,
  }))

  return (
    <div className="p-8">
      {hasStaleListings && <StalenessBanner />}
      <BoardClient listings={boardListings} showArchived={showArchived} />
    </div>
  )
}
