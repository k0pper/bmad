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
      onUploadCompleted: async () => {
        // No-op. The CvVersion DB row is created by `confirmCvUpload`
        // (Server Action) called from the client immediately after upload
        // returns. The webhook is unreliable in local dev without a public
        // tunnel, so we don't depend on it.
      },
    })
    return Response.json(json)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return Response.json({ error: message }, { status: 400 })
  }
}
