import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    gmailToken: { findUnique: vi.fn() },
    jobListing: { count: vi.fn() },
  },
}))

import { GmailConnectPrompt } from "./GmailConnectPrompt"
import { GmailConnectPromptClient } from "./GmailConnectPromptClient"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>

type MockPrisma = {
  user: { findUnique: ReturnType<typeof vi.fn> }
  gmailToken: { findUnique: ReturnType<typeof vi.fn> }
  jobListing: { count: ReturnType<typeof vi.fn> }
}
const mock = prisma as unknown as MockPrisma

const DISMISS_KEY = "followcv:gmail-prompt-dismissed-v1"

// jsdom 26 ships a localStorage stub that throws unless the JSDOM URL is
// explicitly configured. Replace it with a simple in-memory shim so
// component tests can read/write without environment juggling.
function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "user-1" } })
  installMemoryLocalStorage()
})

describe("GmailConnectPrompt (server)", () => {
  it("returns null for unauthenticated users", async () => {
    mockAuth.mockResolvedValue(null)
    const result = await GmailConnectPrompt()
    expect(result).toBeNull()
  })

  it("returns null for free-tier users", async () => {
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "FREE" })
    mock.gmailToken.findUnique.mockResolvedValue(null)
    mock.jobListing.count.mockResolvedValue(10)
    const result = await GmailConnectPrompt()
    expect(result).toBeNull()
  })

  it("returns null when Pro user has fewer than 3 listings", async () => {
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })
    mock.gmailToken.findUnique.mockResolvedValue(null)
    mock.jobListing.count.mockResolvedValue(2)
    const result = await GmailConnectPrompt()
    expect(result).toBeNull()
  })

  it("returns null when Pro user already has Gmail connected", async () => {
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })
    mock.gmailToken.findUnique.mockResolvedValue({ id: "tok-1" })
    mock.jobListing.count.mockResolvedValue(10)
    const result = await GmailConnectPrompt()
    expect(result).toBeNull()
  })

  it("renders the Client component when Pro user has 3+ listings and no token", async () => {
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })
    mock.gmailToken.findUnique.mockResolvedValue(null)
    mock.jobListing.count.mockResolvedValue(3)
    const result = await GmailConnectPrompt()
    expect(result).not.toBeNull()
    // We can't render the server component directly under jsdom (it's
    // an async fn), but we can assert the produced element is the client
    // component by inspecting its `type`.
    expect(
      (result as React.ReactElement & { type: { name?: string } }).type,
    ).toBe(GmailConnectPromptClient)
  })

  it("counts only non-deleted listings", async () => {
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })
    mock.gmailToken.findUnique.mockResolvedValue(null)
    mock.jobListing.count.mockResolvedValue(0)
    await GmailConnectPrompt()
    expect(mock.jobListing.count).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null },
    })
  })
})

describe("GmailConnectPromptClient", () => {
  it("renders prompt copy and learn-more link", () => {
    render(<GmailConnectPromptClient />)
    expect(
      screen.getByText("Connect Gmail to auto-track replies"),
    ).toBeInTheDocument()
    const link = screen.getByRole("link", { name: /learn more/i })
    expect(link).toHaveAttribute("href", "/settings/gmail")
  })

  it("does not render when previously dismissed", () => {
    window.localStorage.setItem(DISMISS_KEY, "1")
    render(<GmailConnectPromptClient />)
    expect(
      screen.queryByText("Connect Gmail to auto-track replies"),
    ).not.toBeInTheDocument()
  })

  it("dismisses on click and persists the flag", () => {
    render(<GmailConnectPromptClient />)
    const dismiss = screen.getByRole("button", {
      name: /dismiss gmail prompt/i,
    })
    fireEvent.click(dismiss)
    expect(
      screen.queryByText("Connect Gmail to auto-track replies"),
    ).not.toBeInTheDocument()
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe("1")
  })
})
