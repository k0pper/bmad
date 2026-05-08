import Link from "next/link"
import { Sparkles } from "lucide-react"

type Props = {
  /** The big headline (typically explains what the user has hit). */
  headline: string
  /** The CTA button label. */
  ctaText?: string
  /** The CTA target. Defaults to the subscription settings page. */
  ctaHref?: string
  /** Optional supporting copy under the headline. */
  description?: string
}

/**
 * The single Pro-gate component used at every Pro-feature surface across the
 * app — listing cap reached, Gmail integration page on free, etc. Keep this
 * component visually consistent so the upgrade affordance reads the same
 * everywhere.
 */
export function ProGatePattern({
  headline,
  ctaText = "Upgrade to Pro",
  ctaHref = "/settings/subscription",
  description,
}: Props) {
  return (
    <div
      role="region"
      aria-label="Pro upgrade prompt"
      className="flex flex-col items-start gap-3 rounded-md border p-4"
      style={{
        borderColor: "var(--color-border, #e2e8f0)",
        backgroundColor: "var(--color-brand-subtle, #eef2ff)",
      }}
    >
      <div className="flex items-center gap-2">
        <Sparkles
          size={16}
          aria-hidden
          style={{ color: "var(--color-brand)" }}
        />
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {headline}
        </h3>
      </div>
      {description && (
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {description}
        </p>
      )}
      <Link
        href={ctaHref}
        className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        style={{ backgroundColor: "var(--color-brand)" }}
      >
        {ctaText}
      </Link>
    </div>
  )
}
