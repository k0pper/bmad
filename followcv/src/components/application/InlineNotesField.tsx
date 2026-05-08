"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

type SaveResult = { error: string | null }

type Props = {
  /** Initial value from the server. */
  initialValue: string | null
  /** Async save function — return `error: null` on success. */
  onSave: (value: string) => Promise<SaveResult>
  placeholder?: string
  ariaLabel: string
  rows?: number
}

type Status = "idle" | "saving" | "saved" | "error"

/**
 * Inline notes textarea that saves on blur. Tracks dirty state so a blur
 * after no edits is a no-op. Shows a subtle status indicator (Saving… /
 * Saved / error message) inline below the textarea. Calls router.refresh()
 * after a successful save to sync server-rendered descendants.
 */
export function InlineNotesField({
  initialValue,
  onSave,
  placeholder,
  ariaLabel,
  rows = 4,
}: Props) {
  const [value, setValue] = useState<string>(initialValue ?? "")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const lastSavedRef = useRef<string>(initialValue ?? "")
  const router = useRouter()

  async function handleBlur() {
    const trimmed = value.trim()
    const lastTrimmed = lastSavedRef.current.trim()
    if (trimmed === lastTrimmed) {
      // No semantic change; suppress the request.
      return
    }

    setStatus("saving")
    setErrorMessage(null)
    const result = await onSave(value)
    if (result.error) {
      setStatus("error")
      setErrorMessage(result.error)
      return
    }
    lastSavedRef.current = value
    setStatus("saved")
    router.refresh()
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    if (status === "saved" || status === "error") {
      setStatus("idle")
      setErrorMessage(null)
    }
  }

  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-brand/40"
      />
      <p
        className="min-h-[1rem] text-xs"
        style={{
          color:
            status === "error"
              ? "var(--color-danger, #b91c1c)"
              : "var(--color-text-tertiary)",
        }}
        role={status === "error" ? "alert" : undefined}
      >
        {status === "saving"
          ? "Saving…"
          : status === "saved"
          ? "Saved"
          : status === "error"
          ? errorMessage
          : ""}
      </p>
    </div>
  )
}
