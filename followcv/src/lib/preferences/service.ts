import { prisma } from "@/lib/db"

export function getPreferenceProfile(userId: string) {
  return prisma.preferenceProfile.findUnique({ where: { userId } })
}

export function createPreferenceProfile(
  userId: string,
  data: {
    jobFunction?: string
    seniorityLevel?: string
    preferredLocations?: string[]
    workStyle?: string
    targetSalaryMin?: number | null
    targetSalaryMax?: number | null
    salaryCurrency?: string
  }
) {
  return prisma.preferenceProfile.create({
    data: { userId, ...data },
  })
}
