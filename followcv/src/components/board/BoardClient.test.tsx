import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BoardClient, type BoardListing } from "./BoardClient"
import type { VitalityState } from "@/generated/prisma/client"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Stub the row so the integration test focuses on the filter pipeline, not on
// VitalityOverrideMenu / overflow-menu plumbing.
vi.mock("./BoardRow", () => ({
  BoardRow: ({ id, title, company }: { id: string; title: string; company: string }) => (
    <div data-testid="board-row" data-listing-id={id}>
      {title} — {company}
    </div>
  ),
}))

vi.mock("./ImportDrawer", () => ({
  ImportDrawer: () => null,
}))

vi.mock("@/components/application/ApplyRitualDialog", () => ({
  ApplyRitualDialog: () => null,
}))

function makeListing(
  id: string,
  overrides: Partial<BoardListing> & { vitalityState: VitalityState; createdAt: Date }
): BoardListing {
  return {
    id,
    title: overrides.title ?? `Title ${id}`,
    company: overrides.company ?? `Co ${id}`,
    location: overrides.location ?? null,
    vitalityState: overrides.vitalityState,
    overrideSource: overrides.overrideSource ?? null,
    importSource: overrides.importSource ?? "URL_IMPORT",
    postedAt: overrides.postedAt ?? null,
    createdAt: overrides.createdAt,
    salaryMin: overrides.salaryMin ?? null,
    salaryMax: overrides.salaryMax ?? null,
    salaryCurrency: overrides.salaryCurrency ?? null,
    archived: overrides.archived ?? false,
    notes: overrides.notes ?? null,
    closingDate: overrides.closingDate ?? null,
    isRecent: overrides.isRecent ?? false,
    applied: overrides.applied ?? false,
    followUpDue: overrides.followUpDue ?? false,
  }
}

describe("BoardClient — filter pipeline integration", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/board")
  })

  it("renders all listings when no filters are active", () => {
    const listings = [
      makeListing("a", { vitalityState: "HOT", createdAt: new Date("2026-01-01") }),
      makeListing("b", { vitalityState: "COOLING", createdAt: new Date("2026-01-02") }),
    ]
    render(<BoardClient listings={listings} cvVersions={[]} />)
    expect(screen.getAllByTestId("board-row")).toHaveLength(2)
  })

  it("clicking a state chip filters rows to that state and updates URL", async () => {
    const user = userEvent.setup()
    const listings = [
      makeListing("a", { vitalityState: "HOT", createdAt: new Date("2026-01-01") }),
      makeListing("b", { vitalityState: "COOLING", createdAt: new Date("2026-01-02") }),
      makeListing("c", { vitalityState: "COOLING", createdAt: new Date("2026-01-03") }),
    ]
    render(<BoardClient listings={listings} cvVersions={[]} />)

    await user.click(screen.getByRole("button", { name: /Cooling/ }))

    const visible = screen.getAllByTestId("board-row")
    expect(visible).toHaveLength(2)
    expect(visible.map((el) => el.dataset.listingId)).toEqual(
      expect.arrayContaining(["b", "c"])
    )
    expect(window.location.search).toContain("status=cooling")
  })

  it("typing in search narrows results across title, company, notes", async () => {
    const user = userEvent.setup()
    const listings = [
      makeListing("a", {
        title: "Senior Designer",
        company: "Stripe",
        vitalityState: "HOT",
        createdAt: new Date("2026-01-01"),
      }),
      makeListing("b", {
        title: "Engineer",
        company: "Google",
        notes: "great culture",
        vitalityState: "COOLING",
        createdAt: new Date("2026-01-02"),
      }),
    ]
    render(<BoardClient listings={listings} cvVersions={[]} />)

    await user.type(
      screen.getByRole("searchbox", { name: /search listings/i }),
      "google"
    )

    const visible = screen.getAllByTestId("board-row")
    expect(visible).toHaveLength(1)
    expect(visible[0].dataset.listingId).toBe("b")
  })

  it("shows the filter-empty state when filters yield zero rows", async () => {
    const user = userEvent.setup()
    const listings = [
      makeListing("a", { vitalityState: "HOT", createdAt: new Date("2026-01-01") }),
    ]
    render(<BoardClient listings={listings} cvVersions={[]} />)

    await user.type(
      screen.getByRole("searchbox", { name: /search listings/i }),
      "nonexistent"
    )

    expect(screen.queryByTestId("board-row")).not.toBeInTheDocument()
    expect(
      screen.getByText(/no listings match these filters/i)
    ).toBeInTheDocument()
    // Two "Clear filters" buttons render at this point: one in the toolbar
    // (FilterChipBar, only when isAnyFilterActive) and one inside the empty
    // state. Both are intentional.
    expect(
      screen.getAllByRole("button", { name: /clear all filters/i }).length
    ).toBeGreaterThanOrEqual(1)
  })

  it("clicking 'Clear filters' restores all rows and clears URL params", async () => {
    const user = userEvent.setup()
    const listings = [
      makeListing("a", { vitalityState: "HOT", createdAt: new Date("2026-01-01") }),
      makeListing("b", { vitalityState: "COOLING", createdAt: new Date("2026-01-02") }),
    ]
    render(<BoardClient listings={listings} cvVersions={[]} />)

    await user.click(screen.getByRole("button", { name: /Hot/ }))
    expect(screen.getAllByTestId("board-row")).toHaveLength(1)

    // The "Clear all filters" trailing button (sibling to the sort/search row)
    // shows up only once anything is active. There may also be one inside the
    // empty state if no rows match — handle either by clicking the first match.
    const clearButtons = screen.getAllByRole("button", { name: /clear all filters/i })
    await user.click(clearButtons[0])

    expect(screen.getAllByTestId("board-row")).toHaveLength(2)
    expect(window.location.search).toBe("")
  })

  it("does not show the chip bar when there are no listings at all", () => {
    render(<BoardClient listings={[]} cvVersions={[]} showArchived />)
    expect(screen.queryByRole("group", { name: /filter by vitality state/i })).not.toBeInTheDocument()
  })
})
