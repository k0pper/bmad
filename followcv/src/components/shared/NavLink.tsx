"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type NavLinkProps = {
  href: string
  children: ReactNode
  exact?: boolean
}

export function NavLink({ href, children, exact = false }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center px-3 py-2 rounded-md text-sm font-medium",
        "transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        isActive
          ? "bg-brand-subtle text-brand"
          : "text-text-secondary hover:bg-brand-subtle/60 hover:text-brand"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full transition-opacity duration-150",
          isActive ? "opacity-100 bg-brand" : "opacity-0"
        )}
      />
      {children}
    </Link>
  )
}
