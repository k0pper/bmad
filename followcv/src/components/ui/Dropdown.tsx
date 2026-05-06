"use client"

import { Menu } from "@base-ui/react/menu"
import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type DropdownItem<TValue extends string> = {
  value: TValue
  label: string
  /** Optional right-aligned hint (e.g. "current"). */
  rightHint?: string
}

type DropdownProps<TValue extends string> = {
  /** What the trigger button shows (e.g. "Sort: Date added"). */
  triggerLabel: ReactNode
  /** Accessible name for the trigger. */
  ariaLabel: string
  items: DropdownItem<TValue>[]
  /** The currently-selected value. The matching item's `rightHint` is shown. */
  value: TValue
  onSelect: (value: TValue) => void
  /**
   * Popup alignment relative to the trigger.
   * - "start" — popup's left edge aligns with trigger's left edge (default).
   * - "end" — popup's right edge aligns with trigger's right edge.
   * - "center" — popup is centred under the trigger.
   */
  align?: "start" | "end" | "center"
  size?: "sm" | "md"
  /** Extra classes for the trigger button. */
  className?: string
  /** Optional minimum popup width (defaults to 180px). */
  minWidthPx?: number
}

export function Dropdown<TValue extends string>({
  triggerLabel,
  ariaLabel,
  items,
  value,
  onSelect,
  align = "start",
  size = "sm",
  className,
  minWidthPx = 180,
}: DropdownProps<TValue>) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-background font-medium text-text-secondary transition-colors duration-150 hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
          className
        )}
        render={<button type="button" />}
      >
        {triggerLabel}
        <ChevronDown size={12} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        {/*
         * `z-[60]` keeps the popup above:
         *   - sidebar overlay (`z-40`)
         *   - drawer viewport (`z-50`)
         * If the project ever introduces a higher z-index surface, bump
         * this token in lockstep.
         */}
        <Menu.Positioner sideOffset={4} align={align} className="z-[60]">
          <Menu.Popup
            className="z-[60] rounded-md border bg-white py-1 text-sm shadow-md"
            style={{
              borderColor: "var(--color-border, #e2e8f0)",
              minWidth: `${minWidthPx}px`,
            }}
          >
            {items.map((item) => (
              <Menu.Item
                key={item.value}
                onClick={() => onSelect(item.value)}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 outline-none data-[highlighted]:bg-slate-100"
              >
                <span className="flex-1">{item.label}</span>
                {value === item.value && item.rightHint && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {item.rightHint}
                  </span>
                )}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
