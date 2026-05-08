"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Dropdown } from "@/components/ui/Dropdown"
import { Toast } from "@/components/ui/Toast"
import { updateApplicationStatus } from "@/actions/manage-application"
import type { ApplicationStatus } from "@/generated/prisma/client"

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  OFFER_RECEIVED: "Offer received",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  ON_HOLD: "On hold",
  GHOSTED: "Ghosted",
}

const ORDER: ApplicationStatus[] = [
  "APPLIED",
  "INTERVIEWING",
  "OFFER_RECEIVED",
  "ON_HOLD",
  "GHOSTED",
  "REJECTED",
  "WITHDRAWN",
]

type Props = {
  listingId: string
  initialStatus: ApplicationStatus
}

export function ApplicationStatusSelect({ listingId, initialStatus }: Props) {
  const [optimistic, setOptimistic] = useState<ApplicationStatus>(initialStatus)
  const [toast, setToast] = useState<string | null>(null)
  const router = useRouter()

  async function handleSelect(next: string) {
    const status = next as ApplicationStatus
    if (status === optimistic) return

    const previous = optimistic
    setOptimistic(status)

    const result = await updateApplicationStatus({ listingId, status })
    if (result.error) {
      setOptimistic(previous)
      setToast(result.error)
      return
    }
    router.refresh()
  }

  const items = ORDER.map((value) => ({
    value,
    label: STATUS_LABELS[value],
  }))

  return (
    <>
      <Dropdown<ApplicationStatus>
        triggerLabel={STATUS_LABELS[optimistic]}
        ariaLabel="Application status"
        items={items}
        value={optimistic}
        onSelect={handleSelect}
        align="start"
        size="sm"
        minWidthPx={180}
      />
      {toast && (
        <Toast
          message={toast}
          durationSeconds={5}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  )
}
