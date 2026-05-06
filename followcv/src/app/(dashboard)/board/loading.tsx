import { Skeleton } from "@/components/ui/skeleton"

export default function BoardLoading() {
  return (
    <div className="p-8">
      {/* Header row — matches BoardClient layout */}
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Row skeletons — match --board-row-height (56px) */}
      <div className="overflow-hidden rounded-md border border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 last:border-b-0"
            style={{ height: "var(--board-row-height)" }}
          >
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
