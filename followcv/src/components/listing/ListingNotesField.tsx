"use client"

import { InlineNotesField } from "@/components/application/InlineNotesField"
import { updateListingNotes } from "@/actions/manage-application"

type Props = {
  listingId: string
  initialNotes: string | null
}

export function ListingNotesField({ listingId, initialNotes }: Props) {
  return (
    <InlineNotesField
      initialValue={initialNotes}
      ariaLabel="Listing notes"
      placeholder="Anything worth remembering about this listing…"
      onSave={async (value) => {
        const r = await updateListingNotes({ listingId, notes: value })
        return { error: r.error }
      }}
    />
  )
}
