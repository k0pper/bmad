"use client"

import { Button } from "@/components/ui/button"

export function EmptyBoardState({ onAddListing }: { onAddListing: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
      <div aria-hidden="true" className="w-full max-w-2xl space-y-px opacity-30">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 border rounded-md bg-muted animate-pulse" />
        ))}
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Paste a job URL — takes about 5 seconds
        </p>
        <Button onClick={onAddListing} size="lg">
          Add your first listing
        </Button>
      </div>
    </div>
  )
}
