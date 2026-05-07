import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { checkCvVersionCap } from "@/lib/services/entitlement-service"
import { CvVersionsClient } from "@/components/cv/CvVersionsClient"

export default async function CvPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [rows, cap] = await Promise.all([
    prisma.cvVersion.findMany({
      where: { userId: session.user.id },
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        name: true,
        fileSize: true,
        uploadedAt: true,
        _count: { select: { snapshots: true } },
      },
    }),
    checkCvVersionCap(session.user.id),
  ])

  const versions = rows.map((row) => ({
    id: row.id,
    name: row.name,
    fileSize: row.fileSize,
    uploadedAt: row.uploadedAt,
    hasSnapshots: row._count.snapshots > 0,
  }))

  return (
    <div className="mx-auto max-w-5xl p-8">
      <CvVersionsClient
        versions={versions}
        cap={{ count: cap.count, cap: cap.cap, isPro: cap.isPro }}
      />
    </div>
  )
}
