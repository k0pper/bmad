import { Skeleton } from "@/components/ui/skeleton"

export default function CvLoading() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-background"
          >
            <Skeleton className="aspect-[1/1.414] w-full" />
            <div className="flex items-start gap-3 border-t border-border p-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-7 w-24" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
