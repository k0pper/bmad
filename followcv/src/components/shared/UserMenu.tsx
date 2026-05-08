import Link from "next/link"
import { Sparkles } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * Sidebar user identity card. Sign-out lives on `/settings` only — it used
 * to be exposed here, but a single mistaken click signed users out with no
 * confirmation, which was easy to fat-finger on mobile. The whole card now
 * just links to /settings, where account actions (manage subscription,
 * Gmail, sign out, delete) are grouped together.
 *
 * Pro tier is surfaced inline so the user can tell at a glance whether
 * they're on a paid plan. Tier is read from the DB — never from the JWT
 * (`session.user.gmailConnected`-style flags can be up to 30 days stale).
 */
export async function UserMenu() {
  const session = await auth()
  if (!session?.user?.id) return null

  const { name, email } = session.user

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true },
  })
  const isPro = user?.subscriptionTier === "PRO"

  return (
    <Link
      href="/settings"
      aria-label="Open account settings"
      className="block rounded-md p-2 -m-2 transition-colors duration-150 hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          {name && (
            <p className="truncate text-sm font-medium text-text-primary">
              {name}
            </p>
          )}
          {email && (
            <p className="truncate text-xs text-text-secondary">{email}</p>
          )}
        </div>
        {isPro ? (
          <ProBadge />
        ) : (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{
              backgroundColor: "var(--color-vitality-cold-bg)",
              color: "var(--color-text-secondary)",
            }}
          >
            Free
          </span>
        )}
      </div>
    </Link>
  )
}

function ProBadge() {
  return (
    <span
      data-testid="pro-badge"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: "var(--color-brand-subtle)",
        color: "var(--color-brand)",
      }}
      aria-label="Pro subscription"
    >
      <Sparkles size={10} aria-hidden />
      Pro
    </span>
  )
}
