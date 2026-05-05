import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { VitalityBadge } from "@/components/vitality/VitalityBadge"
import { explainVitalityState } from "@/lib/services/vitality-state-machine"
import type { VitalityState, ApplicationStatus } from "@/generated/prisma/client"

function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : ""
  if (min && max) return `${sym}${fmt(min)}–${sym}${fmt(max)}`
  if (min) return `from ${sym}${fmt(min)}`
  return `up to ${sym}${fmt(max!)}`
}

export default async function ListingDetailPage({ params }: { params: Promise<{ listingId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { listingId } = await params

  const listing = await prisma.jobListing.findFirst({
    where: { id: listingId, userId: session.user.id, deletedAt: null },
    include: {
      application: true,
      auditLogs: { orderBy: { computedAt: "desc" }, take: 1 },
    },
  })

  if (!listing) notFound()

  const gmailSignalLog = await prisma.auditLog.findFirst({
    where: { listingId: listing.id, source: "GMAIL_SIGNAL" },
    orderBy: { computedAt: "desc" },
  })

  const explanation = explainVitalityState({
    postedAt: listing.postedAt,
    closingDate: listing.closingDate,
    application: listing.application
      ? { appliedAt: listing.application.appliedAt, status: listing.application.status as ApplicationStatus }
      : null,
    gmailSignalAt: gmailSignalLog?.computedAt ?? null,
    overrideState: listing.overrideState as VitalityState | null,
    overrideSource: listing.overrideSource,
    isArchived: listing.archived,
    now: new Date(),
  })

  const salary = formatSalary(listing.salaryMin, listing.salaryMax, listing.salaryCurrency)

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      {/* Back link */}
      <Link
        href="/board"
        className="inline-flex items-center gap-1 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        ← Back to board
      </Link>

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {listing.title}
          </h1>
          <div className="flex-shrink-0 mt-0.5">
            <VitalityBadge state={listing.vitalityState as VitalityState} />
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {listing.company}
          {listing.location ? ` · ${listing.location}` : ""}
        </p>
      </div>

      {/* Key details grid */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        {salary && (
          <>
            <dt style={{ color: "var(--color-text-secondary)" }}>Salary</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>{salary}</dd>
          </>
        )}
        {listing.postedAt && (
          <>
            <dt style={{ color: "var(--color-text-secondary)" }}>Posted</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>
              {new Date(listing.postedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </dd>
          </>
        )}
        {listing.closingDate && (
          <>
            <dt style={{ color: "var(--color-text-secondary)" }}>Closes</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>
              {new Date(listing.closingDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </dd>
          </>
        )}
        <dt style={{ color: "var(--color-text-secondary)" }}>Added</dt>
        <dd style={{ color: "var(--color-text-primary)" }}>
          {new Date(listing.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </dd>
        <dt style={{ color: "var(--color-text-secondary)" }}>Source</dt>
        <dd style={{ color: "var(--color-text-primary)" }}>
          {listing.importSource === "URL_IMPORT" ? "Auto-imported from URL" : "Added manually"}
        </dd>
        {listing.sourceUrl && (
          <>
            <dt style={{ color: "var(--color-text-secondary)" }}>Listing URL</dt>
            <dd>
              <a
                href={listing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline truncate block"
                style={{ color: "var(--color-brand)" }}
              >
                {listing.sourceUrl}
              </a>
            </dd>
          </>
        )}
      </dl>

      {/* Notes */}
      {listing.notes && (
        <div className="space-y-1">
          <h2 className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Notes</h2>
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-primary)" }}>
            {listing.notes}
          </p>
        </div>
      )}

      {/* State derivation */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          How this state was determined
        </h2>
        <ol className="space-y-1.5">
          {explanation.map((step) => {
            const isFired = step.outcome === "fired"
            const isSkipped = step.outcome === "skipped"
            return (
              <li
                key={step.rule}
                className={`flex items-start gap-2.5 rounded-md px-3 py-2 text-sm ${isFired ? "ring-1" : ""}`}
                style={{
                  backgroundColor: isFired
                    ? "var(--color-vitality-hot-bg, #fef3c7)"
                    : isSkipped
                    ? "transparent"
                    : "transparent",
                  borderColor: isFired ? "var(--color-vitality-hot-text, #d97706)" : undefined,
                  opacity: isSkipped ? 0.5 : 1,
                }}
              >
                <span
                  className="flex-shrink-0 text-xs w-4 mt-0.5 font-mono"
                  style={{ color: isFired ? "var(--color-vitality-hot-text, #d97706)" : "var(--color-text-tertiary)" }}
                  aria-hidden="true"
                >
                  {isFired ? "→" : isSkipped ? "–" : "✓"}
                </span>
                <div className="min-w-0">
                  <span
                    className="font-medium"
                    style={{ color: isFired ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                  >
                    {step.label}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}> — {step.detail}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Application section */}
      {listing.application ? (
        <div className="space-y-2 border-t pt-6">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Application</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt style={{ color: "var(--color-text-secondary)" }}>Status</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>{listing.application.status}</dd>
            <dt style={{ color: "var(--color-text-secondary)" }}>Applied</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>
              {new Date(listing.application.appliedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </dd>
          </dl>
        </div>
      ) : (
        <div className="border-t pt-6">
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No application recorded yet.{" "}
            <span style={{ color: "var(--color-text-tertiary)" }}>
              (Apply action available in a future update)
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
