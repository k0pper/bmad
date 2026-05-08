"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { revokeGmailToken } from "@/app/(dashboard)/settings/actions"

/**
 * Disconnects the user's Gmail integration.
 *
 * UX spec lists "Revoke Gmail" as a destructive action (irreversible from
 * the user's POV — re-connecting requires going through the OAuth dance
 * again), so the primary affordance is `variant="destructive"` per the
 * Button hierarchy table.
 */
export function DisconnectGmailButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  function handleDisconnect() {
    setError(null)
    startTransition(async () => {
      const result = await revokeGmailToken()
      if (result?.type === "error") {
        setError(result.message)
        return
      }
      setConfirming(false)
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Disconnect Gmail
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-4">
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Disconnecting will stop automatic status updates. Your job listings
        and applications are not affected.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={handleDisconnect}
        >
          {isPending ? "Disconnecting…" : "Yes, disconnect"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Keep connected
        </Button>
      </div>
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
