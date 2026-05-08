"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { EmptyBoardState } from "./EmptyBoardState"
import { ImportDrawer } from "./ImportDrawer"
import { BoardRow } from "./BoardRow"
import { FilterChipBar } from "./FilterChipBar"
import { Button } from "@/components/ui/button"
import { ApplyRitualDialog } from "@/components/application/ApplyRitualDialog"
import type { CvVersionForSelector } from "@/components/application/CVVersionSelector"
import {
  applyBoardFilters,
  countByVitalityState,
  DEFAULT_FILTER_STATE,
} from "./applyBoardFilters"
import { useBoardFilters } from "./useBoardFilters"
import type {
  ImportSource,
  OverrideSource,
  VitalityState,
} from "@/generated/prisma/client"

export type BoardListing = {
  id: string
  title: string
  company: string
  location: string | null
  vitalityState: VitalityState
  overrideSource: OverrideSource | null
  importSource: ImportSource
  postedAt: Date | null
  createdAt: Date
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  archived: boolean
  notes: string | null
  closingDate: Date | null
  isRecent: boolean
  applied: boolean
  followUpDue: boolean
}

export function BoardClient({
  listings,
  cvVersions,
  showArchived = false,
}: {
  listings: BoardListing[]
  cvVersions: CvVersionForSelector[]
  showArchived?: boolean
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [applyTargetId, setApplyTargetId] = useState<string | null>(null)
  const filters = useBoardFilters()

  const counts = useMemo(() => countByVitalityState(listings), [listings])
  const filtered = useMemo(
    () => applyBoardFilters(listings, filters.state),
    [listings, filters.state]
  )

  const isAnyFilterActive =
    filters.state.selectedStates.length > 0 ||
    filters.state.query.trim().length > 0 ||
    filters.state.sort !== DEFAULT_FILTER_STATE.sort

  const hasListings = listings.length > 0

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
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

      {hasListings && (
        <FilterChipBar
          selectedStates={filters.state.selectedStates}
          counts={counts}
          query={filters.state.query}
          sort={filters.state.sort}
          isAnyFilterActive={isAnyFilterActive}
          onToggleState={filters.toggleState}
          onClearAll={filters.clearAll}
          onSetQuery={filters.setQuery}
          onSetSort={filters.setSort}
        />
      )}

      {!hasListings ? (
        showArchived ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No archived listings.
          </p>
        ) : (
          <EmptyBoardState onAddListing={() => setDrawerOpen(true)} />
        )
      ) : filtered.length === 0 ? (
        <FilterEmptyState onClearAll={filters.clearAll} />
      ) : (
        <div className="rounded-md border">
          {filtered.map((listing, index) => (
            <BoardRow
              key={listing.id}
              id={listing.id}
              title={listing.title}
              company={listing.company}
              location={listing.location}
              vitalityState={listing.vitalityState}
              overrideSource={listing.overrideSource}
              importSource={listing.importSource}
              postedAt={listing.postedAt}
              createdAt={listing.createdAt}
              salaryMin={listing.salaryMin}
              salaryMax={listing.salaryMax}
              salaryCurrency={listing.salaryCurrency}
              archived={listing.archived}
              applied={listing.applied}
              followUpDue={listing.followUpDue}
              isRecent={listing.isRecent}
              rowIndex={index}
              onApplyClick={
                showArchived || listing.archived
                  ? undefined
                  : () => setApplyTargetId(listing.id)
              }
            />
          ))}
        </div>
      )}

      <ImportDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      <ApplyRitualDialog
        open={applyTargetId !== null}
        onOpenChange={(next) => {
          if (!next) setApplyTargetId(null)
        }}
        listing={
          applyTargetId
            ? listings.find((l) => l.id === applyTargetId) ?? null
            : null
        }
        versions={cvVersions}
      />
    </>
  )
}

function FilterEmptyState({ onClearAll }: { onClearAll: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-12 text-center"
    >
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        No listings match these filters.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onClearAll}>
        Clear all filters
      </Button>
    </div>
  )
}
