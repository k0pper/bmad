import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import crypto from "node:crypto"

vi.mock("@/lib/db", () => ({
  prisma: {
    gmailToken: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import {
  decryptRefreshToken,
  encryptRefreshToken,
  getGmailEncryptionKey,
  getGmailToken,
  getSignalCheckpoint,
  refreshAccessToken,
  setGmailToken,
  setLastSignalCheckAt,
} from "./gmail-token-service"
import { prisma } from "@/lib/db"

type MockPrisma = {
  gmailToken: {
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}

const mock = prisma as unknown as MockPrisma

const VALID_KEY = "a".repeat(64) // 64 hex chars = 32 bytes
const ALT_KEY = "b".repeat(64)

const originalKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = VALID_KEY
})

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  } else {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = originalKey
  }
})

describe("getGmailEncryptionKey", () => {
  it("throws when GMAIL_TOKEN_ENCRYPTION_KEY is missing", () => {
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY
    expect(() => getGmailEncryptionKey()).toThrow(/not set/i)
  })

  it("throws when the key is not 64 hex chars", () => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "short"
    expect(() => getGmailEncryptionKey()).toThrow(/64 hex characters/i)
  })

  it("throws when the key contains non-hex characters", () => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "z".repeat(64)
    expect(() => getGmailEncryptionKey()).toThrow(/64 hex characters/i)
  })

  it("returns a 32-byte buffer for a valid key", () => {
    const key = getGmailEncryptionKey()
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
  })
})

describe("encrypt/decrypt round trip", () => {
  it("round-trips a refresh token through encrypt → decrypt", () => {
    const plaintext = "1//abc123-google-refresh-token-blob"
    const ciphertext = encryptRefreshToken(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decryptRefreshToken(ciphertext)).toBe(plaintext)
  })

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const plaintext = "1//token"
    const a = encryptRefreshToken(plaintext)
    const b = encryptRefreshToken(plaintext)
    expect(a).not.toBe(b)
    expect(decryptRefreshToken(a)).toBe(plaintext)
    expect(decryptRefreshToken(b)).toBe(plaintext)
  })

  it("throws when ciphertext is tampered with", () => {
    const ciphertext = encryptRefreshToken("token")
    const buf = Buffer.from(ciphertext, "base64")
    // Flip one byte in the middle (ciphertext region) so the auth tag fails.
    buf[buf.length - 20] ^= 0xff
    const tampered = buf.toString("base64")
    expect(() => decryptRefreshToken(tampered)).toThrow()
  })

  it("throws when decrypted with the wrong key", () => {
    const ciphertext = encryptRefreshToken("token")
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = ALT_KEY
    expect(() => decryptRefreshToken(ciphertext)).toThrow()
  })

  it("throws when ciphertext is too short to contain IV + auth tag", () => {
    const tooShort = Buffer.alloc(10).toString("base64")
    expect(() => decryptRefreshToken(tooShort)).toThrow(/too short/i)
  })
})

describe("setGmailToken", () => {
  const baseInput = {
    userId: "user-1",
    accessToken: "ya29.access-token",
    refreshToken: "1//refresh-token",
    expiresAt: new Date("2026-06-01T00:00:00Z"),
    connectedEmail: "marcus@example.com",
  }

  it("creates a new row when none exists, with the refresh token encrypted", async () => {
    mock.gmailToken.findFirst.mockResolvedValue(null)

    await setGmailToken(baseInput)

    expect(mock.gmailToken.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    })
    expect(mock.gmailToken.update).not.toHaveBeenCalled()
    expect(mock.gmailToken.create).toHaveBeenCalledTimes(1)
    const createArg = mock.gmailToken.create.mock.calls[0][0]
    expect(createArg.data.userId).toBe("user-1")
    expect(createArg.data.accessToken).toBe("ya29.access-token")
    expect(createArg.data.expiresAt).toEqual(baseInput.expiresAt)
    expect(createArg.data.connectedEmail).toBe("marcus@example.com")
    // Refresh token must be encrypted, not plaintext
    expect(createArg.data.refreshToken).not.toBe(baseInput.refreshToken)
    expect(decryptRefreshToken(createArg.data.refreshToken)).toBe(
      baseInput.refreshToken,
    )
  })

  it("updates the existing row when one exists", async () => {
    mock.gmailToken.findFirst.mockResolvedValue({ id: "tok-1" })

    await setGmailToken(baseInput)

    expect(mock.gmailToken.create).not.toHaveBeenCalled()
    expect(mock.gmailToken.update).toHaveBeenCalledTimes(1)
    const updateArg = mock.gmailToken.update.mock.calls[0][0]
    expect(updateArg.where).toEqual({ id: "tok-1" })
    expect(updateArg.data.accessToken).toBe("ya29.access-token")
    expect(decryptRefreshToken(updateArg.data.refreshToken)).toBe(
      baseInput.refreshToken,
    )
  })
})

