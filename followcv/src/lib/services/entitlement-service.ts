import { prisma } from "@/lib/db"

export async function checkListingCap(
  userId: string
): Promise<{ allowed: boolean; count: number; cap: number }> {
  const [count, configRow] = await Promise.all([
    prisma.jobListing.count({ where: { userId, archived: false, deletedAt: null } }),
    prisma.appConfig.findUnique({ where: { key: "listing_cap_free" } }),
  ])
  const cap = configRow ? parseInt(configRow.value, 10) : 25
  return { allowed: count < cap, count, cap }
}
