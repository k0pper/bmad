/**
 * Resolve the public app URL for building absolute redirects (OAuth flows,
 * payment redirects, email links). Falls back through `APP_URL` →
 * `NEXT_PUBLIC_APP_URL` → Vercel-injected `VERCEL_URL`.
 */
export function getAppUrl(): string {
  const url =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL
  if (!url) {
    throw new Error(
      "APP_URL is not set; cannot construct redirect URLs. Set APP_URL (or NEXT_PUBLIC_APP_URL) in the environment.",
    )
  }
  // Vercel sets VERCEL_URL without a scheme; callers need a fully-qualified URL.
  return url.startsWith("http") ? url : `https://${url}`
}
