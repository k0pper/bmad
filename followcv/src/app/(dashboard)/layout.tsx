import type { ReactNode } from 'react'
import Link from 'next/link'
import { UserMenu } from '@/components/shared/UserMenu'
import { SidebarShell } from '@/components/shared/SidebarShell'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarShell width="var(--sidebar-width)">
        {/* Brand */}
        <div className="px-5 py-4">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight"
            style={{ color: 'var(--color-brand)' }}
          >
            FollowCV
          </Link>
        </div>

        {/* Health score slot — wired up in Story 4.1; invisible until then */}
        <div data-testid="health-score-slot" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5" aria-label="Main navigation">
          <Link
            href="/board"
            className="flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-slate-100"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Board
          </Link>
          <Link
            href="/settings"
            className="flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-slate-100"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Settings
          </Link>
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
