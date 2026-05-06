"use client"

import { useState } from "react"
import { Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CvUploadDialog } from "./CvUploadDialog"
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
        <ul className="overflow-hidden rounded-md border border-border">
          {versions.map((cv, index) => (
            <li
              key={cv.id}
              id={cv.id}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <FileText
                size={16}
                className="flex-shrink-0 text-text-tertiary"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {cv.name}
                  </p>
                  {index === 0 && <ActivePill />}
                </div>
                <p className="text-xs text-text-tertiary">
                  {new Date(cv.uploadedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {formatFileSize(cv.fileSize)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={downloadingId === cv.id}
                onClick={() => handleDownload(cv.id)}
                aria-label={`Download ${cv.name}`}
              >
                <Download size={14} aria-hidden />
                {downloadingId === cv.id ? "Opening…" : "Download"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CvUploadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
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

function ActivePill() {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{
        backgroundColor: "var(--color-vitality-active-bg)",
        color: "var(--color-vitality-active-text)",
      }}
    >
      Active
    </span>
  )
}
