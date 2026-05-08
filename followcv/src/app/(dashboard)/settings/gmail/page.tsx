import { redirect } from "next/navigation"
import { ShieldCheck, Eye, EyeOff } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ProGatePattern } from "@/components/shared/ProGatePattern"
import { ConnectGmailButton } from "@/components/settings/ConnectGmailButton"
import { DisconnectGmailButton } from "@/components/settings/DisconnectGmailButton"

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

type SearchParams = Promise<{
  connected?: string
  denied?: string
  error?: string
}>

/**
 * Dedicated Gmail integration page (Story 6.1). The trust stakes of
 * connecting an inbox justify a full focused page, not a settings sub-tab
 * (UX spec, Journey 4).
 */
export default async function GmailSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [user, gmailToken] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    }),
    prisma.gmailToken.findUnique({
      where: { userId: session.user.id },
      select: { connectedEmail: true, createdAt: true },
    }),
  ])
  if (!user) redirect("/login")

  const params = await searchParams
  const banner = (() => {
    if (params.connected === "1") {
      return {
        kind: "success" as const,
        message: "Gmail connected. We'll monitor for replies automatically.",
      }
    }
    if (params.denied === "1") {
      return {
        kind: "info" as const,
        message:
          "No problem — connect Gmail in Settings whenever you're ready.",
      }
    }
    if (params.error) {
      const errorCopy: Record<string, string> = {
        no_refresh_token:
          "Google didn't return a refresh token. Try again and approve all requested permissions.",
        token_exchange_failed:
          "Google rejected the authorization code. Please try connecting again.",
        no_access_token: "Google didn't return an access token.",
        profile_fetch_failed:
          "We couldn't read your Gmail address from Google. Try again.",
        no_email: "Google didn't return an email address.",
      }
      return {
        kind: "error" as const,
        message:
          errorCopy[params.error] ?? "Something went wrong connecting Gmail.",
      }
    }
    return null
  })()

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <header>
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Gmail integration
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Auto-update listing status when companies you&apos;ve applied to reply.
        </p>
      </header>

      {banner && (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          className="rounded-md border p-3 text-sm"
          style={{
            borderColor:
              banner.kind === "success"
                ? "var(--color-success, #16a34a)"
                : banner.kind === "error"
                  ? "var(--color-danger, #b91c1c)"
                  : "var(--color-border, #e2e8f0)",
            color:
              banner.kind === "error"
                ? "var(--color-danger, #b91c1c)"
                : "var(--color-text-primary)",
            backgroundColor:
              banner.kind === "success"
                ? "var(--color-success-subtle, #f0fdf4)"
                : "var(--color-background, #ffffff)",
          }}
        >
          {banner.message}
        </div>
      )}

      {/* Free tier — Pro gate */}
      {user.subscriptionTier === "FREE" && (
        <ProGatePattern
          headline="Gmail auto-tracking is a Pro feature"
          description="Connect your inbox to let FollowCV update listing status when companies reply. Available on Pro."
        />
      )}

      {/* Pro + already connected */}
      {user.subscriptionTier === "PRO" && gmailToken && (
        <section
          className="space-y-4 rounded-md border p-5"
          style={{
            borderColor: "var(--color-border, #e2e8f0)",
            backgroundColor: "var(--color-brand-subtle, #eef2ff)",
          }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={18}
              aria-hidden
              style={{ color: "var(--color-success, #16a34a)" }}
            />
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Gmail connected
            </h2>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt style={{ color: "var(--color-text-secondary)" }}>Account</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>
              {gmailToken.connectedEmail}
            </dd>
            <dt style={{ color: "var(--color-text-secondary)" }}>Connected</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>
              {formatDate(gmailToken.createdAt)}
            </dd>
          </dl>
          <DisconnectGmailButton />
        </section>
      )}

      {/* Pro + not yet connected — consent ceremony */}
      {user.subscriptionTier === "PRO" && !gmailToken && (
        <section className="space-y-6">
          {/* Lead with what is *not* read (UX spec) */}
          <div
            className="rounded-md border p-5"
            style={{
              borderColor: "var(--color-border, #e2e8f0)",
              backgroundColor: "var(--color-background, #ffffff)",
            }}
          >
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              What we never read
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                "The body of any email — content stays in your inbox",
                "Email attachments",
                "Your contacts",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <EyeOff
                    size={14}
                    aria-hidden
                    className="mt-0.5"
                    style={{ color: "var(--color-text-tertiary)" }}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Then what we do read */}
          <div
            className="rounded-md border p-5"
            style={{
              borderColor: "var(--color-border, #e2e8f0)",
              backgroundColor: "var(--color-background, #ffffff)",
            }}
          >
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              What we read
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li
                className="flex items-start gap-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <Eye
                  size={14}
                  aria-hidden
                  className="mt-0.5"
                  style={{ color: "var(--color-brand)" }}
                />
                <span>
                  The sender domain of recent messages — to match against
                  companies you&apos;ve added to your board.
                </span>
              </li>
            </ul>
            <p
              className="mt-3 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              When a company whose domain matches one of your listings replies,
              FollowCV updates the listing&apos;s vitality state automatically.
              You can disconnect at any time.
            </p>
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Scope requested: <code>gmail.readonly</code>
            </p>
          </div>

          <ConnectGmailButton />
        </section>
      )}
    </div>
  )
}
