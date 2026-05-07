import { get, put } from "@vercel/blob"

export type CreateSnapshotInput = {
  userId: string
  cvVersion: { s3Key: string }
}

export type CreateSnapshotResult = {
  snapshotId: string
  snapshotUrl: string
}

/**
 * Copy a CV version's blob into a fresh, immutable snapshot blob.
 *
 * Vercel Blob v2 has no native server-side copy(), so this reads the source
 * bytes via get() and writes them to a new key via put(). The path is
 * `cv/{userId}/{snapshotId}.pdf` where {snapshotId} is a fresh UUID. The
 * caller is expected to use {snapshotId} as the CvSnapshot.id so the row id
 * and the blob path stay aligned.
 *
 * This service does NOT write to the database. The caller (the apply-to-job
 * Server Action) owns the cleanup ordering: if the DB write fails, it must
 * call del() on the returned snapshotUrl to avoid an orphan blob.
 */
export async function createSnapshot({
  userId,
  cvVersion,
}: CreateSnapshotInput): Promise<CreateSnapshotResult> {
  const snapshotId = crypto.randomUUID()
  const pathname = `cv/${userId}/${snapshotId}.pdf`

  let buffer: ArrayBuffer
  try {
    const result = await get(cvVersion.s3Key, { access: "private" })
    if (!result) {
      throw new Error("Source CV not found in storage")
    }
    buffer = await new Response(result.stream).arrayBuffer()
  } catch (err) {
    throw new Error(
      `Failed to read source CV: ${err instanceof Error ? err.message : "unknown error"}`,
    )
  }

  let blob: { url: string }
  try {
    blob = await put(pathname, buffer, {
      access: "private",
      contentType: "application/pdf",
    })
  } catch (err) {
    throw new Error(
      `Failed to write snapshot: ${err instanceof Error ? err.message : "unknown error"}`,
    )
  }

  return { snapshotId, snapshotUrl: blob.url }
}
