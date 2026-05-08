"use client"

import Link from "next/link"
import { VitalityOverrideMenu } from "@/components/board/VitalityOverrideMenu"
import { BoardRowOverflowMenu } from "@/components/board/BoardRowOverflowMenu"
import type { OverrideSource, VitalityState } from "@/generated/prisma/client"

type BoardRowProps = {
  id: string
  title: string
  company: string
  location: string | null
  vitalityState: VitalityState
  overrideSource: OverrideSource | null
  importSource: "URL_IMPORT" | "MANUAL"
  postedAt: Date | string | null
  createdAt: Date | string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  archived?: boolean
  applied?: boolean
  followUpDue?: boolean
  isRecent?: boolean
  rowIndex?: number
  /**
   * Click handler for the inline Apply button. When undefined the button
   * is hidden (e.g. archived listings, or when the parent doesn't want to
   * surface the action). When the listing is already `applied`, an
   * "Applied" indicator is shown instead and clicks are no-ops.
   */
  onApplyClick?: () => void
}

function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : ""
  if (min && max) return `${sym}${fmt(min)}–${fmt(max)}`
  if (min) return `${sym}${fmt(min)}+`
  return `up to ${sym}${fmt(max!)}`
}

function relativePostedDate(postedAt: Date | string): string {
  const d = new Date(postedAt)
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return "Posted today"
  if (days === 1) return "Posted yesterday"
  if (days < 7) return `Posted ${days}d ago`
  if (days < 30) return `Posted ${Math.floor(days / 7)}w ago`
  return `Posted ${Math.floor(days / 30)}mo ago`
}

export function BoardRow({
  id,
  title,
  company,
  location,
  vitalityState,
  overrideSource,
  importSource,
  postedAt,
  createdAt,
  salaryMin,
  salaryMax,
  salaryCurrency,
  archived = false,
  applied = false,
  followUpDue = false,
  isRecent = false,
  rowIndex = 0,
  onApplyClick,
}: BoardRowProps) {
  const dateLabel = new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const salary = formatSalary(salaryMin, salaryMax, salaryCurrency)
  const postedLabel = postedAt ? relativePostedDate(postedAt) : null

  const subtitle = [company, location, salary, postedLabel].filter(Boolean).join(" · ")

  return (
    <Link
      href={`/board/${id}`}
      className="board-row-animate h-14 border-b flex items-center px-4 gap-3 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      style={{ "--row-index": rowIndex } as React.CSSProperties}
    >
      {/* Favicon placeholder */}
      <div
        className="w-6 h-6 rounded flex-shrink-0 bg-muted"
        aria-hidden="true"
      />

      {/* Title + subtitle */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </p>
          {isRecent && (
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: "var(--color-brand)" }}
              title="Updated since your last visit"
              aria-label="Updated since your last visit"
            />
          )}
        </div>
        <p
          className="text-xs truncate"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {subtitle}
        </p>
      </div>

      {/* VitalityBadge with override menu */}
      <div className="flex-shrink-0">
        <VitalityOverrideMenu
          listingId={id}
          currentState={vitalityState}
          overrideSource={overrideSource}
        />
      </div>

      {/* Date added */}
      <span
        className="text-xs flex-shrink-0 hidden sm:block"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {dateLabel}
      </span>

      {/* Apply / Applied / Follow-up indicator */}
      {applied && followUpDue ? (
        <span
          className="hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:inline-block"
          style={{
            backgroundColor: "var(--color-vitality-deadline-bg, #fef3c7)",
            color: "var(--color-vitality-deadline-text, #92400e)",
          }}
          title="No activity recently — time to follow up"
        >
          Follow up
        </span>
      ) : applied ? (
        <span
          className="hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:inline-block"
          style={{
            backgroundColor: "var(--color-vitality-active-bg)",
            color: "var(--color-vitality-active-text)",
          }}
          title="You've applied to this listing"
        >
          Applied
        </span>
      ) : onApplyClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onApplyClick()
          }}
          className="hidden h-7 flex-shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:inline-flex"
        >
          Apply
        </button>
      ) : null}

      {/* Import source dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: importSource === "URL_IMPORT" ? "var(--color-brand)" : "var(--color-text-tertiary)" }}
        title={importSource === "URL_IMPORT" ? "Auto-imported from URL" : "Manually added"}
        aria-hidden="true"
      />

      {/* Overflow menu (Archive / Unarchive) */}
      <BoardRowOverflowMenu listingId={id} archived={archived} />
    </Link>
  )
}
