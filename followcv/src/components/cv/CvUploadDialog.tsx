"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { Upload, X } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Toast } from "@/components/ui/Toast"
import { checkCvDuplicate, confirmCvUpload } from "@/actions/manage-cv"
import { computeFileHash } from "./computeFileHash"
import { formatFileSize } from "./formatFileSize"

const TEN_MEGABYTES = 10 * 1024 * 1024

type Stage =
  | { kind: "idle" }
  | { kind: "hashing" }
  | { kind: "duplicate"; existing: { id: string; name: string } }
  | { kind: "uploading" }
  | { kind: "error"; message: string }

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
}

export function CvUploadDialog({ open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [stage, setStage] = useState<Stage>({ kind: "idle" })
  const [showToast, setShowToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function reset() {
    setFile(null)
    setName("")
    setStage({ kind: "idle" })
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== "application/pdf") {
      setStage({ kind: "error", message: "Only PDF files are supported." })
      return
    }
    if (f.size > TEN_MEGABYTES) {
      setStage({
        kind: "error",
        message: `File is too large (${formatFileSize(f.size)}). Max 10 MB.`,
      })
      return
    }
    setFile(f)
    setStage({ kind: "idle" })
  }

  async function handleUpload() {
    if (!file) {
      setStage({ kind: "error", message: "Pick a PDF file first." })
      return
    }

    setStage({ kind: "hashing" })
    const fileHash = await computeFileHash(file)

    const dup = await checkCvDuplicate({ fileHash })
    if (dup.error) {
      setStage({ kind: "error", message: dup.error })
      return
    }
    if (dup.data?.existing) {
      setStage({ kind: "duplicate", existing: dup.data.existing })
      return
    }

    setStage({ kind: "uploading" })
    const finalName =
      name.trim().length > 0
        ? name.trim()
        : `CV — ${new Date().toISOString().slice(0, 10)}`

    let blobUrl: string
    try {
      const blob = await upload(`cv-versions/${file.name}`, file, {
        // The Vercel Blob store is configured as private — the access mode
        // here must match the store's configuration. Private blobs are not
        // publicly fetchable; the URL returned in `blob.url` carries a
        // signature understood by Vercel Blob.
        access: "private",
        handleUploadUrl: "/api/cv/upload-token",
        clientPayload: JSON.stringify({ name: finalName, fileHash }),
      })
      blobUrl = blob.url
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setStage({ kind: "error", message })
      return
    }

    const confirm = await confirmCvUpload({
      blobUrl,
      name: finalName,
      fileSize: file.size,
      fileHash,
    })
    if (confirm.error) {
      setStage({ kind: "error", message: confirm.error })
      return
    }

    setShowToast(`CV "${finalName}" uploaded.`)
    router.refresh()
    onOpenChange(false)
    reset()
  }

  const isBusy = stage.kind === "hashing" || stage.kind === "uploading"

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-6 shadow-lg transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                {stage.kind === "duplicate"
                  ? "File already uploaded"
                  : "Upload CV"}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close dialog"
                className="rounded-md p-1.5 text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <X size={16} aria-hidden />
              </Dialog.Close>
            </div>

            {stage.kind === "duplicate" ? (
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">
                  You already have this file uploaded as{" "}
                  <strong className="text-text-primary">
                    {stage.existing.name}
                  </strong>
                  . No need to upload it again.
                </p>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/cv#${stage.existing.id}`}
                    onClick={() => handleOpenChange(false)}
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary transition-colors duration-150 hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    View existing version
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenChange(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <FilePicker
                  file={file}
                  onPick={() => fileInputRef.current?.click()}
                  onClear={() => setFile(null)}
                  disabled={isBusy}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={isBusy}
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="cv-name"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Name <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <input
                    id="cv-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isBusy}
                    placeholder={`CV — ${new Date()
                      .toISOString()
                      .slice(0, 10)}`}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
                  />
                </div>

                {stage.kind === "hashing" || stage.kind === "uploading" ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="space-y-2 rounded-md border border-border/60 bg-surface/40 p-3"
                  >
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ) : null}

                {stage.kind === "error" ? (
                  <p
                    role="alert"
                    className="text-sm"
                    style={{ color: "var(--color-danger)" }}
                  >
                    {stage.message}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    type="button"
                    variant="brand"
                    size="lg"
                    className="w-full"
                    disabled={!file || isBusy}
                    onClick={handleUpload}
                  >
                    {stage.kind === "hashing"
                      ? "Hashing…"
                      : stage.kind === "uploading"
                      ? "Uploading…"
                      : "Upload"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {showToast && (
        <Toast
          message={showToast}
          durationSeconds={5}
          onDismiss={() => setShowToast(null)}
        />
      )}
    </>
  )
}

function FilePicker({
  file,
  onPick,
  onClear,
  disabled,
}: {
  file: File | null
  onPick: () => void
  onClear: () => void
  disabled: boolean
}) {
  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-surface/40 px-3 py-2.5">
        <Upload
          size={16}
          className="flex-shrink-0 text-brand"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {file.name}
          </p>
          <p className="text-xs text-text-tertiary">
            {formatFileSize(file.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove file"
          disabled={disabled}
          className="rounded p-1 text-text-tertiary transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface/40 px-3 py-6 text-sm text-text-secondary transition-colors duration-150 hover:border-brand/40 hover:bg-brand-subtle/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
    >
      <Upload size={20} aria-hidden />
      <span>
        <span className="font-medium">Click to upload</span> a PDF (max 10 MB)
      </span>
    </button>
  )
}
