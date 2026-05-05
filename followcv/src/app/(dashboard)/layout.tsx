import type { ReactNode } from 'react'
import Link from 'next/link'
import { UserMenu } from '@/components/shared/UserMenu'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="flex flex-col flex-shrink-0 border-r bg-surface border-border"
        style={{ width: 'var(--sidebar-width)' }}
      >
        {/* Health score slot — wired up in Story 4.1 */}
        <div
          data-testid="health-score-slot"
          className="p-4 border-b border-border"
        />

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1" aria-label="Main navigation">
          <Link
            href="/board"
            className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-text-secondary transition-colors hover:bg-slate-100"
          >
            Board
          </Link>
          <Link
            href="/settings"
            className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-text-secondary transition-colors hover:bg-slate-100"
          >
            Settings
          </Link>
        </nav>

        {/* User menu */}
        <div className="p-4 border-t border-border">
          <UserMenu />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
