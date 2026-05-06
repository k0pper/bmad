import { del } from "@vercel/blob"
import { prisma } from "@/lib/db"

/**
 * Delete a user's account.
 *
 * 1. Collect every Vercel Blob URL the user owns BEFORE the DB cascade
 *    nukes the rows, then delete the blobs from storage.
 * 2. Delete the User row — Postgres handles the relational cascade
 *    (CvVersion, JobListing, Application, AuditLog, …) at the DB layer
 *    in a single statement, which is safe under the Neon HTTP driver
 *    (no client-side transaction, no `*Many` write).
 *
 * Blob deletion is best-effort: if the call fails (storage outage,
 * network blip), we still proceed with the DB delete. An orphaned blob
 * is a privacy/cost concern but not a correctness one — a future
 * cleanup job can reconcile by listing blob keys with no corresponding
 * `CvVersion` row.
 */
export async function deleteAccount(userId: string) {
  const cvVersions = await prisma.cvVersion.findMany({
    where: { userId },
    select: { s3Key: true },
  })
  const blobUrls = cvVersions.map((cv) => cv.s3Key)

  if (blobUrls.length > 0) {
    try {
      // del() accepts a string[] for batched deletion.
      await del(blobUrls)
    } catch {
      // Swallowed — see fn doc comment.
    }
  }

  return prisma.user.delete({ where: { id: userId } })
}

/**
 * Revoke the user's Gmail OAuth tokens.
 *
 * `gmailToken` is a 1:1 relation on User (`@unique` on `userId`), so a
 * single-row delete via `findFirst` + `delete` is sufficient and
 * compatible with the Neon HTTP driver (no `deleteMany`, no implicit
 * transaction).
 */
export async function revokeGmailAccess(userId: string) {
  const token = await prisma.gmailToken.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (!token) return
  await prisma.gmailToken.delete({ where: { id: token.id } })
}
