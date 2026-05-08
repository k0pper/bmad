import { prisma } from "@/lib/db"
import {
  getSignalCheckpoint,
  refreshAccessToken,
  setLastSignalCheckAt,
} from "./gmail-token-service"
import { revokeGmailAccess } from "@/lib/account/service"

/**
 * Per-user Gmail signal processor (Story 6.2).
 *
 * For one Pro user with a connected Gmail account:
 *   1. Refresh the access token (HTTP 400 + invalid_grant → revoke + return).
 *   2. Enumerate active listings with a non-null companyDomain AND an
 *      Application — distinct-by-domain → at most N Gmail calls per user.
 *   3. For each domain, query `messages.list` with `q=from:<domain>+after:<floorSeconds>`
 *      and `maxResults=1`. We read only `resultSizeEstimate` (or `messages.length`).
 *      **Privacy hard rule:** message bodies/IDs are never fetched, persisted, or logged.
 *   4. On match, write one `AuditLog` row per affected listing with
 *      `source: GMAIL_SIGNAL`. The existing `vitality-recompute` job picks
 *      these up and Rule 5 in `vitality-state-machine.ts` transitions to
 *      `IN_DIALOGUE`. Story 6.2 never writes `vitalityState` directly.
 *   5. Update `GmailToken.lastSignalCheckAt` to `now` after the loop.
 *
 * Returns a structured result per user — the caller (the job handler)
 * accumulates these without aborting the batch on per-user failures.
 */

const GMAIL_MESSAGES_LIST_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages"

export type ProcessorResult = {
  status: "ok" | "revoked" | "no-token"
  checked: number
  found: number
  /** Number of domains for which the Gmail API call failed. The watermark
   * is still advanced on these — we accept missing one tick's signals to
   * avoid duplicating audit rows for the domains that did succeed. */
  errors?: number
}

type ListingForDomainCheck = {
  id: string
  companyDomain: string
  application: { appliedAt: Date } | null
}

export async function processGmailSignalsForUser(
  userId: string,
  now: Date,
): Promise<ProcessorResult> {
  // ── 1. Resolve the watermark floor ─────────────────────────────────────
  const checkpoint = await getSignalCheckpoint(userId)
  if (!checkpoint) {
    // The user disconnected (or never connected) — nothing to do.
    return { status: "no-token", checked: 0, found: 0 }
  }
  const floorMs = (
    checkpoint.lastSignalCheckAt ?? checkpoint.createdAt
  ).getTime()
  const floorSeconds = Math.floor(floorMs / 1000)

  // ── 2. Refresh access token ────────────────────────────────────────────
  const refresh = await refreshAccessToken(userId, now)
  if (refresh.status === "revoked") {
    // Token was invalidated by the user (or admin). Clean up the row.
    await revokeGmailAccess(userId)
    return { status: "revoked", checked: 0, found: 0 }
  }
  const accessToken = refresh.accessToken

  // ── 3. Enumerate eligible listings ─────────────────────────────────────
  const listings = (await prisma.jobListing.findMany({
    where: {
      userId,
      archived: false,
      deletedAt: null,
      companyDomain: { not: null },
      application: { isNot: null },
    },
    select: {
      id: true,
      companyDomain: true,
      application: { select: { appliedAt: true } },
    },
  })) as ListingForDomainCheck[]

  if (listings.length === 0) {
    await setLastSignalCheckAt(userId, now)
    return { status: "ok", checked: 0, found: 0 }
  }

  // Group by companyDomain — distinct-by-domain means N domains → N Gmail calls.
  const byDomain = new Map<string, ListingForDomainCheck[]>()
  for (const listing of listings) {
    const existing = byDomain.get(listing.companyDomain) ?? []
    existing.push(listing)
    byDomain.set(listing.companyDomain, existing)
  }

  // ── 4. Query Gmail per domain ──────────────────────────────────────────
  // Each domain is wrapped in try/catch so one transient Gmail 5xx for
  // company A doesn't strand the user's whole tick — we'd otherwise fail
  // to advance the watermark and re-process domain B (already audited)
  // on the next tick, double-writing audit rows.
  let found = 0
  let errors = 0
  for (const [domain, listingsForDomain] of byDomain) {
    let hasMatch: boolean
    try {
      hasMatch = await checkDomainHasNewMail(
        accessToken,
        domain,
        floorSeconds,
      )
    } catch (err) {
      errors++
      console.error(
        `[gmail-signal] domain check failed for user=${userId} (${(err as Error).message})`,
      )
      continue
    }
    if (!hasMatch) continue

    // Write one audit log per listing where the application predates `now`.
    // (A signal "found now" can only confirm an apply that already happened.)
    for (const listing of listingsForDomain) {
      if (!listing.application) continue
      if (listing.application.appliedAt >= now) continue

      await prisma.auditLog.create({
        data: {
          source: "GMAIL_SIGNAL",
          userId,
          listingId: listing.id,
          computedAt: now,
        },
      })
      found++
    }
  }

  // ── 5. Update the watermark ────────────────────────────────────────────
  // If every domain we tried failed, don't advance — odds are the failure
  // is global (transient invalid token, Gmail outage) and advancing would
  // permanently skip every signal that arrived during this window. The
  // per-domain `try/catch` above is for the "company A 5xx, company B
  // succeeds" case, not for "everything failed".
  if (errors === 0 || errors < byDomain.size) {
    await setLastSignalCheckAt(userId, now)
  }

  return { status: "ok", checked: byDomain.size, found, errors }
}

async function checkDomainHasNewMail(
  accessToken: string,
  domain: string,
  floorSeconds: number,
): Promise<boolean> {
  // `q=from:<domain> after:<unix-seconds>` is Gmail search syntax; `from:`
  // matches by domain when no @ is present. `maxResults=1` limits work; we
  // only care whether at least one matching message exists.
  const url = new URL(GMAIL_MESSAGES_LIST_URL)
  url.searchParams.set("q", `from:${domain} after:${floorSeconds}`)
  url.searchParams.set("maxResults", "1")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>")
    throw new Error(
      `Gmail messages.list failed for domain ${domain}: HTTP ${res.status}: ${text.slice(0, 200)}`,
    )
  }

  const json = (await res.json()) as {
    messages?: { id: string; threadId: string }[]
    resultSizeEstimate?: number
  }

  // Privacy: read only the size — never inspect/log the message IDs.
  if (typeof json.resultSizeEstimate === "number") {
    return json.resultSizeEstimate > 0
  }
  return Array.isArray(json.messages) && json.messages.length > 0
}
