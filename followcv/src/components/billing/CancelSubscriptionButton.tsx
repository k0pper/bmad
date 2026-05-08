"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cancelSubscription } from "@/actions/manage-subscription"

export function CancelSubscriptionButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  function handleCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelSubscription()
      if (result.error) {
        setError(result.error)
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
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Cancel subscription
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-4">
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Cancel at the end of the current billing period? You&apos;ll keep Pro
        access until then.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="brand"
          size="sm"
          disabled={isPending}
          onClick={handleCancel}
        >
          {isPending ? "Cancelling…" : "Yes, cancel"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Keep Pro
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
