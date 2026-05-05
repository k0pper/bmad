"use client"

import { useState } from "react"

export function SidebarShell({
  children,
  width,
}: {
  children: React.ReactNode
  width: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger button — only visible below md */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-md bg-surface border border-border"
        aria-label="Open navigation"
      >
        <span className="block w-5 h-0.5 bg-current mb-1" />
        <span className="block w-5 h-0.5 bg-current mb-1" />
        <span className="block w-5 h-0.5 bg-current" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          flex flex-col flex-shrink-0 border-r bg-surface border-border
          fixed md:static inset-y-0 left-0 z-40
          transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{ width }}
        aria-label="Sidebar"
      >
        {/* Close button on mobile */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-3 right-3 p-1 rounded text-sm"
          aria-label="Close navigation"
        >
          ✕
        </button>

        {children}
      </aside>
    </>
  )
}
