import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { VitalityBadge } from "@/components/vitality/VitalityBadge"
import { DetailAccordion } from "@/components/listing/DetailAccordion"
import { VitalityExplanation } from "@/components/listing/VitalityExplanation"
import { ListingEditForm } from "@/components/listing/ListingEditForm"
import { ListingArchiveButton } from "@/components/listing/ListingArchiveButton"
import { ApplicationStatusSelect } from "@/components/application/ApplicationStatusSelect"
import { ListingNotesField } from "@/components/listing/ListingNotesField"
import { ApplicationNotesField } from "@/components/application/ApplicationNotesField"
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
      application: {
        include: {
          cvSnapshot: {
            select: {
              id: true,
              cvVersion: { select: { name: true } },
            },
          },
        },
      },
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
  } else if (freshState !== null) {
    // Even if the state didn't change, bump lastComputedAt so the board
    // page's "stale" indicator doesn't keep flagging this listing — we
    // just verified it. No audit log: there was no transition to record.
    await prisma.jobListing.update({
      where: { id: listing.id },
      data: { lastComputedAt: now },
    })
  }

  const salary = formatSalary(listing.salaryMin, listing.salaryMax, listing.salaryCurrency)

  // Section order is intentional: the things the user came here to act on
  // (application status, personal notes, listing fields) sit at the top;
  // the vitality calculation explainer is informational and lives at the
  // bottom. The application section is opened by default if there is an
  // application — otherwise the notes section.
  const accordionSections = [
    {
      id: "application",
      label: "Application",
      children: listing.application ? (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <dt style={{ color: "var(--color-text-secondary)" }}>Status</dt>
            <dd>
              <ApplicationStatusSelect
                listingId={listing.id}
                initialStatus={listing.application.status as ApplicationStatus}
              />
            </dd>
            <dt style={{ color: "var(--color-text-secondary)" }}>Applied</dt>
            <dd style={{ color: "var(--color-text-primary)" }}>
              {formatDate(new Date(listing.application.appliedAt))}
            </dd>
            {listing.application.cvSnapshot && (
              <>
                <dt style={{ color: "var(--color-text-secondary)" }}>
                  CV sent
                </dt>
                <dd style={{ color: "var(--color-text-primary)" }}>
                  <span className="mr-2">
                    {listing.application.cvSnapshot.cvVersion.name}
                  </span>
                  <a
                    href={`/api/cv/snapshot/${listing.application.cvSnapshot.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                    style={{ color: "var(--color-brand)" }}
                  >
                    View
                  </a>
                  <span
                    className="mx-1.5"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    ·
                  </span>
                  <a
                    href={`/api/cv/snapshot/${listing.application.cvSnapshot.id}/file?download=1`}
                    className="text-xs underline"
                    style={{ color: "var(--color-brand)" }}
                  >
                    Download
                  </a>
                </dd>
              </>
            )}
          </dl>
          <div>
            <p
              className="mb-1.5 text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Application notes
            </p>
            <ApplicationNotesField
              listingId={listing.id}
              initialNotes={listing.application.notes}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No application recorded yet. Use the{" "}
          <Link
            href="/board"
            className="underline"
            style={{ color: "var(--color-brand)" }}
          >
            Apply
          </Link>{" "}
          action on this listing&apos;s board row to record one.
        </p>
      ),
    },
    {
      id: "notes",
      label: "Notes",
      children: (
        <ListingNotesField
          listingId={listing.id}
          initialNotes={listing.notes}
        />
      ),
    },
    {
      id: "edit",
      label: "Edit listing details",
      children: (
        <ListingEditForm
          listingId={listing.id}
          initialValues={{
            title: listing.title,
            company: listing.company,
            companyDomain: listing.companyDomain,
            location: listing.location,
            salaryMin: listing.salaryMin,
            salaryMax: listing.salaryMax,
            salaryCurrency: listing.salaryCurrency,
            closingDate: listing.closingDate,
          }}
        />
      ),
    },
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
  ]

  // Open the application section by default when one exists, otherwise the
  // notes section — both are user-actionable. The vitality explainer stays
  // collapsed; users only open it when they're confused about a state.
  const defaultOpenSections = listing.application ? ["application"] : ["notes"]

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      {/* Back link */}
      <Link
        href="/board"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 -ml-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-brand-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
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
            <VitalityBadge state={displayState} isOverridden={listing.overrideSource === "USER"} />
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
        <DetailAccordion sections={accordionSections} defaultOpen={defaultOpenSections} />
      </div>

      <div className="pt-4">
        <ListingArchiveButton listingId={listing.id} archived={listing.archived} />
      </div>
    </div>
  )
}
