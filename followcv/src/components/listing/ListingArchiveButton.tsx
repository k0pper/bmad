"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { archiveListing, unarchiveListing } from "@/actions/listing"
import { Button } from "@/components/ui/button"

type Props = {
  listingId: string
  archived: boolean
}

export function ListingArchiveButton({ listingId, archived }: Props) {
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  async function handleClick() {
    // Plain useState pending instead of useTransition — wrapping
    // router.push + router.refresh in a transition wedges under React 19 +
    // Next 16 (button stuck on "Working…", dev indicator stuck on
    // "rendering…", action actually completed).
    setIsPending(true)
    const action = archived ? unarchiveListing : archiveListing
    const result = await action(listingId)
    if (result.error !== null) {
      setIsPending(false)
      return
    }

    // Always return to the active board after archive/unarchive.
    // Previously archived → /board, unarchived → /board?archived=true,
    // which sent the user to a view where the now-active listing didn't appear.
    router.replace("/board")
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
