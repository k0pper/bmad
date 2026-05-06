"use client"

import { useState } from "react"
import { Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CvUploadDialog } from "./CvUploadDialog"
import { CvPreview } from "./CvPreview"
import { formatFileSize } from "./formatFileSize"

type CvVersionRow = {
  id: string
  name: string
  fileSize: number
  uploadedAt: Date
}

type CapInfo = {
  count: number
  cap: number | null
  isPro: boolean
}

type Props = {
  versions: CvVersionRow[]
  cap: CapInfo
}

export function CvVersionsClient({ versions, cap }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">CVs</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {cap.isPro ? (
              <>Unlimited storage on Pro.</>
            ) : (
              <>
                {cap.count} / {cap.cap} versions used.
                {cap.cap !== null && cap.count >= cap.cap && (
                  <>
                    {" "}
                    <span style={{ color: "var(--color-danger)" }}>
                      Upgrade to Pro for unlimited.
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="brand"
          size="lg"
          onClick={() => setDialogOpen(true)}
        >
          Upload CV
        </Button>
      </div>

      {versions.length === 0 ? (
        <EmptyState onUpload={() => setDialogOpen(true)} />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {versions.map((cv, index) => (
            <CvCard key={cv.id} cv={cv} isActive={index === 0} />
          ))}
        </ul>
      )}

      <CvUploadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}

function CvCard({
  cv,
  isActive,
}: {
  cv: CvVersionRow
  isActive: boolean
}) {
  const dateLabel = new Date(cv.uploadedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
  return (
    <li
      id={cv.id}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-background transition-shadow duration-150 hover:shadow-md"
    >
      <div className="relative">
        <CvPreview url={`/api/cv/${cv.id}/file`} name={cv.name} />
        {isActive && (
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider shadow-sm"
            style={{
              backgroundColor: "var(--color-vitality-active-bg)",
              color: "var(--color-vitality-active-text)",
            }}
          >
            Active
          </span>
        )}
      </div>
      <div className="flex items-start gap-3 border-t border-border p-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-text-primary"
            title={cv.name}
          >
            {cv.name}
          </p>
          <p className="text-xs text-text-tertiary">
            {dateLabel} · {formatFileSize(cv.fileSize)}
          </p>
        </div>
        {/*
         * Plain anchor — the proxy returns Content-Disposition: attachment
         * when ?download=1 is set, so the browser saves the file. Using <a>
         * instead of a button gives free right-click "Save as", middle-click
         * new tab, and Cmd-click — all natural download UX.
         */}
        <a
          href={`/api/cv/${cv.id}/file?download=1`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Download ${cv.name}`}
          className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Download size={14} aria-hidden />
          Download
        </a>
      </div>
    </li>
  )
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-12 text-center">
      <FileText size={28} className="text-text-tertiary" aria-hidden />
      <p className="text-sm text-text-secondary">
        No CVs uploaded yet. Upload your first one to get started.
      </p>
      <Button type="button" variant="brand" size="sm" onClick={onUpload}>
        Upload CV
      </Button>
    </div>
  )
}
