import { auth } from "@/lib/auth"
import {
  getHealthScoreForUser,
  type CoachingZone,
} from "@/lib/services/health-score-engine"

const ZONE_GLYPHS: Record<CoachingZone, string> = {
  GREEN: "🟢",
  YELLOW: "🟡",
  RED: "🔴",
}

const ZONE_COLORS: Record<CoachingZone, { bg: string; fg: string }> = {
  GREEN: {
    bg: "var(--color-vitality-active-bg, #d1fae5)",
    fg: "var(--color-vitality-active-text, #065f46)",
  },
  YELLOW: {
    bg: "var(--color-vitality-deadline-bg, #fef3c7)",
    fg: "var(--color-vitality-deadline-text, #92400e)",
  },
  RED: {
    bg: "var(--color-danger-subtle, #fee2e2)",
    fg: "var(--color-danger, #991b1b)",
  },
}

/**
 * Sidebar widget showing the user's Application Health Score zone and the
 * single coaching instruction. Server Component — runs in the dashboard
 * layout's render path, no client-side data fetch added to the load.
 *
 * Cache strategy: every Server Action mutation in this codebase calls
 * `router.refresh()` from the client (per project-context.md), which
 * triggers a fresh server render and a fresh DB read here. No
 * `revalidateTag` plumbing needed — there's no cache tag to invalidate.
 */
export async function HealthScoreWidget() {
  const session = await auth()
  if (!session?.user?.id) return null

  const result = await getHealthScoreForUser(session.user.id)
  const colors = ZONE_COLORS[result.zone]

  return (
    <div
      data-testid="health-score-widget"
      className="mx-3 my-2 flex items-start gap-2.5 rounded-md p-2.5"
      style={{ backgroundColor: colors.bg, color: colors.fg }}
      aria-label={`Health score: ${result.zone}`}
    >
      <span
        className="text-base leading-none"
        aria-hidden
        title={`${result.zone} — ${result.score}/100`}
      >
        {ZONE_GLYPHS[result.zone]}
      </span>
      <p className="text-xs leading-snug">{result.coachingInstruction}</p>
    </div>
  )
}
