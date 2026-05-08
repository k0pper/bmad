"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { startGmailOauth } from "@/actions/connect-gmail"

/**
 * Initiates the Gmail OAuth dance. The Server Action issues a `redirect()`
 * to Google's authorize URL — Next.js handles the navigation, so this
 * component never sees a return value on the success path. On error
 * (unauth, missing config) the action returns `{ data: null, error }`
 * which we surface inline.
 */
export function ConnectGmailButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConnect() {
    setError(null)
    startTransition(async () => {
      const result = await startGmailOauth()
      // We only get here if the action returned an error — the success
      // path redirects and never resolves on the client.
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="brand"
        size="lg"
        disabled={isPending}
        onClick={handleConnect}
      >
        {isPending ? "Redirecting…" : "Connect Gmail"}
      </Button>
      {error && (
        <p
          role="alert"
          className="text-sm"
          style={{ color: "var(--color-danger, #b91c1c)" }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
