"use client"

import { useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { FileText } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

// Use the CDN-hosted worker — bundling pdfjs-dist's worker through Turbopack is
// fragile; the CDN copy is pinned to react-pdf's bundled pdfjs version so
// they're always in sync.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const PREVIEW_WIDTH = 240

type Props = {
  /** Same-origin proxy URL (`/api/cv/[id]/file`) the browser fetches. May be
   *  null when there's nothing to preview. */
  url: string | null
  /** Visible label for accessibility / fallback. */
  name: string
}

export function CvPreviewInner({ url, name }: Props) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >(url ? "loading" : "error")

  return (
    <div
      className="relative flex aspect-[1/1.414] w-full items-center justify-center overflow-hidden bg-surface"
      aria-label={`Preview of ${name}`}
    >
      {url && (
        <Document
          file={url}
          onLoadSuccess={() => setStatus("ready")}
          onLoadError={() => setStatus("error")}
          loading={<PreviewSkeleton />}
          error={<PreviewFallback name={name} />}
          // Document mounts a hidden div even before the page renders;
          // hide it visually until ready so the skeleton/placeholder fills
          // the card cleanly.
          className={status === "ready" ? "" : "hidden"}
        >
          <Page
            pageNumber={1}
            width={PREVIEW_WIDTH}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<PreviewSkeleton />}
            error={<PreviewFallback name={name} />}
          />
        </Document>
      )}

      {status === "loading" && <PreviewSkeleton />}
      {status === "error" && <PreviewFallback name={name} />}
    </div>
  )
}

function PreviewSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Skeleton className="h-full w-full" />
    </div>
  )
}

function PreviewFallback({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
      <FileText
        size={32}
        className="text-text-tertiary"
        aria-hidden
      />
      <p
        className="text-xs text-text-tertiary"
        title={name}
      >
        Preview unavailable
      </p>
    </div>
  )
}
