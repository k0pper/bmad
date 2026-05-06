/**
 * Compute a hex-encoded SHA-256 hash of a file using the Web Crypto API.
 * Same content → same hash, regardless of filename or upload time. Used to
 * dedupe uploads on the server side.
 */
export async function computeFileHash(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
