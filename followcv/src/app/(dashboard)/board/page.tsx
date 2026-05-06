import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPreferenceProfile } from "@/lib/preferences/service"
import { prisma } from "@/lib/db"
import { BoardRow } from "@/components/board/BoardRow"
import { BoardClient } from "@/components/board/BoardClient"
import { StalenessBanner } from "@/components/board/StalenessBanner"
import type { VitalityState, ImportSource } from "@/generated/prisma/client"

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

function getBoardListings(userId: string) {
  return prisma.jobListing.findMany({
    where: { userId, archived: false, deletedAt: null },
    orderBy: { createdAt: "desc" },
  })
}

export default async function BoardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const profile = await getPreferenceProfile(session.user.id)
  if (!profile) redirect("/onboarding")

  const [listings, user] = await Promise.all([
    getBoardListings(session.user.id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { lastVisitAt: true } }),
  ])

  const previousVisitAt = user?.lastVisitAt ?? null

  // Fire-and-forget: update lastVisitAt without blocking the render
  prisma.user.update({ where: { id: session.user.id }, data: { lastVisitAt: new Date() } }).catch(() => {})

  const nowMs = new Date().getTime()
  const hasStaleListings = listings.some(
    (l) => l.lastComputedAt !== null && nowMs - l.lastComputedAt.getTime() > TWO_HOURS_MS
  )

  return (
    <div className="p-8">
      {hasStaleListings && <StalenessBanner />}
      <BoardClient listings={listings}>
        {listings.map((listing, index) => {
          const isRecent =
            listing.stateChangedAt !== null &&
            previousVisitAt !== null &&
            listing.stateChangedAt > previousVisitAt &&
            nowMs - listing.stateChangedAt.getTime() < FORTY_EIGHT_HOURS_MS

          return (
            <BoardRow
              key={listing.id}
              id={listing.id}
              title={listing.title}
              company={listing.company}
              location={listing.location}
              vitalityState={listing.vitalityState as VitalityState}
              importSource={listing.importSource as ImportSource}
              postedAt={listing.postedAt}
              createdAt={listing.createdAt}
              salaryMin={listing.salaryMin}
              salaryMax={listing.salaryMax}
              salaryCurrency={listing.salaryCurrency}
              isRecent={isRecent}
              rowIndex={index}
            />
          )
        })}
      </BoardClient>
    </div>
  )
}
