import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    gmailToken: { findUnique: vi.fn() },
  },
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    const err = new Error("NEXT_REDIRECT")
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${path}`
    throw err
  }),
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

import GmailSettingsPage from "./page"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>

type MockPrisma = {
  user: { findUnique: ReturnType<typeof vi.fn> }
  gmailToken: { findUnique: ReturnType<typeof vi.fn> }
}
const mock = prisma as unknown as MockPrisma

beforeEach(() => {
  vi.clearAllMocks()
})

async function renderPage(searchParams: Record<string, string> = {}) {
  const Resolved = await GmailSettingsPage({
    searchParams: Promise.resolve(searchParams),
  })
  return render(Resolved as React.ReactElement)
}

describe("GmailSettingsPage", () => {
  it("redirects unauthenticated users to /login", async () => {
    mockAuth.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT")
  })

  describe("free tier", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-1" } })
      mock.user.findUnique.mockResolvedValue({ subscriptionTier: "FREE" })
      mock.gmailToken.findUnique.mockResolvedValue(null)
    })

    it("renders the ProGatePattern, not the consent ceremony", async () => {
      await renderPage()
      expect(
        screen.getByText("Gmail auto-tracking is a Pro feature"),
      ).toBeInTheDocument()
      // Connect / consent ceremony should not be visible
      expect(
        screen.queryByRole("button", { name: /connect gmail/i }),
      ).not.toBeInTheDocument()
      expect(screen.queryByText(/what we never read/i)).not.toBeInTheDocument()
    })
  })

  describe("Pro tier — not connected", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-1" } })
      mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })
      mock.gmailToken.findUnique.mockResolvedValue(null)
    })

    it("renders the consent ceremony with `What we never read` first", async () => {
      await renderPage()
      const neverHeader = screen.getByRole("heading", {
        name: /what we never read/i,
      })
      const readHeader = screen.getByRole("heading", { name: /what we read/i })
      expect(neverHeader).toBeInTheDocument()
      expect(readHeader).toBeInTheDocument()
      // Order check: `what we never read` precedes `what we read` in document order
      expect(
        neverHeader.compareDocumentPosition(readHeader) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it("lists email body, attachments, contacts as not-read", async () => {
      await renderPage()
      expect(
        screen.getByText(/body of any email/i),
      ).toBeInTheDocument()
      expect(screen.getByText(/email attachments/i)).toBeInTheDocument()
      expect(screen.getByText(/your contacts/i)).toBeInTheDocument()
    })

    it("mentions the gmail.readonly scope explicitly", async () => {
      await renderPage()
      expect(screen.getByText("gmail.readonly")).toBeInTheDocument()
    })

    it("renders the Connect Gmail button", async () => {
      await renderPage()
      expect(
        screen.getByRole("button", { name: /connect gmail/i }),
      ).toBeInTheDocument()
    })
  })

  describe("Pro tier — connected", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-1" } })
      mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })
      mock.gmailToken.findUnique.mockResolvedValue({
        connectedEmail: "marcus@example.com",
        createdAt: new Date("2026-04-15T00:00:00Z"),
      })
    })

    it("renders the connected email and a Disconnect button", async () => {
      await renderPage()
      expect(screen.getByText("Gmail connected")).toBeInTheDocument()
      expect(screen.getByText("marcus@example.com")).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /disconnect gmail/i }),
      ).toBeInTheDocument()
      // Consent ceremony should NOT render when already connected
      expect(screen.queryByText(/what we never read/i)).not.toBeInTheDocument()
    })
  })

  describe("query-param banners", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: "user-1" } })
      mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })
      mock.gmailToken.findUnique.mockResolvedValue(null)
    })

    it("shows a success banner on ?connected=1", async () => {
      await renderPage({ connected: "1" })
      expect(
        screen.getByText(/gmail connected\./i),
      ).toBeInTheDocument()
    })

    it("shows the soft-landing message on ?denied=1", async () => {
      await renderPage({ denied: "1" })
      expect(
        screen.getByText(/no problem — connect gmail in settings/i),
      ).toBeInTheDocument()
    })

    it("shows a friendly error for ?error=no_refresh_token", async () => {
      await renderPage({ error: "no_refresh_token" })
      expect(
        screen.getByText(/refresh token/i),
      ).toBeInTheDocument()
    })

    it("falls back to a generic message for unknown error codes", async () => {
      await renderPage({ error: "weird_unmapped_code" })
      expect(
        screen.getByText(/something went wrong/i),
      ).toBeInTheDocument()
    })
  })
})
