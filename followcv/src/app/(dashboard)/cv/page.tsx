import { redirect } from "next/navigation"
import { head } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { checkCvVersionCap } from "@/lib/services/entitlement-service"
import { CvVersionsClient } from "@/components/cv/CvVersionsClient"

export default async function CvPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [versions, cap] = await Promise.all([
    prisma.cvVersion.findMany({
      where: { userId: session.user.id },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        name: true,
        s3Key: true,
        fileSize: true,
        uploadedAt: true,
      },
    }),
    checkCvVersionCap(session.user.id),
  ])

  // Pre-mint a fresh signed preview URL for each row server-side. This avoids
  // a fan-out of client-side Server Action calls just to get URLs the cards
  // need on first paint. If `head()` fails for one row (blob missing,
  // store down), that card falls back to a placeholder — the others still
  // render fine.
  const versionsWithPreview = await Promise.all(
    versions.map(async (cv) => {
      let previewUrl: string | null = null
      try {
        const meta = await head(cv.s3Key)
        previewUrl = meta.url
      } catch {
        previewUrl = null
      }
      return {
        id: cv.id,
        name: cv.name,
        fileSize: cv.fileSize,
        uploadedAt: cv.uploadedAt,
        previewUrl,
      }
    })
  )

  return (
    <div className="mx-auto max-w-5xl p-8">
      <CvVersionsClient
        versions={versionsWithPreview}
        cap={{ count: cap.count, cap: cap.cap, isPro: cap.isPro }}
      />
    </div>
  )
}
