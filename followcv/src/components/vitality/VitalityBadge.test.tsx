import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { VitalityBadge } from "./VitalityBadge"

describe("VitalityBadge", () => {
  it("renders the label and icon for a given state", () => {
    render(<VitalityBadge state="HOT" />)
    const badge = screen.getByLabelText(/^Hot — recently posted$/)
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("Hot")
  })

  it("appends the manually-overridden marker to the aria-label when overridden", () => {
    render(<VitalityBadge state="IN_DIALOGUE" isOverridden />)
    const badge = screen.getByLabelText(/manually overridden/)
    expect(badge).toBeInTheDocument()
    // Lock icon is rendered alongside the existing icon: there should be 2 svgs.
    const svgs = badge.querySelectorAll("svg")
    expect(svgs.length).toBe(2)
  })

  it("does not render the lock icon when not overridden", () => {
    render(<VitalityBadge state="ACTIVE" />)
    const badge = screen.getByLabelText(/^Active/)
    const svgs = badge.querySelectorAll("svg")
    expect(svgs.length).toBe(1)
  })
})
