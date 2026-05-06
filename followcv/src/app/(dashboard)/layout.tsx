import type { ReactNode } from 'react'
import Link from 'next/link'
import { UserMenu } from '@/components/shared/UserMenu'
import { SidebarShell } from '@/components/shared/SidebarShell'
import { Logo } from '@/components/shared/Logo'
import { NavLink } from '@/components/shared/NavLink'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarShell width="var(--sidebar-width)">
        {/* Brand */}
        <div className="px-5 py-5">
          <Link
            href="/"
            aria-label="FollowCV home"
            className="inline-flex rounded-md outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Logo size="md" />
          </Link>
        </div>

        {/* Health score slot — wired up in Story 4.1; invisible until then */}
        <div data-testid="health-score-slot" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5" aria-label="Main navigation">
          <NavLink href="/board">Board</NavLink>
          <NavLink href="/cv">CVs</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>

        {/* User menu */}
        <div className="p-4 border-t border-border">
          <UserMenu />
        </div>
      </SidebarShell>

      <main className="flex-1 overflow-y-auto md:ml-0 pl-10 md:pl-0">
        {children}
      </main>
    </div>
  )
}
