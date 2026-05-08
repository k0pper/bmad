import Link from "next/link"

type Props = {
  count: number
  cap: number
}

/**
 * Progressive cap-warning banner for the board page. Server Component.
 *
 * Behaviour (matches Story 5.1 AC):
 *   - count < 80% of cap → render nothing.
 *   - 80% ≤ count < 90% → neutral banner: "You're using N of your M
 *     free listing slots".
 *   - count ≥ 90% → urgent banner: "Almost full — K slots remaining.
 *     Upgrade to Pro for unlimited listings".
 *   - count ≥ cap → render nothing (the cap-reached UX is the
 *     ProGatePattern in the ImportDrawer; the banner doesn't double up).
 *
 * Pro users never see this banner — the page's BoardListing pipeline
 * skips rendering it when `cap === null`.
 */
export function ListingCapBanner({ count, cap }: Props) {
  const ratio = count / cap

  if (ratio < 0.8) return null
  if (count >= cap) return null // ImportDrawer's ProGatePattern owns this state

  const isUrgent = ratio >= 0.9
  const remaining = cap - count

  return (
    <div
      role="status"
      className="mb-4 flex items-center justify-between gap-4 rounded-md border px-4 py-2.5 text-sm"
      style={{
        borderColor: isUrgent
          ? "var(--color-vitality-deadline-text, #92400e)"
          : "var(--color-border, #e2e8f0)",
        backgroundColor: isUrgent
          ? "var(--color-vitality-deadline-bg, #fef3c7)"
          : "var(--color-brand-subtle, #eef2ff)",
        color: isUrgent
          ? "var(--color-vitality-deadline-text, #92400e)"
          : "var(--color-text-primary)",
      }}
    >
      <span>
        {isUrgent ? (
          <>
            <strong>Almost full</strong> — {remaining}{" "}
            {remaining === 1 ? "slot" : "slots"} remaining. Upgrade to Pro for
            unlimited listings.
          </>
        ) : (
          <>
            You&apos;re using {count} of your {cap} free listing slots.
          </>
        )}
      </span>
      <Link
        href="/settings/subscription"
        className="ml-3 flex-shrink-0 rounded px-2.5 py-1 text-xs font-medium underline underline-offset-2"
      >
        Upgrade
      </Link>
    </div>
  )
}
