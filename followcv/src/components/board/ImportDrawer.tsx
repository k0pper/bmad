"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Drawer } from "@base-ui/react"
import { importFromUrl, importFromUrlForced } from "@/actions/import-listing"

type DrawerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed"; url: string }
  | { status: "duplicate"; existingId: string; title: string; company: string }

type ImportDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportDrawer({ open, onOpenChange }: ImportDrawerProps) {
  const [state, setState] = useState<DrawerState>({ status: "idle" })
  const [url, setUrl] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function reset() {
    setState({ status: "idle" })
    setUrl("")
    setErrorMessage(null)
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
        setErrorMessage(result.error)
        setState({ status: "failed", url: pastedUrl })
        return
      }

      const data = result.data

      if (data.status === "cap_reached") {
        setErrorMessage(`You've reached the ${data.cap} listing limit for the free tier.`)
        setState({ status: "idle" })
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
        setErrorMessage(result.error)
        setState({ status: "failed", url })
        return
      }
      if (result.data.status === "created") {
        onOpenChange(false)
        reset()
        router.refresh()
      }
    })
  }

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 bg-black/20 z-40" />
        <Drawer.Popup className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background shadow-xl md:w-96 xl:w-[480px]">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Import job listing
            </h2>
            <Drawer.Close
              className="rounded-full p-1 text-sm outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close drawer"
              style={{ color: "var(--color-text-secondary)" }}
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

            {(state.status === "idle" || state.status === "loading") && (
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
                {(state.status === "loading" || isPending) && (
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    Fetching listing details…
                  </p>
                )}
              </div>
            )}

            {state.status === "failed" && (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  We couldn&apos;t read this page — fill in what you know
                </p>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    URL
                  </label>
                  <input
                    type="url"
                    value={state.url}
                    readOnly
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm opacity-60"
                  />
                </div>
                <button
                  type="button"
                  className="text-xs underline"
                  style={{ color: "var(--color-brand)" }}
                  onClick={() => setState({ status: "idle" })}
                >
                  Try a different URL
                </button>
              </div>
            )}

            {state.status === "duplicate" && (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  You already have <strong>{state.title}</strong> at <strong>{state.company}</strong> in your board.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    style={{ color: "var(--color-text-primary)" }}
                    onClick={() => {
                      router.push(`/board#listing-${state.existingId}`)
                      onOpenChange(false)
                      reset()
                    }}
                  >
                    View existing listing
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    onClick={handleImportForced}
                  >
                    Import as new
                  </button>
                </div>
              </div>
            )}
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
