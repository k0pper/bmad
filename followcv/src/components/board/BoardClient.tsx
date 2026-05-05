"use client"

import { useState } from "react"
import { EmptyBoardState } from "./EmptyBoardState"
import { ImportDrawer } from "./ImportDrawer"

type Listing = {
  id: string
  title: string
  company: string
  location: string | null
  vitalityState: string
  importSource: string
  postedAt: Date | null
  createdAt: Date
}

export function BoardClient({ listings, children }: { listings: Listing[]; children?: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Your Board
        </h1>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Add listing
        </button>
      </div>

      {listings.length === 0 ? (
        <EmptyBoardState onAddListing={() => setDrawerOpen(true)} />
      ) : (
        <div className="rounded-md border">
          {children}
        </div>
      )}

      <ImportDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
