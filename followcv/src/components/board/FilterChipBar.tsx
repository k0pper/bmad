"use client"

import { X } from "lucide-react"
import type { VitalityState } from "@/generated/prisma/client"
import { VITALITY_BADGE_CONFIG } from "@/components/vitality/VitalityBadge"
import { Dropdown } from "@/components/ui/Dropdown"
import type { SortOption } from "./applyBoardFilters"
import { cn } from "@/lib/utils"

const STATE_ORDER: VitalityState[] = [
  "HOT",
  "DEADLINE",
  "ACTIVE",
  "IN_DIALOGUE",
  "COOLING",
  "COLD",
  "GHOSTING",
  "CLOSED",
]

const SORT_LABELS: Record<SortOption, string> = {
  "date-added": "Date added",
  company: "Company",
  deadline: "Deadline",
}

const SORT_ITEMS = (Object.keys(SORT_LABELS) as SortOption[]).map((value) => ({
  value,
  label: SORT_LABELS[value],
  rightHint: "current",
}))

type Props = {
  selectedStates: VitalityState[]
  counts: Record<VitalityState, number>
  query: string
  sort: SortOption
  isAnyFilterActive: boolean
  onToggleState: (state: VitalityState) => void
  onClearAll: () => void
  onSetQuery: (query: string) => void
  onSetSort: (sort: SortOption) => void
}

export function FilterChipBar({
  selectedStates,
  counts,
  query,
  sort,
  isAnyFilterActive,
  onToggleState,
  onClearAll,
  onSetQuery,
  onSetSort,
}: Props) {
  const noStatesActive = selectedStates.length === 0

  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* Row 1 — vitality state chips */}
      <div
        role="group"
        aria-label="Filter by vitality state"
        className="flex flex-wrap items-center gap-1.5"
      >
        <Chip
          active={noStatesActive}
          onClick={() => {
            if (!noStatesActive) onClearAll()
          }}
        >
          All
        </Chip>
        {STATE_ORDER.map((state) => {
          const cfg = VITALITY_BADGE_CONFIG[state]
          const Icon = cfg.icon
          const isActive = selectedStates.includes(state)
          return (
            <Chip
              key={state}
              active={isActive}
              onClick={() => onToggleState(state)}
              ariaPressed={isActive}
              activeBg={cfg.bg}
              activeText={cfg.text}
            >
              <Icon size={12} aria-hidden />
              {cfg.label}
              <span className="text-text-tertiary">({counts[state]})</span>
            </Chip>
          )
        })}
      </div>

      {/* Row 2 — sort + search on the left, umbrella clear-all on the right */}
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown<SortOption>
          ariaLabel="Sort listings"
          triggerLabel={`Sort: ${SORT_LABELS[sort]}`}
          items={SORT_ITEMS}
          value={sort}
          onSelect={onSetSort}
          align="start"
          size="sm"
        />
        <SearchInput value={query} onChange={onSetQuery} />

        {isAnyFilterActive && (
          <>
            {/* Visual separator to make it clear the umbrella action is
                distinct from the sort/search controls beside it. */}
            <span
              aria-hidden="true"
              className="ml-auto h-5 w-px bg-border"
            />
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Clear all filters
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Chip({
  children,
  active,
  ariaPressed,
  activeBg,
  activeText,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  ariaPressed?: boolean
  activeBg?: string
  activeText?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        active
          ? activeBg
            ? "border-transparent"
            : "border-brand bg-brand-subtle text-brand"
          : "border-border bg-background text-text-secondary hover:bg-brand-subtle/60 hover:text-brand"
      )}
      style={
        active && activeBg
          ? { backgroundColor: activeBg, color: activeText, borderColor: activeBg }
          : undefined
      }
    >
      {children}
    </button>
  )
}

function SearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search title, company, notes…"
        aria-label="Search listings"
        className={cn(
          "w-56 rounded-md border bg-background px-2.5 py-1.5 pr-7 text-xs outline-none transition-colors duration-150",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-brand/40",
          value.length > 0 ? "border-brand/40" : "border-border"
        )}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-text-tertiary transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  )
}
