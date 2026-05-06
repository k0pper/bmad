import { describe, expect, it } from "vitest"
import {
  applyBoardFilters,
  countByVitalityState,
  type FilterableListing,
} from "./applyBoardFilters"
import type { VitalityState } from "@/generated/prisma/client"

type Row = FilterableListing & { id: string }

function row(
  id: string,
  overrides: Partial<Row> & { vitalityState: VitalityState; createdAt: Date }
): Row {
  return {
    id,
    title: overrides.title ?? `Title ${id}`,
    company: overrides.company ?? `Co ${id}`,
    notes: overrides.notes ?? null,
    closingDate: overrides.closingDate ?? null,
    vitalityState: overrides.vitalityState,
    createdAt: overrides.createdAt,
  }
}

describe("applyBoardFilters — state filter", () => {
  const listings: Row[] = [
    row("a", { vitalityState: "HOT", createdAt: new Date("2026-01-01") }),
    row("b", { vitalityState: "COOLING", createdAt: new Date("2026-01-02") }),
    row("c", { vitalityState: "COLD", createdAt: new Date("2026-01-03") }),
    row("d", { vitalityState: "COOLING", createdAt: new Date("2026-01-04") }),
  ]

  it("returns all rows when no states selected", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "",
      sort: "date-added",
    })
    expect(out.map((r) => r.id).sort()).toEqual(["a", "b", "c", "d"])
  })

  it("filters to a single state", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: ["COOLING"],
      query: "",
      sort: "date-added",
    })
    expect(out.map((r) => r.id).sort()).toEqual(["b", "d"])
  })

  it("filters multiple states with OR semantics", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: ["HOT", "COLD"],
      query: "",
      sort: "date-added",
    })
    expect(out.map((r) => r.id).sort()).toEqual(["a", "c"])
  })
})

describe("applyBoardFilters — search", () => {
  const listings: Row[] = [
    row("a", {
      title: "Senior Designer",
      company: "Stripe",
      notes: null,
      vitalityState: "HOT",
      createdAt: new Date("2026-01-01"),
    }),
    row("b", {
      title: "Engineer",
      company: "Google",
      notes: "promising lead",
      vitalityState: "COOLING",
      createdAt: new Date("2026-01-02"),
    }),
    row("c", {
      title: "Manager",
      company: "Acme",
      notes: null,
      vitalityState: "COLD",
      createdAt: new Date("2026-01-03"),
    }),
  ]

  it("matches title case-insensitively", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "designer",
      sort: "date-added",
    })
    expect(out.map((r) => r.id)).toEqual(["a"])
  })

  it("matches company case-insensitively", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "google",
      sort: "date-added",
    })
    expect(out.map((r) => r.id)).toEqual(["b"])
  })

  it("matches notes case-insensitively", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "promising",
      sort: "date-added",
    })
    expect(out.map((r) => r.id)).toEqual(["b"])
  })

  it("does not crash on null notes", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "anything",
      sort: "date-added",
    })
    expect(out).toEqual([])
  })

  it("ignores leading and trailing whitespace", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "   acme   ",
      sort: "date-added",
    })
    expect(out.map((r) => r.id)).toEqual(["c"])
  })

  it("combines state filter and search with AND semantics", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: ["COOLING"],
      query: "google",
      sort: "date-added",
    })
    expect(out.map((r) => r.id)).toEqual(["b"])
  })
})

describe("applyBoardFilters — sort", () => {
  const listings: Row[] = [
    row("a", {
      company: "zebra",
      closingDate: new Date("2026-03-15"),
      vitalityState: "HOT",
      createdAt: new Date("2026-01-01"),
    }),
    row("b", {
      company: "Apple",
      closingDate: null,
      vitalityState: "ACTIVE",
      createdAt: new Date("2026-01-05"),
    }),
    row("c", {
      company: "Beta",
      closingDate: new Date("2026-02-01"),
      vitalityState: "COOLING",
      createdAt: new Date("2026-01-03"),
    }),
    row("d", {
      company: "beta",
      closingDate: new Date("2026-02-01"),
      vitalityState: "COLD",
      createdAt: new Date("2026-01-10"),
    }),
  ]

  it("date-added: newest first", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "",
      sort: "date-added",
    })
    expect(out.map((r) => r.id)).toEqual(["d", "b", "c", "a"])
  })

  it("company: case-insensitive A→Z, ties broken by date desc", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "",
      sort: "company",
    })
    // Apple, Beta == beta (tie → newer first), zebra
    expect(out.map((r) => r.id)).toEqual(["b", "d", "c", "a"])
  })

  it("deadline: ascending; null deadlines pushed to bottom regardless", () => {
    const out = applyBoardFilters(listings, {
      selectedStates: [],
      query: "",
      sort: "deadline",
    })
    // c & d share closingDate 2026-02-01 — tied → newer createdAt first (d before c)
    // Then a (2026-03-15). Then b (null) at the bottom.
    expect(out.map((r) => r.id)).toEqual(["d", "c", "a", "b"])
  })
})

describe("countByVitalityState", () => {
  it("counts each state from the full set, regardless of any filter", () => {
    const listings: Row[] = [
      row("a", { vitalityState: "HOT", createdAt: new Date("2026-01-01") }),
      row("b", { vitalityState: "HOT", createdAt: new Date("2026-01-02") }),
      row("c", { vitalityState: "COOLING", createdAt: new Date("2026-01-03") }),
    ]
    const counts = countByVitalityState(listings)
    expect(counts.HOT).toBe(2)
    expect(counts.COOLING).toBe(1)
    expect(counts.COLD).toBe(0)
    expect(counts.DEADLINE).toBe(0)
  })

  it("returns zero for every state when listings are empty", () => {
    const counts = countByVitalityState([])
    expect(Object.values(counts).every((n) => n === 0)).toBe(true)
  })
})
