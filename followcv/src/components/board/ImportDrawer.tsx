"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Drawer } from "@base-ui/react"
import { importFromUrl, importFromUrlForced, manualImportListing } from "@/actions/import-listing"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProGatePattern } from "@/components/shared/ProGatePattern"

type DrawerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed"; url: string; prefilledCompany?: string }
  | { status: "manual" }
  | { status: "duplicate"; existingId: string; title: string; company: string }
  | { status: "cap_reached"; cap: number }

type ImportDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function companyFromUrl(url: string): string {
  try {
    const { hostname } = new URL(url)
    const stripped = hostname.replace(/^www\./, "")
    const name = stripped.split(".")[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    return ""
  }
}

export function ImportDrawer({ open, onOpenChange }: ImportDrawerProps) {
  const [state, setState] = useState<DrawerState>({ status: "idle" })
  const [url, setUrl] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Manual form fields
  const [manualTitle, setManualTitle] = useState("")
  const [manualCompany, setManualCompany] = useState("")
  const [manualLocation, setManualLocation] = useState("")
  const [manualSourceUrl, setManualSourceUrl] = useState("")
  const [manualNotes, setManualNotes] = useState("")
  const [manualSalaryMin, setManualSalaryMin] = useState("")
  const [manualSalaryMax, setManualSalaryMax] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)

  function reset() {
    setState({ status: "idle" })
    setUrl("")
    setErrorMessage(null)
    setManualTitle("")
    setManualCompany("")
    setManualLocation("")
    setManualSourceUrl("")
    setManualNotes("")
    setManualSalaryMin("")
    setManualSalaryMax("")
    setManualError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pastedUrl = e.clipboardData.getData("text")
    setUrl(pastedUrl)
    setErrorMessage(null)
    setState({ status: "loading" })

    const fd = new FormData()
    fd.append("url", pastedUrl)

    startTransition(async () => {
      const result = await importFromUrl(fd)

      if (!result.data) {
        // Scrape failed — drop into manual form pre-filled with what we can extract
        setManualCompany(companyFromUrl(pastedUrl))
        setManualSourceUrl(pastedUrl)
        setManualError(null)
        setState({ status: "failed", url: pastedUrl, prefilledCompany: companyFromUrl(pastedUrl) })
        return
      }

      const data = result.data

      if (data.status === "cap_reached") {
        setState({ status: "cap_reached", cap: data.cap })
        return
      }

      if (data.status === "duplicate") {
        setState({
          status: "duplicate",
          existingId: data.existingId,
          title: data.title,
          company: data.company,
        })
        return
      }

      if (data.status === "created") {
        onOpenChange(false)
        reset()
        router.refresh()
        return
      }
    })
  }

  function handleImportForced() {
    setState({ status: "loading" })
    startTransition(async () => {
      const result = await importFromUrlForced(url)
      if (!result.data) {
        setManualCompany(companyFromUrl(url))
        setManualSourceUrl(url)
        setManualError(null)
        setState({ status: "failed", url, prefilledCompany: companyFromUrl(url) })
        return
      }
      if (result.data.status === "created") {
        onOpenChange(false)
        reset()
        router.refresh()
      }
    })
  }

  function handleManualSubmit() {
    setManualError(null)
    const fd = new FormData()
    fd.append("title", manualTitle)
    fd.append("company", manualCompany)
    if (manualLocation) fd.append("location", manualLocation)
    if (manualSalaryMin) fd.append("salaryMin", manualSalaryMin)
    if (manualSalaryMax) fd.append("salaryMax", manualSalaryMax)
    if (manualSourceUrl) fd.append("sourceUrl", manualSourceUrl)
    if (manualNotes) fd.append("notes", manualNotes)

    startTransition(async () => {
      const result = await manualImportListing(fd)
      if (!result.data) {
        setManualError(result.error)
        return
      }
      if (result.data.status === "cap_reached") {
        setState({ status: "cap_reached", cap: result.data.cap })
        return
      }
      if (result.data.status === "created") {
        onOpenChange(false)
        reset()
        router.refresh()
      }
    })
  }

  const isManualForm = state.status === "failed" || state.status === "manual"

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="drawer-backdrop" />
        <Drawer.Viewport className="drawer-viewport">
        <Drawer.Popup className="drawer-popup flex h-full w-full flex-col bg-background shadow-xl md:w-96 xl:w-[480px]">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {isManualForm ? "Enter listing manually" : "Import job listing"}
            </h2>
            <Drawer.Close
              className="rounded-md p-1.5 text-text-secondary outline-none transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40"
              aria-label="Close drawer"
            >
              ×
            </Drawer.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {errorMessage && (
              <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
                {errorMessage}
              </p>
            )}

            {state.status === "cap_reached" && (
              <ProGatePattern
                headline={`You've reached ${state.cap} tracked listings`}
                description="Free accounts are capped at this many active listings. Upgrade to Pro for unlimited tracking."
                ctaText="Upgrade to Pro"
              />
            )}

            {(state.status === "idle" || state.status === "loading") && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="import-url"
                    className="block text-sm font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Job URL
                  </label>
                  <input
                    ref={urlInputRef}
                    id="import-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onPaste={handlePaste}
                    disabled={state.status === "loading" || isPending}
                    autoFocus
                    placeholder="Paste a job URL"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                  />
                </div>
                {(state.status === "loading" || isPending) && (
                  <div
                    role="status"
                    aria-live="polite"
                    aria-label="Fetching listing details"
                    className="space-y-3 rounded-md border border-border/60 bg-surface/40 p-3"
                  >
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-9 w-3/4" />
                  </div>
                )}
                <button
                  type="button"
                  className="rounded text-xs text-text-secondary underline-offset-2 transition-colors hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  onClick={() => {
                    setManualError(null)
                    setState({ status: "manual" })
                  }}
                >
                  Enter manually
                </button>
              </div>
            )}

            {isManualForm && (
              <form onSubmit={(e) => { e.preventDefault(); handleManualSubmit() }} className="space-y-3">
                {state.status === "failed" && (
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    We couldn&apos;t read this page — fill in what you know
                  </p>
                )}

                {manualError && (
                  <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
                    {manualError}
                  </p>
                )}

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Job title <span aria-hidden="true">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="e.g. Senior Product Designer"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Company <span aria-hidden="true">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={manualCompany}
                    onChange={(e) => setManualCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Location
                  </label>
                  <input
                    type="text"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    placeholder="e.g. London, Remote"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <label className="block text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      Salary min
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={manualSalaryMin}
                      onChange={(e) => setManualSalaryMin(e.target.value)}
                      placeholder="e.g. 80000"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="block text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      Salary max
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={manualSalaryMax}
                      onChange={(e) => setManualSalaryMax(e.target.value)}
                      placeholder="e.g. 120000"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Source URL
                  </label>
                  <input
                    type="url"
                    value={manualSourceUrl}
                    onChange={(e) => setManualSourceUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Notes
                  </label>
                  <textarea
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    rows={3}
                    placeholder="Anything worth remembering…"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    type="submit"
                    variant="brand"
                    size="lg"
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? "Adding…" : "Add to board"}
                  </Button>
                  <button
                    type="button"
                    className="rounded text-xs text-brand underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    onClick={() => {
                      setManualError(null)
                      setState({ status: "idle" })
                    }}
                  >
                    {state.status === "failed" ? "Try a different URL" : "Back to URL import"}
                  </button>
                </div>
              </form>
            )}

            {state.status === "duplicate" && (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  You already have <strong>{state.title}</strong> at <strong>{state.company}</strong> in your board.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      router.push(`/board#listing-${state.existingId}`)
                      onOpenChange(false)
                      reset()
                    }}
                  >
                    View existing listing
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="lg"
                    className="w-full"
                    disabled={isPending}
                    onClick={handleImportForced}
                  >
                    Import as new
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
