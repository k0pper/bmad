"use client"

import { useState } from "react"
import { Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CvUploadDialog } from "./CvUploadDialog"
import { CvPreview } from "./CvPreview"
import { formatFileSize } from "./formatFileSize"
import { requestCvDownloadUrl } from "@/actions/manage-cv"

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function handleDownload(cvVersionId: string) {
    setDownloadingId(cvVersionId)
    setDownloadError(null)
    const r = await requestCvDownloadUrl(cvVersionId)
    setDownloadingId(null)
    if (r.error || !r.data) {
      setDownloadError(r.error ?? "Could not open file")
      return
    }
    window.open(r.data.url, "_blank", "noopener,noreferrer")
  }

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

      {downloadError && (
        <p
          role="alert"
          className="mb-4 text-sm"
          style={{ color: "var(--color-danger)" }}
        >
          {downloadError}
        </p>
      )}

      {versions.length === 0 ? (
        <EmptyState onUpload={() => setDialogOpen(true)} />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {versions.map((cv, index) => (
            <CvCard
              key={cv.id}
              cv={cv}
              isActive={index === 0}
              isDownloading={downloadingId === cv.id}
              onDownload={() => handleDownload(cv.id)}
            />
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
  isDownloading,
  onDownload,
}: {
  cv: CvVersionRow
  isActive: boolean
  isDownloading: boolean
  onDownload: () => void
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isDownloading}
          onClick={onDownload}
          aria-label={`Download ${cv.name}`}
        >
          <Download size={14} aria-hidden />
          {isDownloading ? "Opening…" : "Download"}
        </Button>
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
