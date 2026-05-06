"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { archiveListing, unarchiveListing } from "@/actions/listing"
import { Button } from "@/components/ui/button"

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
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "Working…" : archived ? "Unarchive listing" : "Archive listing"}
    </Button>
  )
}
