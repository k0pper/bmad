import { prisma } from "@/lib/db"

export function deleteAccount(userId: string) {
  return prisma.user.delete({ where: { id: userId } })
}

export function revokeGmailAccess(userId: string) {
  return prisma.gmailToken.delete({ where: { userId } })
}
