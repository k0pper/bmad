import { get } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { buildContentDisposition } from "@/lib/http/contentDisposition"

/**
 * Same-origin proxy that streams a CvSnapshot file from Vercel Blob.
 *
 * CvSnapshot is the immutable point-in-time copy of a CV created when an
 * Application is recorded. It has no `userId` column — access is scoped via
 * the Application → JobListing → userId join. Non-owners get 404 (not 403)
 * so we don't leak the existence of someone else's snapshot.
 *
 * The snapshot is read-only by design. There is no PUT/DELETE on this route;
 * the only paths that mutate snapshot rows are Story 3.3's apply action
 * (creates) and the cascade from CvVersion deletion (deletes).
 *
 * Modes:
 *   - default: `Content-Disposition: inline` (browser preview)
 *   - `?download=1`: `Content-Disposition: attachment` (browser save)
 *
 * Failure modes the UI cares about:
 *   - 401: not signed in
 *   - 404: snapshot doesn't exist OR doesn't belong to the user OR the
 *          underlying blob is missing in storage. The UI surfaces this as
 *          "Snapshot unavailable" rather than a broken link.
 *   - 502: storage outage (transient)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await params

  const snapshot = await prisma.cvSnapshot.findFirst({
    where: { id, application: { userId: session.user.id } },
    select: {
      s3Key: true,
      cvVersion: { select: { name: true } },
    },
  })
  if (!snapshot) {
    return new Response("Not found", { status: 404 })
  }

  let result
  try {
    result = await get(snapshot.s3Key, { access: "private" })
  } catch {
    return new Response("Storage error", { status: 502 })
  }
  if (!result) {
    // Blob is missing in storage. The UI surfaces "Snapshot unavailable".
    return new Response("Not found", { status: 404 })
  }

  const isDownload =
    new URL(request.url).searchParams.get("download") === "1"

  return new Response(result.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildContentDisposition(
        isDownload ? "attachment" : "inline",
        `${snapshot.cvVersion.name}.pdf`,
      ),
      "Cache-Control": "private, max-age=300",
    },
  })
}
