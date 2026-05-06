"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { VitalityState } from "@/generated/prisma/client"
import {
  DEFAULT_FILTER_STATE,
  type BoardFilterState,
  type SortOption,
} from "./applyBoardFilters"

const VALID_STATES = new Set<VitalityState>([
  "HOT",
  "ACTIVE",
  "COOLING",
  "COLD",
  "DEADLINE",
  "GHOSTING",
  "IN_DIALOGUE",
  "CLOSED",
])

const VALID_SORTS = new Set<SortOption>(["date-added", "company", "deadline"])

function parseStatesParam(raw: string | null): VitalityState[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is VitalityState => VALID_STATES.has(s as VitalityState))
}

function parseSortParam(raw: string | null): SortOption {
  if (raw && VALID_SORTS.has(raw as SortOption)) return raw as SortOption
  return "date-added"
}

function buildSearchParams(
  base: URLSearchParams,
  next: BoardFilterState
): string {
  // Preserve every unrelated key (e.g. ?archived=true).
  const params = new URLSearchParams(base)

  if (next.selectedStates.length === 0) {
    params.delete("status")
  } else {
    params.set(
      "status",
      next.selectedStates.map((s) => s.toLowerCase()).join(",")
    )
  }

  const trimmedQuery = next.query.trim()
  if (trimmedQuery.length === 0) params.delete("q")
  else params.set("q", trimmedQuery)

  if (next.sort === "date-added") params.delete("sort")
  else params.set("sort", next.sort)

  return params.toString()
}

function readFromSearchParams(
  params: ReadonlyURLSearchParams | URLSearchParams
): BoardFilterState {
  return {
    selectedStates: parseStatesParam(params.get("status")),
    query: params.get("q") ?? "",
    sort: parseSortParam(params.get("sort")),
  }
}

// `useSearchParams` returns ReadonlyURLSearchParams under the hood; loose alias
// to avoid pulling the type from internals.
type ReadonlyURLSearchParams = URLSearchParams

export function useBoardFilters(): {
  state: BoardFilterState
  setSelectedStates: (next: VitalityState[]) => void
  toggleState: (state: VitalityState) => void
  setQuery: (next: string) => void
  setSort: (next: SortOption) => void
  clearAll: () => void
} {
  const searchParams = useSearchParams()

  // Seed local state from the URL on first render so deep links land filtered
  // on the first paint — no flash of unfiltered content.
  const [state, setState] = useState<BoardFilterState>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTER_STATE
    return readFromSearchParams(
      new URLSearchParams(window.location.search)
    )
  })

  // Listen for back/forward — keep local state in sync with the URL when the
  // user navigates through history, even though we never push.
  useEffect(() => {
    function handlePopstate() {
      setState(readFromSearchParams(new URLSearchParams(window.location.search)))
    }
    window.addEventListener("popstate", handlePopstate)
    return () => window.removeEventListener("popstate", handlePopstate)
  }, [])

  // Whenever local state changes, sync the URL via window.history. We never
  // call router.push/replace/refresh — those re-execute the Server Component,
  // which AC 6 explicitly forbids.
  useEffect(() => {
    if (typeof window === "undefined") return
    const base = new URLSearchParams(window.location.search)
    const nextSearch = buildSearchParams(base, state)
    const target = `${window.location.pathname}${
      nextSearch.length > 0 ? `?${nextSearch}` : ""
    }`
    if (target !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState({}, "", target)
    }
  }, [state])

  const setSelectedStates = useCallback((next: VitalityState[]) => {
    setState((prev) => ({ ...prev, selectedStates: next }))
  }, [])

  const toggleState = useCallback((vitalityState: VitalityState) => {
    setState((prev) => {
      const has = prev.selectedStates.includes(vitalityState)
      const nextStates = has
        ? prev.selectedStates.filter((s) => s !== vitalityState)
        : [...prev.selectedStates, vitalityState]
      return { ...prev, selectedStates: nextStates }
    })
  }, [])

  const setQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, query }))
  }, [])

  const setSort = useCallback((sort: SortOption) => {
    setState((prev) => ({ ...prev, sort }))
  }, [])

  const clearAll = useCallback(() => {
    setState(DEFAULT_FILTER_STATE)
  }, [])

  // `searchParams` is read so the hook re-subscribes when Next routes change
  // (e.g. /board → /board?archived=true). No effect needed, just declared.
  void searchParams

  return {
    state,
    setSelectedStates,
    toggleState,
    setQuery,
    setSort,
    clearAll,
  }
}
