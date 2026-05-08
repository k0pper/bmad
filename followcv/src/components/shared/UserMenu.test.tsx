import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

import { UserMenu } from "./UserMenu"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>
type MockPrisma = { user: { findUnique: ReturnType<typeof vi.fn> } }
const mock = prisma as unknown as MockPrisma

beforeEach(() => {
  vi.clearAllMocks()
})

describe("UserMenu", () => {
  it("returns null when there is no session", async () => {
    mockAuth.mockResolvedValue(null)
    const { container } = render(await UserMenu())
    expect(container.firstChild).toBeNull()
  })

  it("renders the identity card and links to /settings — never exposes a sign-out form", async () => {
    // Sign-out lived here previously and was easy to fat-finger. The whole
    // card should now act as a link to /settings; sign-out lives on the
    // settings page instead.
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Alex", email: "alex@example.com" },
    })
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    render(await UserMenu())

    const link = screen.getByRole("link", { name: /open account settings/i })
    expect(link).toHaveAttribute("href", "/settings")
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull()
    // No <form> wrapping anywhere — that was the legacy sign-out shape.
    expect(link.querySelector("form")).toBeNull()
  })

  it("shows a Pro badge for users on the PRO subscription tier", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Alex", email: "alex@example.com" },
    })
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" })

    render(await UserMenu())

    expect(screen.getByLabelText(/pro subscription/i)).toBeInTheDocument()
    expect(screen.queryByText(/^free$/i)).toBeNull()
  })

  it("shows a Free pill for users on the FREE tier", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Alex", email: "alex@example.com" },
    })
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    render(await UserMenu())

    expect(screen.queryByLabelText(/pro subscription/i)).toBeNull()
    expect(screen.getByText(/^free$/i)).toBeInTheDocument()
  })

  it("reads tier from the DB, not from the session JWT", async () => {
    // The JWT carries cosmetic flags (e.g. gmailConnected) that can be 30
    // days stale. Tier-driven UI must always re-read from prisma.user.
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Alex",
        email: "alex@example.com",
        // Stale JWT: claims PRO even though the DB says FREE.
        subscriptionTier: "PRO",
      },
    })
    mock.user.findUnique.mockResolvedValue({ subscriptionTier: "FREE" })

    render(await UserMenu())

    expect(screen.queryByLabelText(/pro subscription/i)).toBeNull()
    expect(screen.getByText(/^free$/i)).toBeInTheDocument()
  })
})
