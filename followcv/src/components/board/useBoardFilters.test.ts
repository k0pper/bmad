import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook } from "@testing-library/react"

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => routerMocks,
}))

import { useBoardFilters } from "./useBoardFilters"

function setLocation(search: string) {
  window.history.replaceState(
    {},
    "",
    `/board${search.length > 0 ? `?${search}` : ""}`
  )
}

describe("useBoardFilters", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setLocation("")
    replaceStateSpy = vi.spyOn(window.history, "replaceState")
    Object.values(routerMocks).forEach((fn) => fn.mockClear?.())
  })

  afterEach(() => {
    replaceStateSpy.mockRestore()
  })

  it("seeds state from URL on initial render", () => {
    setLocation("status=cooling,cold&q=google&sort=company")
    const { result } = renderHook(() => useBoardFilters())
    expect(result.current.state.selectedStates).toEqual(["COOLING", "COLD"])
    expect(result.current.state.query).toBe("google")
    expect(result.current.state.sort).toBe("company")
  })

  it("ignores unknown state values gracefully", () => {
    setLocation("status=cooling,bogus,hot")
    const { result } = renderHook(() => useBoardFilters())
    expect(result.current.state.selectedStates).toEqual(["COOLING", "HOT"])
  })

  it("toggleState adds a state and syncs URL via replaceState (no router calls)", () => {
    const { result } = renderHook(() => useBoardFilters())
    replaceStateSpy.mockClear()
    act(() => result.current.toggleState("HOT"))
    expect(result.current.state.selectedStates).toEqual(["HOT"])
    expect(replaceStateSpy).toHaveBeenCalled()
    const lastCall = replaceStateSpy.mock.calls.at(-1)!
    expect(lastCall[2]).toMatch(/status=hot/)
    expect(routerMocks.push).not.toHaveBeenCalled()
    expect(routerMocks.replace).not.toHaveBeenCalled()
    expect(routerMocks.refresh).not.toHaveBeenCalled()
  })

  it("toggleState removes a state on second click", () => {
    setLocation("status=hot")
    const { result } = renderHook(() => useBoardFilters())
    act(() => result.current.toggleState("HOT"))
    expect(result.current.state.selectedStates).toEqual([])
    const lastCall = replaceStateSpy.mock.calls.at(-1)!
    expect(lastCall[2]).not.toMatch(/status=/)
  })

  it("preserves unrelated query params (archived=true)", () => {
    setLocation("archived=true")
    const { result } = renderHook(() => useBoardFilters())
    act(() => result.current.toggleState("COOLING"))
    const lastCall = replaceStateSpy.mock.calls.at(-1)!
    expect(lastCall[2]).toMatch(/archived=true/)
    expect(lastCall[2]).toMatch(/status=cooling/)
  })

  it("setQuery writes ?q= and removes it when empty", () => {
    const { result } = renderHook(() => useBoardFilters())
    act(() => result.current.setQuery("google"))
    let lastCall = replaceStateSpy.mock.calls.at(-1)!
    expect(lastCall[2]).toMatch(/q=google/)
    act(() => result.current.setQuery(""))
    lastCall = replaceStateSpy.mock.calls.at(-1)!
    expect(lastCall[2]).not.toMatch(/[?&]q=/)
  })

  it("default sort is omitted from URL", () => {
    const { result } = renderHook(() => useBoardFilters())
    act(() => result.current.setSort("company"))
    let lastCall = replaceStateSpy.mock.calls.at(-1)!
    expect(lastCall[2]).toMatch(/sort=company/)
    act(() => result.current.setSort("date-added"))
    lastCall = replaceStateSpy.mock.calls.at(-1)!
    expect(lastCall[2]).not.toMatch(/sort=/)
  })

  it("clearAll resets state and strips filter params from URL", () => {
    setLocation("status=hot&q=test&sort=company&archived=true")
    const { result } = renderHook(() => useBoardFilters())
    act(() => result.current.clearAll())
    const lastCall = replaceStateSpy.mock.calls.at(-1)!
    // Filter params gone, archived preserved.
    expect(lastCall[2]).toBe("/board?archived=true")
  })

  it("popstate event re-syncs local state from URL", () => {
    const { result } = renderHook(() => useBoardFilters())
    expect(result.current.state.selectedStates).toEqual([])
    act(() => {
      setLocation("status=hot,active")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(result.current.state.selectedStates).toEqual(["HOT", "ACTIVE"])
  })
})
