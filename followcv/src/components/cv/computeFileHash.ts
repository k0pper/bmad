/**
 * Compute a hex-encoded SHA-256 hash of a file using the Web Crypto API.
 * Same content → same hash, regardless of filename or upload time. Used to
 * dedupe uploads on the server side.
 *
 * Implementation note: we wrap the result of `file.arrayBuffer()` in a
 * Uint8Array before passing to `crypto.subtle.digest`. In some test
 * environments (jsdom under certain Node + vitest versions) the
 * ArrayBuffer returned by Blob comes from a different realm than the one
 * `crypto.subtle.digest` is using, so the strict `instanceof ArrayBuffer`
 * check inside digest fails with "2nd argument is not instance of
 * ArrayBuffer…". A Uint8Array (TypedArray) is universally accepted as a
 * BufferSource regardless of the underlying ArrayBuffer's realm.
 */
export async function computeFileHash(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(buf))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