describe("getGmailToken", () => {
  it("returns null when no row exists", async () => {
    mock.gmailToken.findUnique.mockResolvedValue(null)
    const result = await getGmailToken("user-1")
    expect(result).toBeNull()
  })

  it("returns the row with the refresh token decrypted", async () => {
    const expiresAt = new Date("2026-06-01T00:00:00Z")
    const encryptedRefresh = encryptRefreshToken("1//plaintext-refresh")
    mock.gmailToken.findUnique.mockResolvedValue({
      accessToken: "ya29.access",
      refreshToken: encryptedRefresh,
      expiresAt,
      connectedEmail: "marcus@example.com",
    })

    const result = await getGmailToken("user-1")

    expect(mock.gmailToken.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
        connectedEmail: true,
      },
    })
    expect(result).toEqual({
      accessToken: "ya29.access",
      refreshToken: "1//plaintext-refresh",
      expiresAt,
      connectedEmail: "marcus@example.com",
    })
  })
})

describe("refreshAccessToken", () => {
  const NOW = new Date("2026-05-08T12:00:00Z")
  const ORIGINAL_GOOGLE_ID = process.env.AUTH_GOOGLE_ID
  const ORIGINAL_GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET

  beforeEach(() => {
    // Encryption key is set by the outer beforeEach; safe to encrypt here.
    const encrypted = encryptRefreshToken("1//live-refresh")
    process.env.AUTH_GOOGLE_ID = "test-client.apps.googleusercontent.com"
    process.env.AUTH_GOOGLE_SECRET = "test-client-secret"
    mock.gmailToken.findUnique.mockResolvedValue({
      accessToken: "ya29.old",
      refreshToken: encrypted,
      expiresAt: new Date("2026-05-08T11:00:00Z"),
      connectedEmail: "marcus@example.com",
    })
    mock.gmailToken.findFirst.mockResolvedValue({ id: "tok-1" })
  })

  afterEach(() => {
    if (ORIGINAL_GOOGLE_ID === undefined) delete process.env.AUTH_GOOGLE_ID
    else process.env.AUTH_GOOGLE_ID = ORIGINAL_GOOGLE_ID
    if (ORIGINAL_GOOGLE_SECRET === undefined) delete process.env.AUTH_GOOGLE_SECRET
    else process.env.AUTH_GOOGLE_SECRET = ORIGINAL_GOOGLE_SECRET
    vi.restoreAllMocks()
  })

  it("happy path: POSTs refresh_token, persists new access token + expiresAt, returns ok", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "ya29.new", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    const result = await refreshAccessToken("user-1", NOW)

    expect(result).toEqual({
      status: "ok",
      accessToken: "ya29.new",
      expiresAt: new Date(NOW.getTime() + 3600 * 1000),
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe("https://oauth2.googleapis.com/token")
    const body = (init?.body as URLSearchParams) ?? new URLSearchParams()
    expect(body.get("grant_type")).toBe("refresh_token")
    expect(body.get("refresh_token")).toBe("1//live-refresh")
    expect(body.get("client_id")).toBe("test-client.apps.googleusercontent.com")
    expect(body.get("client_secret")).toBe("test-client-secret")

    expect(mock.gmailToken.update).toHaveBeenCalledWith({
      where: { id: "tok-1" },
      data: {
        accessToken: "ya29.new",
        expiresAt: new Date(NOW.getTime() + 3600 * 1000),
      },
    })
  })

  it("returns { status: 'revoked' } on HTTP 400 + invalid_grant", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    )

    const result = await refreshAccessToken("user-1", NOW)

    expect(result).toEqual({ status: "revoked" })
    expect(mock.gmailToken.update).not.toHaveBeenCalled()
  })

  it("throws on HTTP 400 with a different error code", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_request" }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    )

    await expect(refreshAccessToken("user-1", NOW)).rejects.toThrow(/HTTP 400/)
  })

  it("throws on 5xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("upstream", { status: 503 }),
    )
    await expect(refreshAccessToken("user-1", NOW)).rejects.toThrow(/HTTP 503/)
  })

  it("throws on 200 OK with no access_token in body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    await expect(refreshAccessToken("user-1", NOW)).rejects.toThrow(/missing access_token/)
  })

  it("returns revoked when the GmailToken row vanishes between read and write (race)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "ya29.new", expires_in: 3600 }),
        { status: 200 },
      ),
    )
    mock.gmailToken.findFirst.mockResolvedValue(null)

    const result = await refreshAccessToken("user-1", NOW)
    expect(result).toEqual({ status: "revoked" })
    expect(mock.gmailToken.update).not.toHaveBeenCalled()
  })

  it("throws when no GmailToken exists for the user", async () => {
    mock.gmailToken.findUnique.mockResolvedValue(null)
    await expect(refreshAccessToken("user-1", NOW)).rejects.toThrow(/No GmailToken row/)
  })

  it("throws when AUTH_GOOGLE_ID is missing", async () => {
    delete process.env.AUTH_GOOGLE_ID
    await expect(refreshAccessToken("user-1", NOW)).rejects.toThrow(
      /AUTH_GOOGLE_ID/,
    )
  })
})

