"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { createCheckoutSession } from "@/actions/manage-subscription"

export function CheckoutButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await createCheckoutSession()
      if (result.data === null) {
        setError(result.error)
        return
      }
      window.location.href = result.data.checkoutUrl
    })
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="brand"
        size="lg"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? "Redirecting…" : "Upgrade to Pro"}
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
