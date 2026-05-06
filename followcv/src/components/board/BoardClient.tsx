"use client"

import { useState } from "react"
import Link from "next/link"
import { EmptyBoardState } from "./EmptyBoardState"
import { ImportDrawer } from "./ImportDrawer"
import { Button } from "@/components/ui/button"

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

export function BoardClient({
  listings,
  showArchived = false,
  children,
}: {
  listings: Listing[]
  showArchived?: boolean
  children?: React.ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {showArchived ? "Archived listings" : "Your Board"}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href={showArchived ? "/board" : "/board?archived=true"}
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-brand-subtle/60 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {showArchived ? "← Back to active" : "View archived"}
          </Link>
          {!showArchived && (
            <Button
              type="button"
              variant="brand"
              size="lg"
              onClick={() => setDrawerOpen(true)}
            >
              Add listing
            </Button>
          )}
        </div>
      </div>

      {listings.length === 0 ? (
        showArchived ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No archived listings.
          </p>
        ) : (
          <EmptyBoardState onAddListing={() => setDrawerOpen(true)} />
        )
      ) : (
        <div className="rounded-md border">
          {children}
        </div>
      )}

      <ImportDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
