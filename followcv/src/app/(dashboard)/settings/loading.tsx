import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 p-8">
      {/* Profile section */}
      <section>
        <div className="mb-6 space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-32" />
        </div>
      </section>

      <hr className="border-border" />

      {/* Account section */}
      <section className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-9 w-44" />
        </div>
      </section>
    </div>
  )
}
