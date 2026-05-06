import { get } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { buildContentDisposition } from "@/lib/http/contentDisposition"

/**
 * Same-origin proxy that streams a CV file from Vercel Blob to the browser.
 *
 * Used by both the page-1 preview (`react-pdf`) and the Download button.
 *
 * Why this exists:
 *   Private Vercel Blob URLs are auth'd by the server-side
 *   `BLOB_READ_WRITE_TOKEN` env var, not by any signature on the URL itself.
 *   Opening such a URL directly from the browser returns a 403 forbidden
 *   page; XHR fetches are blocked by CORS. Proxying the bytes through this
 *   same-origin route is the only way to deliver a private blob to the
 *   user's browser. The blob URL never leaves the server.
 *
 * Modes:
 *   - default (preview): `Content-Disposition: inline`, browser renders
 *     in-place (e.g. into a canvas via pdf.js).
 *   - `?download=1`: `Content-Disposition: attachment`, browser saves to
 *     disk with the CV's name as the filename.
 *
 * Auth contract:
 *   The route requires a valid session AND the requested CvVersion must
 *   belong to the caller. 401 / 404 otherwise. We return 404 (not 403) for
 *   non-owners so the existence of someone else's CV is never leaked.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await params

  const cv = await prisma.cvVersion.findFirst({
    where: { id, userId: session.user.id },
    select: { s3Key: true, name: true },
  })
  if (!cv) {
    return new Response("Not found", { status: 404 })
  }

  let result
  try {
    result = await get(cv.s3Key, { access: "private" })
  } catch {
    return new Response("Storage error", { status: 502 })
  }
  if (!result) {
    return new Response("Not found", { status: 404 })
  }

  const isDownload =
    new URL(request.url).searchParams.get("download") === "1"

  return new Response(result.stream, {
    headers: {
      "Content-Type": "application/pdf",
      // RFC 6266-compliant encoding handles non-ASCII names like the default
      // `CV — 2026-05-06` (em-dash is U+2014, > 255 byte) without crashing
      // the Response constructor.
      "Content-Disposition": buildContentDisposition(
        isDownload ? "attachment" : "inline",
        `${cv.name}.pdf`
      ),
      // Five-minute private cache so refreshing /cv doesn't re-stream every
      // PDF. Cache-Control: private prevents shared/CDN caches from holding
      // a copy keyed only by URL, which would be a privacy issue.
      "Cache-Control": "private, max-age=300",
    },
  })
}
