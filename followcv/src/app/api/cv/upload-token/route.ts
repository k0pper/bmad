import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { auth } from "@/lib/auth"
import { checkCvVersionCap } from "@/lib/services/entitlement-service"

const TEN_MEGABYTES = 10 * 1024 * 1024

export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    // NOTE: we deliberately do NOT pass `onUploadCompleted`. Providing it (even
    // as a no-op) causes the Vercel Blob SDK to attempt a webhook handshake
    // back to the app after the PUT completes — which hangs forever in local
    // dev because there's no reachable callbackUrl. The DB row is created by
    // the `confirmCvUpload` Server Action, which the client calls immediately
    // after `upload()` resolves.
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayloadRaw) => {
        const session = await auth()
        if (!session?.user?.id) throw new Error("Unauthorized")

        const cap = await checkCvVersionCap(session.user.id)
        if (!cap.allowed) {
          throw new Error(
            "CV version limit reached — upgrade to Pro for unlimited versions"
          )
        }

        let clientName: string | undefined
        let fileHash: string | undefined
        if (clientPayloadRaw) {
          try {
            const parsed = JSON.parse(clientPayloadRaw) as {
              name?: string
              fileHash?: string
            }
            clientName = parsed.name
            fileHash = parsed.fileHash
          } catch {
            // Ignore malformed payload; the confirmCvUpload action validates
            // again before writing the DB row.
          }
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: TEN_MEGABYTES,
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            name: clientName,
            fileHash,
          }),
        }
      },
    })
    return Response.json(json)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return Response.json({ error: message }, { status: 400 })
  }
}
