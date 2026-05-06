import { redirect } from "next/navigation"
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
      select: { id: true, name: true, fileSize: true, uploadedAt: true },
    }),
    checkCvVersionCap(session.user.id),
  ])

  return (
    <div className="mx-auto max-w-2xl p-8">
      <CvVersionsClient
        versions={versions}
        cap={{ count: cap.count, cap: cap.cap, isPro: cap.isPro }}
      />
    </div>
  )
}
