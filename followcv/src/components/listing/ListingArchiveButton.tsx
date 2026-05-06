"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { archiveListing, unarchiveListing } from "@/actions/listing"

type Props = {
  listingId: string
  archived: boolean
}

export function ListingArchiveButton({ listingId, archived }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      const action = archived ? unarchiveListing : archiveListing
      const result = await action(listingId)
      if (result.error === null) {
        router.push(archived ? "/board?archived=true" : "/board")
        router.refresh()
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
      style={{ borderColor: "var(--color-border, #e2e8f0)", color: "var(--color-text-primary)" }}
    >
      {isPending ? "Working…" : archived ? "Unarchive listing" : "Archive listing"}
    </button>
  )
}
