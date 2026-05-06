import { get } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * Same-origin proxy that streams a CV file from Vercel Blob to the browser.
 *
 * Why this exists:
 *   Vercel Blob private signed URLs are not CORS-friendly — `react-pdf`'s
 *   XHR fetch from the browser to the blob host is blocked, even though
 *   browser navigation (download click) works fine. Proxying the bytes
 *   through a same-origin route bypasses CORS entirely. Bonus: the blob URL
 *   never leaves the server.
 *
 * Auth contract:
 *   The route requires a valid session AND the requested CvVersion must
 *   belong to the caller. 401 / 404 otherwise. We return 404 (not 403) for
 *   non-owners so the existence of someone else's CV is never leaked.
 */
export async function GET(
  _request: Request,
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

  return new Response(result.stream, {
    headers: {
      "Content-Type": "application/pdf",
      // Hint the browser to render inline (the preview renders to a canvas;
      // for downloads, the dedicated requestCvDownloadUrl flow is used).
      "Content-Disposition": `inline; filename="${escapeFilename(cv.name)}.pdf"`,
      // Five-minute private cache so refreshing /cv doesn't re-stream every
      // PDF. Cache-Control: private prevents shared/CDN caches from holding
      // a copy keyed only by URL, which would be a privacy issue.
      "Cache-Control": "private, max-age=300",
    },
  })
}

function escapeFilename(name: string): string {
  // Strip characters that break Content-Disposition headers.
  return name.replace(/[\r\n"\\]/g, "_")
}
