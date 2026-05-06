"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * `react-pdf` (and the underlying `pdfjs-dist`) reference `DOMMatrix` at
 * module-evaluation time, which is a browser-only global. Even though
 * `CvPreviewInner` is a Client Component, Next.js still evaluates its module
 * graph during SSR to render the initial RSC payload — that's where the
 * crash happens.
 *
 * `next/dynamic` with `ssr: false` defers loading the inner module to the
 * browser, so DOMMatrix is defined by the time react-pdf is evaluated.
 */
const CvPreviewInner = dynamic(
  () => import("./CvPreviewInner").then((mod) => mod.CvPreviewInner),
  {
    ssr: false,
    loading: () => (
      <div className="relative flex aspect-[1/1.414] w-full items-center justify-center overflow-hidden bg-surface">
        <Skeleton className="absolute inset-0" />
      </div>
    ),
  }
)

type Props = {
  url: string | null
  name: string
}

export function CvPreview(props: Props) {
  return <CvPreviewInner {...props} />
}
