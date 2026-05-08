"use client"

import { InlineNotesField } from "./InlineNotesField"
import { updateApplicationNotes } from "@/actions/manage-application"

type Props = {
  listingId: string
  initialNotes: string | null
}

export function ApplicationNotesField({ listingId, initialNotes }: Props) {
  return (
    <InlineNotesField
      initialValue={initialNotes}
      ariaLabel="Application notes"
      placeholder="Anything worth remembering about this application…"
      onSave={async (value) => {
        const r = await updateApplicationNotes({ listingId, notes: value })
        return { error: r.error }
      }}
    />
  )
}
