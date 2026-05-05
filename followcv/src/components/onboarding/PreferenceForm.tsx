"use client"

import { useActionState, useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { savePreferences, type PreferenceActionState } from "@/app/(dashboard)/onboarding/actions"

const SENIORITY_OPTIONS = [
  "Junior",
  "Mid-Level",
  "Senior",
  "Staff",
  "Principal",
  "Director",
  "VP",
  "C-Suite",
]

const WORK_STYLE_OPTIONS = ["Remote", "Hybrid", "Onsite"]

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "CAD", "AUD"]

export function PreferenceForm() {
  const [state, formAction, isPending] = useActionState<PreferenceActionState, FormData>(
    savePreferences,
    null
  )
  const [locations, setLocations] = useState<string[]>([])
  const [locationInput, setLocationInput] = useState("")
  const locationInputRef = useRef<HTMLInputElement>(null)

  const addLocation = useCallback(
    (raw: string) => {
      const trimmed = raw.replace(/,\s*$/, "").trim()
      if (trimmed && !locations.includes(trimmed)) {
        setLocations((prev) => [...prev, trimmed])
      }
      setLocationInput("")
    },
    [locations]
  )

  const removeLocation = useCallback((loc: string) => {
    setLocations((prev) => prev.filter((l) => l !== loc))
  }, [])

  function handleLocationKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      addLocation(locationInput)
    } else if (e.key === ",") {
      e.preventDefault()
      addLocation(locationInput)
    } else if (e.key === "Backspace" && locationInput === "" && locations.length > 0) {
      setLocations((prev) => prev.slice(0, -1))
    } else if (e.key === "Escape") {
      setLocationInput("")
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* Job Function */}
      <div className="space-y-1.5">
        <label
          htmlFor="jobFunction"
          className="block text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Job function
        </label>
        <input
          id="jobFunction"
          name="jobFunction"
          type="text"
          placeholder="e.g. Software Engineering, Product Management"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      {/* Seniority Level */}
      <div className="space-y-1.5">
        <label
          htmlFor="seniorityLevel"
          className="block text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Seniority level
        </label>
        <select
          id="seniorityLevel"
          name="seniorityLevel"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          defaultValue=""
        >
          <option value="">Select level</option>
          {SENIORITY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* Preferred Locations */}
      <div className="space-y-1.5">
        <label
          htmlFor="locationInput"
          className="block text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Preferred locations
        </label>
        <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          Type a location and press Enter or comma to add it
        </p>
        <div
          className="flex flex-wrap gap-2 rounded-md border border-border bg-background p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50"
          onClick={() => locationInputRef.current?.focus()}
        >
          {locations.map((loc) => (
            <span
              key={loc}
              className="inline-flex items-center gap-1 rounded bg-brand-subtle px-2 py-0.5 text-xs font-medium"
              style={{ color: "var(--color-brand)" }}
            >
              {loc}
              <button
                type="button"
                aria-label={`Remove ${loc}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeLocation(loc)
                }}
                className="rounded-full leading-none outline-none hover:opacity-70 focus-visible:ring-1 focus-visible:ring-ring"
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={locationInputRef}
            id="locationInput"
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={handleLocationKeyDown}
            onBlur={() => {
              if (locationInput.trim()) addLocation(locationInput)
            }}
            placeholder={locations.length === 0 ? "e.g. San Francisco, Remote, New York" : ""}
            className="min-w-[160px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {/* Hidden inputs for form submission */}
        {locations.map((loc) => (
          <input key={loc} type="hidden" name="preferredLocations" value={loc} />
        ))}
      </div>

      {/* Work Style */}
      <fieldset className="space-y-2">
        <legend
          className="block text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Work style
        </legend>
        <div className="flex gap-6">
          {WORK_STYLE_OPTIONS.map((style) => (
            <label key={style} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="workStyle"
                value={style}
                className="accent-brand"
              />
              {style}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Target Salary Range */}
      <div className="space-y-1.5">
        <span
          className="block text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Target salary range
        </span>
        <div className="flex items-center gap-2">
          <select
            name="salaryCurrency"
            aria-label="Currency"
            defaultValue="USD"
            className="rounded-md border border-border bg-background px-2 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            name="targetSalaryMin"
            type="number"
            min="0"
            step="1000"
            placeholder="Min"
            aria-label="Minimum salary"
            className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <span className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
            to
          </span>
          <input
            name="targetSalaryMax"
            type="number"
            min="0"
            step="1000"
            placeholder="Max"
            aria-label="Maximum salary"
            className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending} size="lg" className="w-full sm:w-auto">
        {isPending ? "Saving…" : "Set up my profile"}
      </Button>
    </form>
  )
}
