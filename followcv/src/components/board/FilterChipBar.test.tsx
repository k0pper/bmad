import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FilterChipBar } from "./FilterChipBar"
import type { VitalityState } from "@/generated/prisma/client"

const ZERO_COUNTS: Record<VitalityState, number> = {
  HOT: 0,
  ACTIVE: 0,
  COOLING: 0,
  COLD: 0,
  DEADLINE: 0,
  GHOSTING: 0,
  IN_DIALOGUE: 0,
  CLOSED: 0,
}

function setup(overrides: Partial<React.ComponentProps<typeof FilterChipBar>> = {}) {
  const onToggleState = vi.fn()
  const onClearAll = vi.fn()
  const onSetQuery = vi.fn()
  const onSetSort = vi.fn()

  const props: React.ComponentProps<typeof FilterChipBar> = {
    selectedStates: [],
    counts: { ...ZERO_COUNTS, COOLING: 3, HOT: 2 },
    query: "",
    sort: "date-added",
    isAnyFilterActive: false,
    onToggleState,
    onClearAll,
    onSetQuery,
    onSetSort,
    ...overrides,
  }

  render(<FilterChipBar {...props} />)
  return { onToggleState, onClearAll, onSetQuery, onSetSort }
}

describe("FilterChipBar", () => {
  it("renders 'All' + 8 state chips with their counts", () => {
    setup()
    expect(screen.getByRole("button", { name: /^All$/ })).toBeInTheDocument()
    // Each state chip's accessible name includes the count we passed.
    expect(screen.getByRole("button", { name: /Cooling.*\(3\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Hot.*\(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Cold.*\(0\)/ })).toBeInTheDocument()
  })

  it("'All' is the active chip when no states are selected", () => {
    setup({ selectedStates: [] })
    expect(screen.getByRole("button", { name: /^All$/ })).not.toHaveAttribute(
      "aria-pressed"
    )
    // Other chips reflect not-pressed.
    expect(
      screen.getByRole("button", { name: /Cooling/ }).getAttribute("aria-pressed")
    ).toBe("false")
  })

  it("clicking a chip fires onToggleState with the right state", async () => {
    const user = userEvent.setup()
    const { onToggleState } = setup()
    await user.click(screen.getByRole("button", { name: /Cooling/ }))
    expect(onToggleState).toHaveBeenCalledWith("COOLING")
  })

  it("clicking 'All' fires onClearAll only when chips are active", async () => {
    const user = userEvent.setup()
    const { onClearAll: noActiveClear } = setup({ selectedStates: [] })
    await user.click(screen.getByRole("button", { name: /^All$/ }))
    expect(noActiveClear).not.toHaveBeenCalled()
  })

  it("clicking 'All' fires onClearAll when chips are active", async () => {
    const user = userEvent.setup()
    const { onClearAll } = setup({ selectedStates: ["HOT"] })
    await user.click(screen.getByRole("button", { name: /^All$/ }))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it("typing in the search input fires onSetQuery on each keystroke", () => {
    const { onSetQuery } = setup()
    const input = screen.getByRole("searchbox", { name: /search listings/i })
    fireEvent.change(input, { target: { value: "google" } })
    expect(onSetQuery).toHaveBeenCalledWith("google")
  })

  it("the clear-search button appears only when the query is non-empty", async () => {
    const user = userEvent.setup()
    const { onSetQuery } = setup({ query: "google" })
    await user.click(screen.getByRole("button", { name: /clear search/i }))
    expect(onSetQuery).toHaveBeenCalledWith("")
  })

  it("the 'Clear filters' button appears only when isAnyFilterActive is true", () => {
    const { rerender } = render(
      <FilterChipBar
        selectedStates={[]}
        counts={ZERO_COUNTS}
        query=""
        sort="date-added"
        isAnyFilterActive={false}
        onToggleState={() => {}}
        onClearAll={() => {}}
        onSetQuery={() => {}}
        onSetSort={() => {}}
      />
    )
    expect(
      screen.queryByRole("button", { name: /clear all filters/i })
    ).not.toBeInTheDocument()
    rerender(
      <FilterChipBar
        selectedStates={["HOT"]}
        counts={ZERO_COUNTS}
        query=""
        sort="date-added"
        isAnyFilterActive
        onToggleState={() => {}}
        onClearAll={() => {}}
        onSetQuery={() => {}}
        onSetSort={() => {}}
      />
    )
    expect(
      screen.getByRole("button", { name: /clear all filters/i })
    ).toBeInTheDocument()
  })

  it("the sort trigger reflects the current sort label", () => {
    setup({ sort: "company" })
    expect(
      screen.getByRole("button", { name: /sort listings/i })
    ).toHaveTextContent(/Company/)
  })
})
