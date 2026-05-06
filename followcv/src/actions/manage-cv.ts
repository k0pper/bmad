"use server"

import { del } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
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