describe("setLastSignalCheckAt", () => {
  it("updates the watermark via findFirst → update", async () => {
    mock.gmailToken.findFirst.mockResolvedValue({ id: "tok-1" })
    const when = new Date("2026-05-08T12:00:00Z")
    await setLastSignalCheckAt("user-1", when)
    expect(mock.gmailToken.update).toHaveBeenCalledWith({
      where: { id: "tok-1" },
      data: { lastSignalCheckAt: when },
    })
  })

  it("is a no-op when the row no longer exists", async () => {
    mock.gmailToken.findFirst.mockResolvedValue(null)
    await setLastSignalCheckAt("user-1", new Date())
    expect(mock.gmailToken.update).not.toHaveBeenCalled()
  })
})

describe("getSignalCheckpoint", () => {
  it("returns null when no row exists", async () => {
    mock.gmailToken.findUnique.mockResolvedValue(null)
    expect(await getSignalCheckpoint("user-1")).toBeNull()
  })

  it("returns lastSignalCheckAt + createdAt when row exists", async () => {
    const lastSignalCheckAt = new Date("2026-05-08T11:00:00Z")
    const createdAt = new Date("2026-04-01T00:00:00Z")
    mock.gmailToken.findUnique.mockResolvedValue({
      lastSignalCheckAt,
      createdAt,
    })
    expect(await getSignalCheckpoint("user-1")).toEqual({
      lastSignalCheckAt,
      createdAt,
    })
  })
})

describe("crypto smoke", () => {
  it("uses AES-256-GCM with a 12-byte IV and 16-byte auth tag", () => {
    const ciphertext = encryptRefreshToken("hello")
    const buf = Buffer.from(ciphertext, "base64")
    // Layout: [12-byte IV][ciphertext][16-byte tag]
    // For "hello" (5 bytes), expected total = 12 + 5 + 16 = 33 bytes
    expect(buf.length).toBe(12 + "hello".length + 16)
    // IV must be random — sanity check it's not all zeros
    const iv = buf.subarray(0, 12)
    expect(iv.equals(Buffer.alloc(12))).toBe(false)
    // crypto-test escape: also verify that we can decrypt the same shape
    // using a hand-rolled decrypt to confirm format
    const key = Buffer.from(VALID_KEY, "hex")
    const tag = buf.subarray(buf.length - 16)
    const ct = buf.subarray(12, buf.length - 16)
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ct), decipher.final()])
    expect(plain.toString("utf8")).toBe("hello")
  })
})
