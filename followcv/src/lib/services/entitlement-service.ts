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

export type CvVersionCapResult = {
  /** True when the user can upload another CV version. */
  allowed: boolean
  /** Current number of CV versions on file. */
  count: number
  /**
   * Free-tier cap value. `null` for Pro users (no cap).
   */
  cap: number | null
  /** Whether the user is on the Pro tier (no cap applies). */
  isPro: boolean
}

const DEFAULT_CV_VERSION_CAP_FREE = 5

export async function checkCvVersionCap(
  userId: string
): Promise<CvVersionCapResult> {
  const [count, configRow, user] = await Promise.all([
    prisma.cvVersion.count({ where: { userId } }),
    prisma.appConfig.findUnique({ where: { key: "cv_version_cap_free" } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    }),
  ])

  const isPro = user?.subscriptionTier === "PRO"
  if (isPro) return { allowed: true, count, cap: null, isPro: true }

  const cap = configRow ? parseInt(configRow.value, 10) : DEFAULT_CV_VERSION_CAP_FREE
  return { allowed: count < cap, count, cap, isPro: false }
}
