import { Flame, Clock, CircleCheck, MessageCircle, Thermometer, Snowflake, Ghost, XCircle, Lock } from "lucide-react"
import type { VitalityState } from "@/generated/prisma/client"

type BadgeConfig = {
  label: string
  bg: string
  text: string
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
  ariaContext: string
}

export const VITALITY_BADGE_CONFIG: Record<VitalityState, BadgeConfig> = {
  HOT: {
    label: "Hot",
    bg: "var(--color-vitality-hot-bg)",
    text: "var(--color-vitality-hot-text)",
    icon: Flame,
    ariaContext: "recently posted",
  },
  DEADLINE: {
    label: "Deadline",
    bg: "var(--color-vitality-deadline-bg)",
    text: "var(--color-vitality-deadline-text)",
    icon: Clock,
    ariaContext: "closing within 48 hours",
  },
  ACTIVE: {
    label: "Active",
    bg: "var(--color-vitality-active-bg)",
    text: "var(--color-vitality-active-text)",
    icon: CircleCheck,
    ariaContext: "application in progress",
  },
  IN_DIALOGUE: {
    label: "In Dialogue",
    bg: "var(--color-vitality-dialogue-bg)",
    text: "var(--color-vitality-dialogue-text)",
    icon: MessageCircle,
    ariaContext: "response received",
  },
  COOLING: {
    label: "Cooling",
    bg: "var(--color-vitality-cooling-bg)",
    text: "var(--color-vitality-cooling-text)",
    icon: Thermometer,
    ariaContext: "losing momentum",
  },
  COLD: {
    label: "Cold",
    bg: "var(--color-vitality-cold-bg)",
    text: "var(--color-vitality-cold-text)",
    icon: Snowflake,
    ariaContext: "old listing",
  },
  GHOSTING: {
    label: "Ghosting",
    bg: "var(--color-vitality-ghosting-bg)",
    text: "var(--color-vitality-ghosting-text)",
    icon: Ghost,
    ariaContext: "no response after 14 days",
  },
  CLOSED: {
    label: "Closed",
    bg: "var(--color-vitality-closed-bg)",
    text: "var(--color-vitality-closed-text)",
    icon: XCircle,
    ariaContext: "rejected or withdrawn",
  },
}

export function VitalityBadge({
  state,
  isOverridden = false,
  showLiveIndicator = true,
}: {
  state: VitalityState
  isOverridden?: boolean
  /** Show the pulsing "live" dot (or lock for overrides). Off in menus where
   * the same badge represents picker options. */
  showLiveIndicator?: boolean
}) {
  const { label, bg, text, icon: Icon, ariaContext } = VITALITY_BADGE_CONFIG[state]

  const indicator = !showLiveIndicator ? null : isOverridden ? (
    <span
      className="inline-flex items-center justify-center"
      aria-hidden="true"
      title="Manually set — vitality is frozen and won't auto-update"
    >
      <Lock size={11} />
    </span>
  ) : (
    <span
      className="vitality-live-dot"
      aria-hidden="true"
      title="Live — vitality auto-updates from posting age, application status and Gmail signals"
    />
  )

  const badgeAriaLabel = `${label} — ${ariaContext}${
    isOverridden ? " (manually set)" : showLiveIndicator ? " (live)" : ""
  }`

  return (
    <span
      data-vitality-state={state}
      data-vitality-overridden={isOverridden ? "true" : "false"}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" +
        (isOverridden ? " ring-1 ring-inset ring-current/30" : "")
      }
      style={{ backgroundColor: bg, color: text }}
      aria-label={badgeAriaLabel}
    >
      <Icon size={12} aria-hidden />
      <span>{label}</span>
      {indicator}
    </span>
  )
}
