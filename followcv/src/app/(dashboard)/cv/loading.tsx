import { Skeleton } from "@/components/ui/skeleton"

export default function CvLoading() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-4 rounded-sm" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
