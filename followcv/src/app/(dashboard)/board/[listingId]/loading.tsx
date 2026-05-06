import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

export default function ListingDetailLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <Skeleton className="h-7 w-28" />

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 flex-shrink-0" />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="contents">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <SkeletonText lines={3} />
      </div>

      <Skeleton className="h-9 w-40" />
    </div>
  )
}
