import crypto from "node:crypto"
import { prisma } from "@/lib/db"

/**
 * Gmail OAuth token storage and crypto.
 *
 * Refresh tokens are encrypted at rest with AES-256-GCM (architecture lines
 * 168–173). The access token is short-lived (~1h) and stored plaintext —
 * Story 6.2's pg-boss job re-fetches it from the refresh token on expiry.
 *
 * Single-blob ciphertext format: `base64(12-byte IV || ciphertext || 16-byte authTag)`.
 *
 * This module is the only legitimate site that touches the `GmailToken`
 * table. The disconnect path goes via `src/lib/account/service.ts` →
 * `revokeGmailAccess` (legacy entry point), which directly deletes by
 * userId. No other module should call `prisma.gmailToken.*` directly.
 */

const KEY_ENV = "GMAIL_TOKEN_ENCRYPTION_KEY"
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Read and validate the AES-256-GCM key from `GMAIL_TOKEN_ENCRYPTION_KEY`.
 * The key must be exactly 64 hex characters (32 bytes / 256 bits).
 *
 * Validated lazily on every call — the read is cheap and tests that change
 * the env between cases need fresh validation.
 */
export function getGmailEncryptionKey(): Buffer {
  const hex = process.env[KEY_ENV]
  if (!hex) {
    throw new Error(
      `${KEY_ENV} is not set. Generate with: openssl rand -hex 32`,
    )
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      `${KEY_ENV} must be exactly 64 hex characters (32 bytes). Got ${hex.length} characters.`,
    )
  }
  return Buffer.from(hex, "hex")
}

export function encryptRefreshToken(plaintext: string): string {
  const key = getGmailEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64")
}

export function decryptRefreshToken(encrypted: string): string {
  const key = getGmailEncryptionKey()
  const buf = Buffer.from(encrypted, "base64")
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext: too short")
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return plaintext.toString("utf8")
}

export type GmailTokenInput = {
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: Date
  connectedEmail: string
}

/**
 * Persist a Gmail token for a user. Encrypts the refresh token and upserts
 * via the Neon-HTTP-safe `findFirst → update | create` pattern (no
 * `prisma.upsert`, no `*Many`, no `$transaction`).
 */
export async function setGmailToken(input: GmailTokenInput): Promise<void> {
  const encryptedRefresh = encryptRefreshToken(input.refreshToken)
  const existing = await prisma.gmailToken.findFirst({
    where: { userId: input.userId },
    select: { id: true },
  })
  if (existing) {
    await prisma.gmailToken.update({
      where: { id: existing.id },
      data: {
        accessToken: input.accessToken,
        refreshToken: encryptedRefresh,
        expiresAt: input.expiresAt,
        connectedEmail: input.connectedEmail,
      },
    })
    return
  }
  await prisma.gmailToken.create({
    data: {
      userId: input.userId,
      accessToken: input.accessToken,
      refreshToken: encryptedRefresh,
      expiresAt: input.expiresAt,
      connectedEmail: input.connectedEmail,
    },
  })
}

export type GmailTokenRecord = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  connectedEmail: string
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

export type RefreshAccessTokenResult =
  | { status: "ok"; accessToken: string; expiresAt: Date }
  | { status: "revoked" }

/**
 * Refresh a user's Gmail access token using the stored refresh token.
 *
 * Calls Google's token endpoint with `grant_type=refresh_token`. On success,
 * updates the row with the new `accessToken` and `expiresAt` (refresh token
 * stays the same — Google doesn't rotate refresh tokens by default for this
 * client). On HTTP 400 + `error: 'invalid_grant'` returns
 * `{ status: "revoked" }`; the caller decides what to do (Story 6.2's
 * processor calls `revokeGmailAccess`). All other failures throw.
 */
export async function refreshAccessToken(
  userId: string,
  now: Date,
): Promise<RefreshAccessTokenResult> {
  const token = await getGmailToken(userId)
  if (!token) throw new Error(`No GmailToken row for userId ${userId}`)

  const clientId = process.env.AUTH_GOOGLE_ID
  const clientSecret = process.env.AUTH_GOOGLE_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET must be set for token refresh",
    )
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    if (res.status === 400) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
      }
      if (body.error === "invalid_grant") {
        return { status: "revoked" }
      }
    }
    const text = await res.text().catch(() => "<no body>")
    throw new Error(`Token refresh failed: HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (!json.access_token) {
    throw new Error("Token refresh response missing access_token")
  }
  const expiresAt = new Date(now.getTime() + (json.expires_in ?? 3600) * 1000)

  // Single-row update via findFirst → update (Neon HTTP-safe).
  const existing = await prisma.gmailToken.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (!existing) {
    // Race: row was deleted between getGmailToken and now. Treat as revoked.
    return { status: "revoked" }
  }
  await prisma.gmailToken.update({
    where: { id: existing.id },
    data: {
      accessToken: json.access_token,
      expiresAt,
    },
  })

  return { status: "ok", accessToken: json.access_token, expiresAt }
}

/**
 * Update the gmail-ingest-signals watermark for a user.
 * Single-row update via the Neon-HTTP-safe `findFirst → update` pattern.
 * No-op if the row no longer exists (the user disconnected mid-tick).
 */
export async function setLastSignalCheckAt(
  userId: string,
  when: Date,
): Promise<void> {
  const existing = await prisma.gmailToken.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (!existing) return
  await prisma.gmailToken.update({
    where: { id: existing.id },
    data: { lastSignalCheckAt: when },
  })
}

/**
 * Read the watermark + createdAt floor used by gmail-ingest-signals to
 * compute the `after:` parameter on Gmail's messages.list call. Returns
 * null when no row exists for the user.
 */
export async function getSignalCheckpoint(
  userId: string,
): Promise<{ lastSignalCheckAt: Date | null; createdAt: Date } | null> {
  const row = await prisma.gmailToken.findUnique({
    where: { userId },
    select: { lastSignalCheckAt: true, createdAt: true },
  })
  if (!row) return null
  return { lastSignalCheckAt: row.lastSignalCheckAt, createdAt: row.createdAt }
}

/**
 * Read a user's Gmail token. The returned `refreshToken` is decrypted —
 * callers receive the plaintext value usable against the Google token
 * endpoint.
 */
export async function getGmailToken(
  userId: string,
): Promise<GmailTokenRecord | null> {
  const row = await prisma.gmailToken.findUnique({
    where: { userId },
    select: {
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      connectedEmail: true,
    },
  })
  if (!row) return null
  return {
    accessToken: row.accessToken,
    refreshToken: decryptRefreshToken(row.refreshToken),
    expiresAt: row.expiresAt,
    connectedEmail: row.connectedEmail,
  }
}
