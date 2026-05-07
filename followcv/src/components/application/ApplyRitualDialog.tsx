"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { X } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Toast } from "@/components/ui/Toast"
import { applyToJob } from "@/actions/apply-to-job"
import { CVVersionSelector, type CvVersionForSelector } from "./CVVersionSelector"

type Stage =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  listing: { id: string; title: string; company: string } | null
  versions: CvVersionForSelector[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ApplyRitualDialog({
  open,
  onOpenChange,
  listing,
  versions,
}: Props) {
  const [cvVersionId, setCvVersionId] = useState<string>(
    versions[0]?.id ?? "",
  )
  const [appliedAt, setAppliedAt] = useState<string>(todayIso())
  const [notes, setNotes] = useState<string>("")
  const [stage, setStage] = useState<Stage>({ kind: "idle" })
  const [showToast, setShowToast] = useState<string | null>(null)
  const router = useRouter()

  function reset() {
    setCvVersionId(versions[0]?.id ?? "")
    setAppliedAt(todayIso())
    setNotes("")
    setStage({ kind: "idle" })
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleApply() {
    if (!listing) return
    if (!cvVersionId) {
      setStage({ kind: "error", message: "Pick a CV version first." })
      return
    }

    const date = new Date(appliedAt)
    if (Number.isNaN(date.getTime())) {
      setStage({ kind: "error", message: "Invalid application date." })
      return
    }

    setStage({ kind: "submitting" })
    const result = await applyToJob({
      jobListingId: listing.id,
      cvVersionId,
      appliedAt: date,
      notes: notes.trim().length > 0 ? notes.trim() : undefined,
    })

    if (result.error) {
      setStage({ kind: "error", message: result.error })
      return
    }

    const cvName = versions.find((v) => v.id === cvVersionId)?.name ?? "your CV"
    setShowToast(
      `Applied to ${listing.title} at ${listing.company} with "${cvName}" — version saved`,
    )
    router.refresh()
    onOpenChange(false)
    reset()
  }

  const isBusy = stage.kind === "submitting"
  const noVersions = versions.length === 0

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-6 shadow-lg transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                Apply to {listing?.title ?? "this listing"}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close dialog"
                className="rounded-md p-1.5 text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <X size={16} aria-hidden />
              </Dialog.Close>
            </div>

            {noVersions ? (
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">
                  You haven&apos;t uploaded a CV yet. Upload one first so we can
                  snapshot it with this application.
                </p>
                <Link
                  href="/cv"
                  onClick={() => handleOpenChange(false)}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary transition-colors duration-150 hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  Go to CVs
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="apply-cv"
                    className="block text-sm font-medium text-text-primary"
                  >
                    CV version
                  </label>
                  <div id="apply-cv">
                    <CVVersionSelector
                      versions={versions}
                      value={cvVersionId}
                      onSelect={setCvVersionId}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="apply-date"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Application date
                  </label>
                  <input
                    id="apply-date"
                    type="date"
                    value={appliedAt}
                    onChange={(e) => setAppliedAt(e.target.value)}
                    disabled={isBusy}
                    max={todayIso()}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="apply-notes"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Notes <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <textarea
                    id="apply-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isBusy}
                    rows={3}
                    placeholder="Anything worth remembering about this application…"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
                  />
                </div>

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
                    disabled={isBusy || !cvVersionId}
                    onClick={handleApply}
                  >
                    {isBusy ? "Saving…" : "Apply"}
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
