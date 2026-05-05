import { prisma } from "@/lib/db"

export function getPreferenceProfile(userId: string) {
  return prisma.preferenceProfile.findUnique({ where: { userId } })
}

type PreferenceData = {
  jobFunction?: string
  seniorityLevel?: string
  preferredLocations?: string[]
  workStyle?: string
  targetSalaryMin?: number | null
  targetSalaryMax?: number | null
  salaryCurrency?: string
}

export async function updatePreferenceProfile(userId: string, data: PreferenceData) {
  const existing = await prisma.preferenceProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (existing) {
    return prisma.preferenceProfile.update({ where: { userId }, data })
  }
  return prisma.preferenceProfile.create({ data: { userId, ...data } })
}

export function createPreferenceProfile(userId: string, data: PreferenceData) {
  return prisma.preferenceProfile.create({
    data: { userId, ...data },
  })
}
