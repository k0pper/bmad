"use server"

import { del } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { checkCvVersionCap } from "@/lib/services/entitlement-service"
import type { CvVersion } from "@/generated/prisma/client"

type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

async function requireUser(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" }
  return { ok: true, userId: session.user.id }
}

export async function checkCvDuplicate(input: {
  fileHash: string
}): Promise<ActionResult<{ existing: { id: string; name: string } | null }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const existing = await prisma.cvVersion.findFirst({
    where: { userId: session.userId, fileHash: input.fileHash },
    select: { id: true, name: true },
  })

  return { data: { existing: existing ?? null }, error: null }
}

export async function confirmCvUpload(input: {
  blobUrl: string
  name: string
  fileSize: number
  fileHash: string
}): Promise<ActionResult<{ cvVersion: CvVersion }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  // Sanity-check the URL — has to be HTTPS and contain no script chars.
  if (!/^https:\/\/[^\s<>"']+$/.test(input.blobUrl)) {
    return { data: null, error: "Invalid blob URL" }
  }
  if (input.fileSize <= 0 || input.fileSize > 10 * 1024 * 1024) {
    return { data: null, error: "Invalid file size" }
  }
  if (!/^[a-f0-9]{64}$/.test(input.fileHash)) {
    return { data: null, error: "Invalid file hash" }
  }

  const finalName =
    input.name.trim().length > 0
      ? input.name.trim()
      : `CV — ${new Date().toISOString().slice(0, 10)}`

  try {
    const cvVersion = await prisma.cvVersion.create({
      data: {
        userId: session.userId,
        name: finalName,
        s3Key: input.blobUrl,
        fileSize: input.fileSize,
        fileHash: input.fileHash,
      },
    })
    return { data: { cvVersion }, error: null }
  } catch (err) {
    // Race: another tab won the dedup race. Clean up the orphan blob.
    if (isUniqueViolation(err)) {
      await safeDelBlob(input.blobUrl)
      return { data: null, error: "This file is already uploaded" }
    }
    return { data: null, error: "Failed to save CV version" }
  }
}

export async function listCvVersions(): Promise<ActionResult<CvVersion[]>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const versions = await prisma.cvVersion.findMany({
    where: { userId: session.userId },
    orderBy: { uploadedAt: "desc" },
  })
  return { data: versions, error: null }
}

export async function renameCvVersion(input: {
  id: string
  name: string
}): Promise<ActionResult<{ id: string; name: string }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const trimmed = input.name.trim()
  if (!trimmed) return { data: null, error: "Name cannot be empty" }
  if (trimmed.length > 200) {
    return { data: null, error: "Name is too long (max 200 characters)" }
  }

  const cv = await prisma.cvVersion.findFirst({
    where: { id: input.id, userId: session.userId },
    select: { id: true },
  })
  if (!cv) return { data: null, error: "Not found" }

  await prisma.cvVersion.update({
    where: { id: cv.id },
    data: { name: trimmed },
  })
  return { data: { id: cv.id, name: trimmed }, error: null }
}

export async function restoreCvVersion(input: {
  id: string
}): Promise<ActionResult<{ id: string }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const original = await prisma.cvVersion.findFirst({
    where: { id: input.id, userId: session.userId },
    select: { id: true, name: true, s3Key: true, fileSize: true, uploadedAt: true },
  })
  if (!original) return { data: null, error: "Not found" }

  // Restore = "use this version as current". A no-op if it's already current.
  const newer = await prisma.cvVersion.count({
    where: { userId: session.userId, uploadedAt: { gt: original.uploadedAt } },
  })
  if (newer === 0) {
    return { data: null, error: "This CV is already the active version." }
  }

  const cap = await checkCvVersionCap(session.userId)
  if (!cap.allowed) {
    return {
      data: null,
      error: "CV version limit reached — upgrade to Pro for unlimited versions",
    }
  }

  const created = await prisma.cvVersion.create({
    data: {
      userId: session.userId,
      name: original.name,
      s3Key: original.s3Key,
      fileSize: original.fileSize,
      fileHash: null,
    },
    select: { id: true },
  })
  return { data: { id: created.id }, error: null }
}

export async function deleteCvVersion(input: {
  id: string
}): Promise<ActionResult<{ deleted: true }>> {
  const session = await requireUser()
  if (!session.ok) return { data: null, error: session.error }

  const cv = await prisma.cvVersion.findFirst({
    where: { id: input.id, userId: session.userId },
    include: { snapshots: { take: 1 } },
  })
  if (!cv) return { data: null, error: "Not found" }

  if (cv.snapshots.length > 0) {
    return {
      data: null,
      error: "This CV is attached to an application and cannot be deleted.",
    }
  }

  // Check if other versions share the same blob before we decide to clean it up.
  const otherCount = await prisma.cvVersion.count({
    where: { userId: session.userId, s3Key: cv.s3Key, id: { not: input.id } },
  })

  await prisma.cvVersion.delete({ where: { id: cv.id } })

  if (otherCount === 0) {
    await safeDelBlob(cv.s3Key)
  }

  return { data: { deleted: true }, error: null }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false
  const code = (err as { code?: string }).code
  return code === "P2002"
}

async function safeDelBlob(url: string): Promise<void> {
  try {
    await del(url)
  } catch {
    // Cleanup is best-effort. An orphan blob can be reaped by a future job.
  }
}
