import { redirect } from "next/navigation"
import { unstable_cache } from "next/cache"
import { auth } from "@/lib/auth"
import { getPreferenceProfile } from "@/lib/preferences/service"
import { prisma } from "@/lib/db"
import { BoardRow } from "@/components/board/BoardRow"
import { BoardClient } from "@/components/board/BoardClient"
import type { VitalityState, ImportSource } from "@/generated/prisma/client"

function getBoardListings(userId: string) {
  return unstable_cache(
    () =>
      prisma.jobListing.findMany({
        where: { userId, archived: false, deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    [`board-${userId}`],
    { tags: [`board-${userId}`] }
  )()
}

export default async function BoardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const profile = await getPreferenceProfile(session.user.id)
  if (!profile) redirect("/onboarding")

  const listings = await getBoardListings(session.user.id)

  return (
    <div className="p-8">
      <BoardClient listings={listings}>
        {listings.map((listing) => (
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
          />
        ))}
      </BoardClient>
    </div>
  )
}
