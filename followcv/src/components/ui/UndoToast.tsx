"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { undoVitalityOverride, type VitalityOverrideSnapshot } from "@/actions/listing"

const TOAST_DURATION_SECONDS = 30

type Props = {
  listingId: string
  snapshot: VitalityOverrideSnapshot
  message: string
  onDismiss: () => void
}

export function UndoToast({ listingId, snapshot, message, onDismiss }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(TOAST_DURATION_SECONDS)
  const [isPending, startTransition] = useTransition()
  const undoButtonRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  useEffect(() => {
    // Dismiss any other toast that may be active.
    const event = new CustomEvent("undo-toast-show")
    window.dispatchEvent(event)
    function handleOtherShown() {
      onDismiss()
    }
    // Subscribe AFTER dispatching so we don't dismiss ourselves.
    queueMicrotask(() => {
      window.addEventListener("undo-toast-show", handleOtherShown)
    })
    return () => {
      window.removeEventListener("undo-toast-show", handleOtherShown)
    }
  }, [onDismiss])

  useEffect(() => {
    undoButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (secondsLeft <= 0) {
      onDismiss()
      return
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [secondsLeft, onDismiss])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onDismiss])

  function handleUndo() {
    startTransition(async () => {
      const result = await undoVitalityOverride(listingId, snapshot)
      if (result.error === null) {
        router.refresh()
      }
      onDismiss()
    })
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-md border bg-white px-4 py-3 shadow-lg"
      style={{ borderColor: "var(--color-border, #e2e8f0)" }}
    >
      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
        {message}
      </span>
      <button
        ref={undoButtonRef}
        type="button"
        onClick={handleUndo}
        disabled={isPending}
        className="rounded-md px-3 py-1 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: "var(--color-brand)", color: "white" }}
      >
        {isPending ? "Undoing…" : `Undo (${secondsLeft}s)`}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-sm"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        ×
      </button>
    </div>,
    document.body
  )
}
