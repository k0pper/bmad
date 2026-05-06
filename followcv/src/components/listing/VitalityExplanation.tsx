"use client"

import { VitalityBadge } from "@/components/vitality/VitalityBadge"
import type { RuleEvaluation } from "@/lib/services/vitality-state-machine"
import type { VitalityState } from "@/generated/prisma/client"

type Props = {
  explanation: RuleEvaluation[]
  finalState: VitalityState
}

export function VitalityExplanation({ explanation, finalState }: Props) {
  const evaluated = explanation.filter((s) => s.outcome !== "skipped")
  const firedIndex = evaluated.findIndex((s) => s.outcome === "fired")
  const prerequisites = firedIndex > 0 ? evaluated.slice(0, firedIndex) : []
  const conclusion = firedIndex >= 0 ? evaluated[firedIndex] : null

  return (
    <div className="space-y-4">
      {/* Prerequisites */}
      {prerequisites.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Checks passed
          </p>
          <ul className="space-y-1">
            {prerequisites.map((step) => (
              <li key={step.rule} className="flex items-baseline gap-2 text-sm">
                <span
                  className="mt-px text-[10px] flex-shrink-0"
                  style={{ color: "var(--color-vitality-active-text)" }}
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span style={{ color: "var(--color-text-secondary)" }}>{step.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Connector arrow */}
      {prerequisites.length > 0 && conclusion && (
        <div className="flex items-center gap-2 pl-px">
          <div className="flex flex-col items-center gap-0.5" aria-hidden="true">
            <div className="w-px h-3" style={{ backgroundColor: "var(--color-border, #e2e8f0)" }} />
            <span className="text-xs leading-none" style={{ color: "var(--color-text-tertiary)" }}>↓</span>
          </div>
          <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>decisive rule</span>
        </div>
      )}

      {/* Conclusion */}
      {conclusion ? (
        <div
          className="rounded-xl border px-4 py-3.5 space-y-1.5"
          style={{
            backgroundColor: "var(--color-brand-subtle, #eef2ff)",
            borderColor: "rgba(79, 70, 229, 0.25)",
          }}
          role="status"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {conclusion.label}
            </span>
            <VitalityBadge state={finalState} />
          </div>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {conclusion.detail}
          </p>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          State could not be determined.
        </p>
      )}
    </div>
  )
}
