"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"

type ToastAction = {
  label: string
  onAction: () => Promise<void> | void
  pendingLabel?: string
}

type Props = {
  message: string
  durationSeconds?: number
  action?: ToastAction
  onDismiss: () => void
}

export function Toast({ message, durationSeconds = 5, action, onDismiss }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds)
  const [isPending, startTransition] = useTransition()
  const actionButtonRef = useRef<HTMLButtonElement>(null)
  const dismissButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Dismiss any other toast that may be active.
    window.dispatchEvent(new CustomEvent("toast-show"))
    function handleOtherShown() {
      onDismiss()
    }
    queueMicrotask(() => {
      window.addEventListener("toast-show", handleOtherShown)
    })
    return () => {
      window.removeEventListener("toast-show", handleOtherShown)
    }
  }, [onDismiss])

  useEffect(() => {
    // Focus the action button if present, else the dismiss button.
    ;(actionButtonRef.current ?? dismissButtonRef.current)?.focus()
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

  function handleAction() {
    if (!action) return
    startTransition(async () => {
      try {
        await action.onAction()
      } finally {
        onDismiss()
      }
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
      {action && (
        <button
          ref={actionButtonRef}
          type="button"
          onClick={handleAction}
          disabled={isPending}
          className="rounded-md px-3 py-1 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: "var(--color-brand)", color: "white" }}
        >
          {isPending
            ? action.pendingLabel ?? `${action.label}…`
            : `${action.label} (${secondsLeft}s)`}
        </button>
      )}
      <button
        ref={dismissButtonRef}
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded text-sm transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        ×
      </button>
    </div>,
    document.body
  )
}
