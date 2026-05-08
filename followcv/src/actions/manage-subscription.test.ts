import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock("@/lib/stripe/client", () => ({
  getStripe: vi.fn(),
  getStripeProPriceId: vi.fn(() => "price_pro_test"),
  getAppUrl: vi.fn(() => "https://app.example.com"),
}))

import { createCheckoutSession, cancelSubscription } from "./manage-subscription"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getStripe } from "@/lib/stripe/client"

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>

type MockPrisma = {
  user: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}
const mock = prisma as unknown as MockPrisma
const mockGetStripe = getStripe as unknown as ReturnType<typeof vi.fn>

const session = { user: { id: "user-1", email: "alex@example.com" } }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session)
})

describe("createCheckoutSession", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await createCheckoutSession()
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("rejects when the user is already on Pro", async () => {
    mock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alex@example.com",
      stripeCustomerId: "cus_existing",
      subscriptionTier: "PRO",
    })
    const r = await createCheckoutSession()
    expect(r).toEqual({ data: null, error: "You're already on the Pro plan" })
  })

  it("creates a Stripe customer the first time and persists the id", async () => {
    mock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alex@example.com",
      stripeCustomerId: null,
      subscriptionTier: "FREE",
    })
    const customersCreate = vi.fn().mockResolvedValue({ id: "cus_new_xyz" })
    const sessionsCreate = vi.fn().mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/cs_test_123",
    })
    mockGetStripe.mockReturnValue({
      customers: { create: customersCreate },
      checkout: { sessions: { create: sessionsCreate } },
    })

    const r = await createCheckoutSession()

    expect(customersCreate).toHaveBeenCalledWith({
      email: "alex@example.com",
      metadata: { userId: "user-1" },
    })
    expect(mock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { stripeCustomerId: "cus_new_xyz" },
    })
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_new_xyz",
        client_reference_id: "user-1",
        line_items: [{ price: "price_pro_test", quantity: 1 }],
      }),
    )
    expect(r.data).toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/cs_test_123",
    })
  })

  it("reuses an existing Stripe customer id (no second create)", async () => {
    mock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alex@example.com",
      stripeCustomerId: "cus_existing",
      subscriptionTier: "FREE",
    })
    const customersCreate = vi.fn()
    const sessionsCreate = vi.fn().mockResolvedValue({
      url: "https://checkout.stripe.com/c/cs_test_123",
    })
    mockGetStripe.mockReturnValue({
      customers: { create: customersCreate },
      checkout: { sessions: { create: sessionsCreate } },
    })

    await createCheckoutSession()

    expect(customersCreate).not.toHaveBeenCalled()
    expect(mock.user.update).not.toHaveBeenCalled()
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    )
  })

  it("returns an error when Stripe doesn't return a checkout URL", async () => {
    mock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alex@example.com",
      stripeCustomerId: "cus_existing",
      subscriptionTier: "FREE",
    })
    mockGetStripe.mockReturnValue({
      customers: { create: vi.fn() },
      checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: null }) } },
    })
    const r = await createCheckoutSession()
    expect(r).toEqual({
      data: null,
      error: "Stripe didn't return a checkout URL",
    })
  })

  it("surfaces Stripe errors as ActionResult errors", async () => {
    mock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alex@example.com",
      stripeCustomerId: "cus_existing",
      subscriptionTier: "FREE",
    })
    mockGetStripe.mockReturnValue({
      customers: { create: vi.fn() },
      checkout: {
        sessions: {
          create: vi.fn().mockRejectedValue(new Error("API down")),
        },
      },
    })
    const r = await createCheckoutSession()
    expect(r).toEqual({ data: null, error: "API down" })
  })
})

describe("cancelSubscription", () => {
  it("rejects unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const r = await cancelSubscription()
    expect(r).toEqual({ data: null, error: "Unauthorized" })
  })

  it("rejects free users", async () => {
    mock.user.findUnique.mockResolvedValue({
      stripeSubscriptionId: null,
      subscriptionTier: "FREE",
    })
    const r = await cancelSubscription()
    expect(r).toEqual({
      data: null,
      error: "No active Pro subscription found",
    })
  })

  it("rejects when there is no Stripe subscription id (defensive)", async () => {
    mock.user.findUnique.mockResolvedValue({
      stripeSubscriptionId: null,
      subscriptionTier: "PRO",
    })
    const r = await cancelSubscription()
    expect(r).toEqual({
      data: null,
      error: "No active Pro subscription found",
    })
  })

  it("flips cancel_at_period_end and persists the period-end date", async () => {
    mock.user.findUnique.mockResolvedValue({
      stripeSubscriptionId: "sub_test_123",
      subscriptionTier: "PRO",
    })
    const cancelAt = Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000)
    const subscriptionsUpdate = vi.fn().mockResolvedValue({ cancel_at: cancelAt })
    mockGetStripe.mockReturnValue({
      subscriptions: { update: subscriptionsUpdate },
    })

    const r = await cancelSubscription()

    expect(subscriptionsUpdate).toHaveBeenCalledWith("sub_test_123", {
      cancel_at_period_end: true,
    })
    expect(mock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { subscriptionEndsAt: new Date(cancelAt * 1000) },
    })
    expect(r.data?.endsAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("handles Stripe responses with no cancel_at gracefully", async () => {
    mock.user.findUnique.mockResolvedValue({
      stripeSubscriptionId: "sub_test_123",
      subscriptionTier: "PRO",
    })
    mockGetStripe.mockReturnValue({
      subscriptions: {
        update: vi.fn().mockResolvedValue({ cancel_at: null }),
      },
    })

    const r = await cancelSubscription()
    expect(r).toEqual({ data: { endsAt: null }, error: null })
    expect(mock.user.update).not.toHaveBeenCalled()
  })
})
