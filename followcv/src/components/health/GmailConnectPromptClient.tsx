"use client"

import Link from "next/link"
import { useState, useSyncExternalStore } from "react"
import { Mail, X } from "lucide-react"

const DISMISS_KEY = "followcv:gmail-prompt-dismissed-v1"

function readDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

// `useSyncExternalStore` with a no-op subscribe is the recommended pattern
// for reading client-only storage without triggering a hydration mismatch.
// During SSR the server snapshot returns `false` (prompt visible); on
// client hydration the real localStorage value takes over.
function subscribe(): () => void {
  return () => {}
}
function getServerSnapshot(): boolean {
  return false
}

/**
 * Client side of the Gmail connect prompt. The Server parent already
 * gated on Pro + ≥3 imports + no token; this component just owns the
 * dismissal flag in localStorage.
 */
export function GmailConnectPromptClient() {
  const persistedDismissed = useSyncExternalStore(
    subscribe,
    readDismissed,
    getServerSnapshot,
  )
  const [locallyDismissed, setLocallyDismissed] = useState(false)
  const hidden = persistedDismissed || locallyDismissed

  function handleDismiss() {
    setLocallyDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // localStorage may be unavailable in some private-browsing contexts;
      // hiding the prompt for the current render is enough.
    }
  }

  if (hidden) return null

  return (
    <div
      role="region"
      aria-label="Connect Gmail prompt"
      className="mx-3 mb-2 rounded-md border p-3"
      style={{
        borderColor: "var(--color-border, #e2e8f0)",
        backgroundColor: "var(--color-brand-subtle, #eef2ff)",
      }}
    >
      <div className="flex items-start gap-2">
        <Mail
          size={14}
          aria-hidden
          className="mt-0.5"
          style={{ color: "var(--color-brand)" }}
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Connect Gmail to auto-track replies
          </p>
          <Link
            href="/settings/gmail"
            className="mt-1 inline-block text-xs font-medium underline"
            style={{ color: "var(--color-brand)" }}
          >
            Learn more
          </Link>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss Gmail prompt"
          className="rounded p-0.5 transition-opacity hover:opacity-70"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    </div>
  )
}
