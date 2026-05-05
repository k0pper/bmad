import { VitalityBadge } from "@/components/vitality/VitalityBadge"
import type { VitalityState } from "@/generated/prisma/client"

type BoardRowProps = {
  id: string
  title: string
  company: string
  location: string | null
  vitalityState: VitalityState
  importSource: "URL_IMPORT" | "MANUAL"
  postedAt: Date | string | null
  createdAt: Date | string
}

export function BoardRow({ title, company, location, vitalityState, importSource, createdAt }: BoardRowProps) {
  const dateLabel = new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })

  return (
    <div className="h-14 border-b flex items-center px-4 gap-3">
      {/* Favicon placeholder */}
      <div
        className="w-6 h-6 rounded flex-shrink-0 bg-muted"
        aria-hidden="true"
      />

      {/* Title + company + location */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </p>
        <p
          className="text-xs truncate"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {company}
          {location ? ` · ${location}` : ""}
        </p>
      </div>

      {/* VitalityBadge */}
      <div className="flex-shrink-0">
        <VitalityBadge state={vitalityState} />
      </div>

      {/* Date */}
      <span
        className="text-xs flex-shrink-0 hidden sm:block"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {dateLabel}
      </span>

      {/* Import source dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: importSource === "URL_IMPORT" ? "var(--color-brand)" : "var(--color-text-tertiary)" }}
        title={importSource === "URL_IMPORT" ? "Auto-imported from URL" : "Manually added"}
        aria-hidden="true"
      />
    </div>
  )
}
