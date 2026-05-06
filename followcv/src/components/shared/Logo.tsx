import { cn } from "@/lib/utils"

type LogoProps = {
  size?: "sm" | "md" | "lg"
  showWordmark?: boolean
  className?: string
}

const sizeMap = {
  sm: { mark: 22, text: "text-base" },
  md: { mark: 28, text: "text-lg" },
  lg: { mark: 40, text: "text-2xl" },
} as const

export function Logo({ size = "md", showWordmark = true, className }: LogoProps) {
  const { mark, text } = sizeMap[size]

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={mark} />
      {showWordmark && (
        <span
          className={cn("font-semibold tracking-tight leading-none", text)}
          style={{ color: "var(--color-text-primary)" }}
        >
          Follow<span style={{ color: "var(--color-brand)" }}>CV</span>
        </span>
      )}
    </span>
  )
}

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="FollowCV logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        width="32"
        height="32"
        rx="8"
        fill="var(--color-brand)"
      />
      {/* Stylised F as an upward trajectory: vertical stem + two ascending rungs */}
      <path
        d="M11 9.5h11M11 9.5v13M11 16h7"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Trajectory dot — the recency / signal accent */}
      <circle cx="22" cy="22" r="2.2" fill="white" />
    </svg>
  )
}
