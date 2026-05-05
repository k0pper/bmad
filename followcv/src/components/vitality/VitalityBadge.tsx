import { Flame, Clock, CircleCheck, MessageCircle, Thermometer, Snowflake, Ghost, XCircle } from "lucide-react"
import type { VitalityState } from "@/generated/prisma/client"

type BadgeConfig = {
  label: string
  bg: string
  text: string
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
  ariaContext: string
}

const CONFIG: Record<VitalityState, BadgeConfig> = {
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

export function VitalityBadge({ state }: { state: VitalityState }) {
  const { label, bg, text, icon: Icon, ariaContext } = CONFIG[state]

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: text }}
      aria-label={`${label} — ${ariaContext}`}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  )
}
