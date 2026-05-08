import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { VitalityBadge } from "./VitalityBadge"

describe("VitalityBadge", () => {
  it("renders the label and icon for a given state", () => {
    render(<VitalityBadge state="HOT" />)
    const badge = screen.getByLabelText(/^Hot — recently posted/)
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("Hot")
  })

  it("appends the manually-set marker to the aria-label when overridden", () => {
    render(<VitalityBadge state="IN_DIALOGUE" isOverridden />)
    const badge = screen.getByLabelText(/manually set/)
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute("data-vitality-overridden", "true")
    // Lock icon is rendered alongside the existing state icon: there should be 2 svgs.
    const svgs = badge.querySelectorAll("svg")
    expect(svgs.length).toBe(2)
  })

  it("renders the live pulse dot (not a lock icon) when state is system-computed", () => {
    render(<VitalityBadge state="ACTIVE" />)
    const badge = screen.getByLabelText(/^Active/)
    expect(badge).toHaveAttribute("data-vitality-overridden", "false")
    // No lock icon: only the state icon SVG.
    const svgs = badge.querySelectorAll("svg")
    expect(svgs.length).toBe(1)
    // The pulse dot is a span with the .vitality-live-dot class.
    expect(badge.querySelector(".vitality-live-dot")).not.toBeNull()
  })

  it("hides both indicators when showLiveIndicator is false (used in pickers)", () => {
    render(<VitalityBadge state="ACTIVE" showLiveIndicator={false} />)
    const badge = screen.getByLabelText(/^Active/)
    expect(badge.querySelector(".vitality-live-dot")).toBeNull()
    const svgs = badge.querySelectorAll("svg")
    expect(svgs.length).toBe(1)
  })
})
