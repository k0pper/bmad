export function StalenessBanner() {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-4 py-2.5 text-sm mb-4"
      style={{
        backgroundColor: "var(--color-vitality-cooling-bg, #fef9c3)",
        color: "var(--color-vitality-cooling-text, #854d0e)",
        border: "1px solid var(--color-vitality-cooling-text, #854d0e)",
        opacity: 0.85,
      }}
      role="status"
    >
      <span aria-hidden="true">⏱</span>
      <span>Vitality states may be outdated — recalculation runs hourly.</span>
    </div>
  )
}
