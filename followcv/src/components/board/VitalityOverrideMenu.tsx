"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Menu } from "@base-ui/react/menu"
import { VitalityBadge } from "@/components/vitality/VitalityBadge"
import { UndoToast } from "@/components/ui/UndoToast"
import {
  overrideVitality,
  clearVitalityOverride,
  type VitalityOverrideSnapshot,
} from "@/actions/listing"
import type { OverrideSource, VitalityState } from "@/generated/prisma/client"

const STATE_OPTIONS: { state: VitalityState; label: string }[] = [
  { state: "HOT", label: "Hot" },
  { state: "ACTIVE", label: "Active" },
  { state: "IN_DIALOGUE", label: "In Dialogue" },
  { state: "DEADLINE", label: "Deadline" },
  { state: "COOLING", label: "Cooling" },
  { state: "COLD", label: "Cold" },
  { state: "GHOSTING", label: "Ghosting" },
  { state: "CLOSED", label: "Closed" },
]

type ActiveToast = {
  listingId: string
  snapshot: VitalityOverrideSnapshot
  message: string
}

type Props = {
  listingId: string
  currentState: VitalityState
  overrideSource: OverrideSource | null
}

export function VitalityOverrideMenu({ listingId, currentState, overrideSource }: Props) {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const isOverridden = overrideSource === "USER"

  function handleSelect(newState: VitalityState) {
    setError(null)
    startTransition(async () => {
      const result = await overrideVitality(listingId, newState)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      router.refresh()
      setToast({
        listingId,
        snapshot: result.data.snapshot,
        message: `Set to ${labelFor(newState)}`,
      })
    })
  }

  function handleClear() {
    setError(null)
    startTransition(async () => {
      const result = await clearVitalityOverride(listingId)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      router.refresh()
      setToast({
        listingId,
        snapshot: result.data.snapshot,
        message: `Override cleared — now ${labelFor(result.data.newState)}`,
      })
    })
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label="Change vitality state"
          disabled={isPending}
          onClick={(e) => {
            // Prevent BoardRow's outer Link from navigating.
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          render={<button type="button" />}
        >
          <VitalityBadge state={currentState} isOverridden={isOverridden} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4}>
            <Menu.Popup
              className="min-w-[200px] rounded-md border bg-white py-1 shadow-md text-sm"
              style={{ borderColor: "var(--color-border, #e2e8f0)" }}
            >
              {STATE_OPTIONS.map((opt) => (
                <Menu.Item
                  key={opt.state}
                  onClick={() => handleSelect(opt.state)}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer data-[highlighted]:bg-slate-100 outline-none"
                >
                  <VitalityBadge state={opt.state} />
                  {opt.state === currentState && !isOverridden && (
                    <span
                      className="ml-auto text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      current
                    </span>
                  )}
                </Menu.Item>
              ))}
              <div
                role="separator"
                className="my-1 border-t"
                style={{ borderColor: "var(--color-border, #e2e8f0)" }}
              />
              <Menu.Item
                disabled={!isOverridden}
                onClick={handleClear}
                className="px-3 py-1.5 cursor-pointer data-[highlighted]:bg-slate-100 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed outline-none"
              >
                Clear override
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {error && (
        <p role="alert" className="sr-only">
          {error}
        </p>
      )}
      {toast && (
        <UndoToast
          listingId={toast.listingId}
          snapshot={toast.snapshot}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  )
}

function labelFor(state: VitalityState): string {
  return STATE_OPTIONS.find((o) => o.state === state)?.label ?? state
}
