"use client"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function EmptyBoardState({ onAddListing }: { onAddListing: () => void }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6">
      <div aria-hidden="true" className="w-full max-w-2xl space-y-px opacity-30">
        {[1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            className="h-14 rounded-md"
            style={{ height: "var(--board-row-height)" }}
          />
        ))}
      </div>
      <div className="space-y-3 text-center">
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Paste a job URL — takes about 5 seconds
        </p>
        <Button onClick={onAddListing} variant="brand" size="lg">
          Add your first listing
        </Button>
      </div>
    </div>
  )
}
