import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { VitalityBadge } from "@/components/vitality/VitalityBadge"
import { DetailAccordion } from "@/components/listing/DetailAccordion"
import { VitalityExplanation } from "@/components/listing/VitalityExplanation"
import { explainVitalityState, computeVitalityState } from "@/lib/services/vitality-state-machine"
import type { VitalityState, ApplicationStatus } from "@/generated/prisma/client"

function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : ""
  if (min && max) return `${sym}${fmt(min)}–${sym}${fmt(max)}`
  if (min) return `from ${sym}${fmt(min)}`
  return `up to ${sym}${fmt(max!)}`
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
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

  const now = new Date()
  const inputs = {
    postedAt: listing.postedAt,
    closingDate: listing.closingDate,
    application: listing.application
      ? { appliedAt: listing.application.appliedAt, status: listing.application.status as ApplicationStatus }
      : null,
    gmailSignalAt: gmailSignalLog?.computedAt ?? null,
    overrideState: listing.overrideState as VitalityState | null,
    overrideSource: listing.overrideSource,
    isArchived: listing.archived,
    now,
  }

  const explanation = explainVitalityState(inputs)
  const freshState = computeVitalityState(inputs)

  let displayState = listing.vitalityState as VitalityState
  if (freshState !== null && freshState !== listing.vitalityState) {
    await prisma.jobListing.update({
      where: { id: listing.id },
      data: { vitalityState: freshState, stateChangedAt: now, lastComputedAt: now },
    })
    try {
      await prisma.auditLog.create({
        data: { source: "SYSTEM_RECOMPUTE", userId: session.user.id, listingId: listing.id, newState: freshState, computedAt: now },
      })
    } catch { /* non-critical */ }
    displayState = freshState
  }

  const salary = formatSalary(listing.salaryMin, listing.salaryMax, listing.salaryCurrency)

  // Build accordion sections
  const accordionSections = [
    {
      id: "vitality",
      label: "Why this state?",
      children: (
        <VitalityExplanation
          explanation={explanation}
          finalState={displayState}
        />
      ),
    },
    ...(listing.notes
      ? [
          {
            id: "notes",
            label: "Notes",
            children: (
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                {listing.notes}
              </p>
            ),
          },
        ]
      : []),
    {
      id: "application",
      label: "Application",
      children: listing.application ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt style={{ color: "var(--color-text-secondary)" }}>Status</dt>
          <dd style={{ color: "var(--color-text-primary)" }}>{listing.application.status}</dd>
          <dt style={{ color: "var(--color-text-secondary)" }}>Applied</dt>
          <dd style={{ color: "var(--color-text-primary)" }}>
            {formatDate(new Date(listing.application.appliedAt))}
          </dd>
        </dl>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No application recorded yet.{" "}
          <span style={{ color: "var(--color-text-tertiary)" }}>
            Apply action coming in a future update.
          </span>
        </p>
      ),
    },
  ]

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      {/* Back link */}
      <Link
        href="/board"
        className="inline-flex items-center gap-1 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        ← Back to board
      </Link>

      {/* Core info — always visible */}
      <div className="space-y-4">
        {/* Title + badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-xl font-semibold leading-snug" style={{ color: "var(--color-text-primary)" }}>
              {listing.title}
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {listing.company}
              {listing.location ? ` · ${listing.location}` : ""}
            </p>
          </div>
          <div className="flex-shrink-0 mt-0.5">
            <VitalityBadge state={displayState} />
          </div>
        </div>

        {/* Key details */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm pt-1">
          {salary && (
            <>
              <dt style={{ color: "var(--color-text-secondary)" }}>Salary</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>{salary}</dd>
            </>
          )}
          {listing.postedAt && (
            <>
              <dt style={{ color: "var(--color-text-secondary)" }}>Posted</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>{formatDate(new Date(listing.postedAt))}</dd>
            </>
          )}
          {listing.closingDate && (
            <>
              <dt style={{ color: "var(--color-text-secondary)" }}>Closes</dt>
              <dd style={{ color: "var(--color-text-primary)" }}>{formatDate(new Date(listing.closingDate))}</dd>
            </>
          )}
          <dt style={{ color: "var(--color-text-secondary)" }}>Added</dt>
          <dd style={{ color: "var(--color-text-primary)" }}>{formatDate(new Date(listing.createdAt))}</dd>
          {listing.sourceUrl && (
            <>
              <dt style={{ color: "var(--color-text-secondary)" }}>Listing URL</dt>
              <dd className="min-w-0">
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
      </div>

      {/* Expandable sections */}
      <div className="border-t" style={{ borderColor: "var(--color-border, #e2e8f0)" }}>
        <DetailAccordion sections={accordionSections} defaultOpen={["vitality"]} />
      </div>
    </div>
  )
}
